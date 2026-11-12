/**
 * Real-time live collaboration lane for Slateboard, carried over a plain HTTP
 * polling relay (public/api/signal.php) instead of WebRTC.
 *
 * Every peer publishes end-to-end encrypted messages (AES-GCM, key derived from
 * the board passphrase) into a shared room and polls the room for everyone
 * else's messages. Kinds: "update" (Yjs document deltas), "awareness" (cursors,
 * names, selections) and "hello" (state vector, used to catch a newcomer up).
 * The relay only ever stores ciphertext.
 *
 * Polls are long polls while the tab is visible (the relay holds a request until
 * something arrives), so updates land without a fixed polling delay. Remote
 * cursors carry a short trail of timestamped samples which is replayed about
 * 120ms behind real time and interpolated per animation frame, so motion looks
 * continuous even though awareness is published at most every 50ms.
 *
 * The durable GitHub storage lane runs in parallel; if the relay is down the
 * session just reports disconnected and GitHub sync keeps the work safe.
 */

import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { SocketId } from "@excalidraw/excalidraw/types";
import type { Collaborator } from "@excalidraw/excalidraw/types";
import type { BoardTarget, Identity } from "../config";
import { PBKDF2_ITERATIONS, deriveKey } from "../crypto/envelope";
import { base64ToBytes, bytesToBase64, randomBytes } from "../lib/bytes";

export type CollaboratorColor = {
  stroke: string;
  background: string;
};

export const COLLABORATOR_COLORS: CollaboratorColor[] = [
  { stroke: "#e11d48", background: "#ffe4e6" }, // rose
  { stroke: "#d97706", background: "#fef3c7" }, // amber
  { stroke: "#059669", background: "#d1fae5" }, // emerald
  { stroke: "#0284c7", background: "#e0f2fe" }, // sky
  { stroke: "#6366f1", background: "#e0e7ff" }, // indigo
  { stroke: "#9333ea", background: "#f3e8ff" }, // purple
  { stroke: "#c026d3", background: "#fae8ff" }, // fuchsia
  { stroke: "#ea580c", background: "#ffedd5" }, // orange
  { stroke: "#0d9488", background: "#ccfbf1" }, // teal
];

export function colorForIdentity(id: string): CollaboratorColor {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length];
}

export type PeerSummon = {
  id: string;
  at: number;
  viewport: { scrollX: number; scrollY: number; zoom: number };
};

export type PeerPing = {
  id: string;
  x: number;
  y: number;
  at: number;
};

export type PeerUser = {
  clientId: number;
  id: string;
  name: string;
  color: CollaboratorColor;
  viewport?: { scrollX: number; scrollY: number; zoom: number };
  pointer?: { x: number; y: number };
  votingSessionId?: string | null;
  presenting?: boolean;
  summon?: PeerSummon | null;
  ping?: PeerPing | null;
};

export type LiveStatus = {
  connected: boolean;
  peersCount: number;
  webrtcPeersCount: number;
  bcPeersCount: number;
  peers: PeerUser[];
  clientId: number;
  peerClientIds: number[];
};

/**
 * Only one client per connected live room should commit snapshots to GitHub so
 * collaborators don't race into 409 conflicts. The peer with the lowest Yjs
 * awareness clientID wins; offline/solo clients always act as saver.
 */
export function isElectedSaver(
  connected: boolean,
  ownClientId: number,
  peerClientIds: readonly number[],
): boolean {
  if (!connected || peerClientIds.length === 0) return true;
  return peerClientIds.every((id) => ownClientId <= id);
}

export type LiveSessionOptions = {
  doc: Y.Doc;
  target: BoardTarget;
  passphrase: string;
  identity: Identity;
  isAllowed?: (nickname: string) => boolean;
  onStatusChange?: (status: LiveStatus) => void;
  onCollaboratorsChange?: (collaborators: Map<SocketId, Collaborator>) => void;
  relayUrl?: string;
};

type RelayKind = "update" | "awareness" | "hello";

type RelayMessage = {
  seq: number;
  ts: number;
  from: string;
  kind: RelayKind;
  data: string;
  to?: string;
};

type TrailSample = { x: number; y: number; t: number };

/** Receiver-side cursor history for one remote peer. */
type PeerTrail = {
  samples: TrailSample[];
  lastT: number;
  offsets: number[];
  offset: number;
  /** Adaptive replay delay: how late samples typically arrive beyond the fastest one. */
  delay: number;
  /** What we actually drew last frame; eased toward the replayed position. */
  display?: { x: number; y: number };
  lastFrame?: number;
};

const IV_BYTES = 12;
const FLUSH_INTERVAL_MS = 40;
const AWARENESS_THROTTLE_MS = 50;
const MAX_DATA_CHARS = 1.5 * 1024 * 1024;
const POLL_VISIBLE_MS = 300; // short-poll interval once long polling is abandoned
const POLL_HIDDEN_MS = 2000;
const POLL_BACKOFF_MAX_MS = 5000;
const LONG_POLL_MAX_STRIKES = 3;
const LONG_POLL_SLOW_MS = 20000;
const LONG_POLL_MIN_HOLD_MS = 1000; // an empty answer sooner than this means the relay ignored wait=1
const TRAIL_MAX_SAMPLES = 20; // samples carried by one awareness publish
const TRAIL_BUFFER_MAX = 100; // samples kept per remote peer
const TRAIL_OFFSET_WINDOW = 200;
const RENDER_DELAY_MIN_MS = 80;
const RENDER_DELAY_MAX_MS = 600;
const RENDER_DELAY_MARGIN_MS = 40;
const DISPLAY_EASE_MS = 45; // time constant for easing the drawn cursor toward the replayed one
const TRAIL_GAP_JUMP_MS = 1000;
const FRAME_FALLBACK_MS = 16;

function asBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function isTrailSample(value: unknown): value is TrailSample {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.x === "number" && typeof v.y === "number" && typeof v.t === "number";
}

function peersSignature(peers: PeerUser[]): string {
  return peers
    .map((p) =>
      [
        p.clientId,
        p.id,
        p.name,
        p.color.stroke,
        p.color.background,
        p.viewport ? `${p.viewport.scrollX},${p.viewport.scrollY},${p.viewport.zoom}` : "",
        p.votingSessionId ?? "",
        p.presenting ? "1" : "0",
        p.summon?.id ?? "",
        p.ping?.id ?? "",
      ].join("|"),
    )
    .join(";");
}

async function encryptPayload(key: CryptoKey, plain: Uint8Array): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuffer(iv) }, key, asBuffer(plain)),
  );
  const packed = new Uint8Array(IV_BYTES + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, IV_BYTES);
  return bytesToBase64(packed);
}

async function decryptPayload(key: CryptoKey, data: string): Promise<Uint8Array | null> {
  try {
    const packed = base64ToBytes(data);
    if (packed.length <= IV_BYTES) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBuffer(packed.subarray(0, IV_BYTES)) },
      key,
      asBuffer(packed.subarray(IV_BYTES)),
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

function defaultRelayUrl(): string {
  return typeof document !== "undefined"
    ? new URL("api/signal.php", document.baseURI).toString()
    : "api/signal.php";
}

export async function getLiveRoomName(target: BoardTarget): Promise<string> {
  const owner = target.owner.toLowerCase().trim();
  const repo = target.repo.toLowerCase().trim();
  const branch = (target.branch || "main").toLowerCase().trim();
  const path = target.path.toLowerCase().trim();
  const raw = `${owner}/${repo}/${branch}/${path}`;
  const msgBuffer = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `caulk-${hex.slice(0, 32)}`;
}

export class LiveSession {
  private readonly doc: Y.Doc;
  private readonly roomName: string;
  private readonly relayUrl: string;
  private readonly awarenessStore: Awareness;
  private readonly myFrom = crypto.randomUUID();
  private readonly onStatusChange?: (status: LiveStatus) => void;
  private readonly onCollaboratorsChange?: (collaborators: Map<SocketId, Collaborator>) => void;
  private readonly myColor: CollaboratorColor;
  private isAllowed?: (nickname: string) => boolean;
  private currentIdentity: Identity;
  private key: CryptoKey | null = null;
  private outbox: Uint8Array[] = [];
  private flushing = false;
  private flushRetryAt = 0;
  private flushTimer?: ReturnType<typeof setInterval>;
  private awarenessTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private since = 0;
  /** True until the first poll response: its awareness messages are replayed history. */
  private replayPending = true;
  /** Encrypted publish body that removes our awareness state; sent on pagehide or destroy. */
  private goodbye: string | null = null;
  private goodbyeGeneration = 0;
  private failureDelay = 0;
  private longPoll = true;
  private longPollStrikes = 0;
  private disposed = false;
  private connected = false;
  private peers: PeerUser[] = [];
  private peersSignature = "";
  /** Local pointer samples waiting for the next awareness publish. */
  private readonly trailBuffer: TrailSample[] = [];
  /** Remote cursor histories, keyed by awareness clientId. */
  private readonly trails = new Map<number, PeerTrail>();
  private collabDirty = false;
  private frameCancel?: () => void;

  constructor(roomName: string, opts: LiveSessionOptions) {
    this.doc = opts.doc;
    this.roomName = roomName;
    this.relayUrl = opts.relayUrl ?? defaultRelayUrl();
    this.onStatusChange = opts.onStatusChange;
    this.onCollaboratorsChange = opts.onCollaboratorsChange;
    this.isAllowed = opts.isAllowed;
    this.currentIdentity = opts.identity;
    this.myColor = colorForIdentity(opts.identity.id);

    this.awarenessStore = new Awareness(opts.doc);
    this.awarenessStore.setLocalStateField("user", {
      id: opts.identity.id,
      name: opts.identity.name,
      color: this.myColor,
    });

    this.awarenessStore.on("change", this.handleAwarenessEvent);
    this.awarenessStore.on("update", this.handleAwarenessUpdate);
    this.doc.on("update", this.handleDocUpdate);
    this.flushTimer = setInterval(this.flush, FLUSH_INTERVAL_MS);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.handlePageHide);

    this.emitStatus();
    void this.start(opts.passphrase);
  }

  get userColor(): CollaboratorColor {
    return this.myColor;
  }

  get awareness(): Awareness {
    return this.awarenessStore;
  }

  get clientId(): number {
    return this.awarenessStore.clientID;
  }

  get peerClientIds(): number[] {
    return this.peers.map((p) => p.clientId);
  }

  updateIdentity(identity: Identity): void {
    if (this.disposed) return;
    this.currentIdentity = identity;
    this.awarenessStore.setLocalStateField("user", {
      id: identity.id,
      name: identity.name,
      color: this.myColor,
    });
    this.handleAwarenessChange();
  }

  setIsAllowed(fn?: (nickname: string) => boolean): void {
    this.isAllowed = fn;
    this.handleAwarenessChange();
  }

  updatePointer(
    pointer: { x: number; y: number; tool: "pointer" | "laser" } | null,
    button: "down" | "up" = "up",
  ): void {
    if (this.disposed) return;
    if (this.isAllowed && !this.isAllowed(this.currentIdentity.name)) return;
    if (pointer) {
      this.trailBuffer.push({ x: pointer.x, y: pointer.y, t: Date.now() });
      if (this.trailBuffer.length > TRAIL_MAX_SAMPLES) this.trailBuffer.shift();
    } else {
      this.trailBuffer.length = 0;
    }
    this.awarenessStore.setLocalStateField("pointer", pointer);
    this.awarenessStore.setLocalStateField("button", button);
  }

  updateSelection(selectedElementIds: Record<string, boolean>): void {
    if (this.disposed) return;
    if (this.isAllowed && !this.isAllowed(this.currentIdentity.name)) return;
    this.awarenessStore.setLocalStateField("selectedElementIds", selectedElementIds);
  }

  updateViewport(viewport: { scrollX: number; scrollY: number; zoom: number }): void {
    if (this.disposed) return;
    this.awarenessStore.setLocalStateField("viewport", viewport);
  }

  updateVotingSession(votingSessionId: string | null): void {
    if (this.disposed) return;
    this.awarenessStore.setLocalStateField("votingSessionId", votingSessionId);
  }

  updatePresenting(presenting: boolean): void {
    if (this.disposed) return;
    this.awarenessStore.setLocalStateField("presenting", presenting);
  }

  triggerSummon(summon: PeerSummon | null): void {
    if (this.disposed) return;
    this.awarenessStore.setLocalStateField("summon", summon);
  }

  triggerPing(ping: PeerPing | null): void {
    if (this.disposed) return;
    this.awarenessStore.setLocalStateField("ping", ping);
  }

  /** Derives the room key, then announces ourselves and starts polling. */
  private async start(passphrase: string): Promise<void> {
    try {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.roomName)),
      );
      const key = await deriveKey(passphrase, digest.slice(0, 16), PBKDF2_ITERATIONS);
      if (this.disposed) return;
      this.key = key;
    } catch {
      return; // no key, no relay traffic; the session stays disconnected
    }
    void this.sendEncrypted("hello", Y.encodeStateVector(this.doc));
    this.sendAwareness();
    this.flush();
    this.schedulePoll(0);
  }

  private publishUrl(): string {
    return `${this.relayUrl}?action=publish&room=${encodeURIComponent(this.roomName)}`;
  }

  private async publish(kind: RelayKind, data: string, to?: string): Promise<boolean> {
    const payload = to
      ? { from: this.myFrom, kind, data, to }
      : { from: this.myFrom, kind, data };
    try {
      const res = await fetch(this.publishUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Encrypts and publishes. Returns false only when the publish failed (worth retrying). */
  private async sendEncrypted(kind: RelayKind, plain: Uint8Array, to?: string): Promise<boolean> {
    const key = this.key;
    if (!key) return false;
    try {
      const data = await encryptPayload(key, plain);
      if (data.length > MAX_DATA_CHARS) return true; // too big for the relay; GitHub sync covers it
      return await this.publish(kind, data, to);
    } catch {
      return false;
    }
  }

  private flush = (): void => {
    if (this.flushing || this.disposed || !this.key || this.outbox.length === 0) return;
    if (Date.now() < this.flushRetryAt) return;
    const merged = Y.mergeUpdates(this.outbox);
    this.outbox = [];
    this.flushing = true;
    void this.sendEncrypted("update", merged)
      .then((ok) => {
        // Relay down: hold the update and retry in 2s instead of every tick.
        this.flushRetryAt = ok ? 0 : Date.now() + 2000;
        if (!ok && !this.disposed) this.outbox.unshift(merged);
      })
      .finally(() => {
        this.flushing = false;
      });
  };

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this.disposed || origin === this) return;
    this.outbox.push(update);
  };

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (this.disposed || origin === this) return;
    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    if (!changed.includes(this.doc.clientID)) return;
    this.scheduleAwareness();
  };

  private scheduleAwareness(): void {
    if (this.awarenessTimer !== undefined) return;
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = undefined;
      this.sendAwareness();
    }, AWARENESS_THROTTLE_MS);
  }

  private sendAwareness(): void {
    if (this.disposed || !this.key) return;
    // The trail rides along as an extra field of our own state, not stored locally.
    const trail = this.trailBuffer.splice(0);
    const state = { ...(this.awarenessStore.getLocalState() ?? {}), trail };
    const update = encodeAwarenessUpdate(
      this.awarenessStore,
      [this.doc.clientID],
      new Map([[this.doc.clientID, state]]),
    );
    void this.sendEncrypted("awareness", update);
    this.cacheGoodbye();
  }

  /**
   * Precomputes the encrypted goodbye for the clock after our last awareness publish,
   * so pagehide and destroy can send it without waiting on async encryption.
   */
  private cacheGoodbye(): void {
    const key = this.key;
    if (!key) return;
    const clientId = this.doc.clientID;
    const clock = (this.awarenessStore.meta.get(clientId)?.clock ?? 0) + 1;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 1);
    encoding.writeVarUint(enc, clientId);
    encoding.writeVarUint(enc, clock);
    encoding.writeVarString(enc, "null");
    const generation = ++this.goodbyeGeneration;
    void encryptPayload(key, encoding.toUint8Array(enc))
      .then((data) => {
        // Only the newest goodbye may win; an older clock would be rejected by peers.
        if (generation !== this.goodbyeGeneration) return;
        this.goodbye = JSON.stringify({ from: this.myFrom, kind: "awareness", data });
      })
      .catch(() => {});
  }

  private sendGoodbye(): void {
    const body = this.goodbye;
    if (!body) return;
    fetch(this.publishUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  private handlePageHide = (): void => {
    this.sendGoodbye();
  };

  /**
   * A peer announced its state vector. Send it what it is missing, refresh our
   * awareness, and (for an undirected hello) ask it to send us its missing state.
   */
  private async handleHello(from: string, theirStateVector: Uint8Array, directed: boolean): Promise<void> {
    try {
      const diff = Y.encodeStateAsUpdate(this.doc, theirStateVector);
      await this.sendEncrypted("update", diff, from);
    } catch {
      // malformed state vector: ignore
    }
    this.sendAwareness();
    if (!directed) {
      await this.sendEncrypted("hello", Y.encodeStateVector(this.doc), from);
    }
  }

  private schedulePoll(delay: number): void {
    if (this.disposed) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined;
      void this.poll();
    }, delay);
  }

  /** Single-flight: the next poll is scheduled only after this one finishes. */
  private async poll(): Promise<void> {
    const useWait = this.longPoll && !isPageHidden();
    const started = Date.now();
    let ok = false;
    let received = 0;
    try {
      const waitParam = useWait ? "&wait=1" : "";
      const url = `${this.relayUrl}?action=poll&room=${encodeURIComponent(this.roomName)}&since=${this.since}${waitParam}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`poll failed: ${res.status}`);
      const data = (await res.json()) as { messages?: unknown; last?: unknown };
      if (!Array.isArray(data.messages) || typeof data.last !== "number") {
        throw new Error("poll response malformed");
      }
      ok = true;
      received = data.messages.length;
      const skipAwareness = this.replayPending;
      for (const m of data.messages as RelayMessage[]) {
        if (this.disposed) return;
        await this.handleRelayMessage(m, skipAwareness);
      }
      this.replayPending = false;
      this.since = data.last;
    } catch {
      ok = false;
    }

    if (useWait) {
      const elapsed = Date.now() - started;
      const strike = !ok || elapsed > LONG_POLL_SLOW_MS || (received === 0 && elapsed < LONG_POLL_MIN_HOLD_MS);
      this.noteLongPoll(strike);
    }

    if (ok) {
      this.failureDelay = 0;
      this.setConnected(true);
      this.schedulePoll(this.nextPollDelay());
    } else {
      this.failureDelay = Math.min(POLL_BACKOFF_MAX_MS, Math.max(500, this.failureDelay * 2));
      this.setConnected(false);
      this.schedulePoll(this.failureDelay);
    }
  }

  /** Counts long polls that failed or came back suspiciously; falls back to short polls for good. */
  private noteLongPoll(strike: boolean): void {
    if (!strike) {
      this.longPollStrikes = 0;
      return;
    }
    this.longPollStrikes += 1;
    if (!this.longPoll || this.longPollStrikes < LONG_POLL_MAX_STRIKES) return;
    this.longPoll = false;
    console.warn("live: relay long polling unavailable, falling back to short polls");
  }

  private nextPollDelay(): number {
    if (isPageHidden()) return POLL_HIDDEN_MS;
    return this.longPoll ? 0 : POLL_VISIBLE_MS;
  }

  private async handleRelayMessage(m: RelayMessage, skipAwareness = false): Promise<void> {
    const key = this.key;
    if (!key || !m || typeof m.from !== "string" || typeof m.data !== "string") return;
    if (m.from === this.myFrom) return;
    const directed = typeof m.to === "string";
    if (directed && m.to !== this.myFrom) return;
    // Awareness replayed from before we joined would resurrect peers who already left.
    if (skipAwareness && m.kind === "awareness") return;

    const plain = await decryptPayload(key, m.data);
    if (!plain) return;
    try {
      if (m.kind === "update") {
        Y.applyUpdate(this.doc, plain, this);
      } else if (m.kind === "awareness") {
        applyAwarenessUpdate(this.awarenessStore, plain, this);
        this.ingestTrails(Date.now());
      } else if (m.kind === "hello") {
        await this.handleHello(m.from, plain, directed);
      }
    } catch {
      // malformed payload: ignore
    }
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    this.emitStatus();
  }

  /** Appends each remote peer's new trail samples to its history and refreshes its clock offset. */
  private ingestTrails(now: number): void {
    this.awarenessStore.getStates().forEach((state, clientId) => {
      if (clientId === this.awarenessStore.clientID) return;
      const incoming: unknown = state.trail;
      if (!Array.isArray(incoming)) return;
      let trail = this.trails.get(clientId);
      for (const sample of incoming as unknown[]) {
        if (!isTrailSample(sample)) continue;
        if (trail && sample.t <= trail.lastT) continue;
        if (!trail) {
          trail = { samples: [], lastT: -Infinity, offsets: [], offset: 0, delay: RENDER_DELAY_MIN_MS };
          this.trails.set(clientId, trail);
        }
        const prev = trail.samples[trail.samples.length - 1];
        if (prev && sample.t - prev.t > TRAIL_GAP_JUMP_MS) trail.samples = []; // idle gap: jump, don't sweep
        trail.samples.push({ x: sample.x, y: sample.y, t: sample.t });
        if (trail.samples.length > TRAIL_BUFFER_MAX) trail.samples.shift();
        trail.lastT = sample.t;
        trail.offsets.push(now - sample.t);
        if (trail.offsets.length > TRAIL_OFFSET_WINDOW) trail.offsets.shift();
        trail.offset = Math.min(...trail.offsets);
      }
      if (trail && trail.offsets.length > 0) {
        // Jitter buffer: replay late enough that ~95% of samples have already arrived,
        // so the cursor never runs dry and then jumps when the next batch lands.
        const sorted = [...trail.offsets].sort((a, b) => a - b);
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
        const target = Math.min(
          RENDER_DELAY_MAX_MS,
          Math.max(RENDER_DELAY_MIN_MS, p95 - trail.offset + RENDER_DELAY_MARGIN_MS),
        );
        // Grow quickly, shrink slowly, so one fast batch doesn't starve the buffer.
        trail.delay = target > trail.delay ? target : trail.delay * 0.9 + target * 0.1;
      }
    });
  }

  /** Pointer for one remote peer at `now`: interpolated from its trail, or the raw field for old clients. */
  private renderPointer(
    clientId: number,
    raw: unknown,
    now: number,
  ): { pointer: Collaborator["pointer"]; trailed: boolean; active: boolean } {
    const pointer = (raw ?? undefined) as Collaborator["pointer"];
    const trail = this.trails.get(clientId);
    if (!trail) return { pointer, trailed: false, active: false };
    if (!pointer) {
      trail.samples = [];
      trail.display = undefined; // cursor left the canvas: reappear in place, no sweep
      return { pointer, trailed: false, active: false };
    }
    const s = trail.samples;
    if (s.length === 0) return { pointer, trailed: false, active: false };

    const renderTime = now - trail.offset - trail.delay;
    while (s.length > 2 && s[1].t <= renderTime) s.shift();
    const last = s[s.length - 1];
    let x: number;
    let y: number;
    let active: boolean;
    if (renderTime >= last.t) {
      x = last.x;
      y = last.y;
      active = false;
    } else if (renderTime <= s[0].t) {
      x = s[0].x;
      y = s[0].y;
      active = true;
    } else {
      const a = s[0];
      const b = s[1];
      const f = (renderTime - a.t) / (b.t - a.t);
      x = a.x + (b.x - a.x) * f;
      y = a.y + (b.y - a.y) * f;
      active = true;
    }

    // Ease the drawn cursor toward the replayed position so any leftover hiccup glides
    // instead of teleporting.
    const dt = trail.lastFrame === undefined ? FRAME_FALLBACK_MS : Math.min(100, now - trail.lastFrame);
    trail.lastFrame = now;
    if (!trail.display) {
      trail.display = { x, y };
    } else {
      const k = 1 - Math.exp(-dt / DISPLAY_EASE_MS);
      trail.display.x += (x - trail.display.x) * k;
      trail.display.y += (y - trail.display.y) * k;
      if (Math.abs(x - trail.display.x) < 0.5 && Math.abs(y - trail.display.y) < 0.5) {
        trail.display.x = x;
        trail.display.y = y;
      } else {
        active = true;
      }
    }
    return { pointer: { x: trail.display.x, y: trail.display.y, tool: pointer.tool }, trailed: true, active };
  }

  /** Builds the peer list and collaborator map from the awareness states at `now`. */
  private buildView(now: number): {
    peers: PeerUser[];
    collaborators: Map<SocketId, Collaborator>;
    active: boolean;
    trailed: boolean;
  } {
    const states = this.awarenessStore.getStates();
    const collaborators = new Map<SocketId, Collaborator>();
    const peers: PeerUser[] = [];
    let active = false;
    let trailed = false;

    states.forEach((state, clientId) => {
      if (clientId === this.awarenessStore.clientID) return;
      const user = state.user as
        | { id?: string; name?: string; color?: CollaboratorColor }
        | undefined;
      if (!user || !user.name) return;

      // Filter out unauthorized nicknames if whitelist active
      if (this.isAllowed && !this.isAllowed(user.name)) {
        return;
      }

      const rendered = this.renderPointer(clientId, state.pointer, now);
      if (rendered.active) active = true;
      if (rendered.trailed) trailed = true;

      const color = user.color ?? colorForIdentity(user.id ?? String(clientId));
      peers.push({
        clientId,
        id: user.id ?? String(clientId),
        name: user.name ?? "Anonymous",
        color,
        viewport: state.viewport as { scrollX: number; scrollY: number; zoom: number } | undefined,
        pointer: state.pointer as { x: number; y: number } | undefined,
        votingSessionId:
          typeof state.votingSessionId === "string" ? state.votingSessionId : null,
        presenting: Boolean(state.presenting),
        summon: (state.summon as PeerSummon | null | undefined) ?? null,
        ping: (state.ping as PeerPing | null | undefined) ?? null,
      });

      collaborators.set(String(clientId) as unknown as SocketId, {
        pointer: rendered.pointer,
        button: state.button ?? "up",
        selectedElementIds: state.selectedElementIds ?? {},
        username: user.name ?? "Anonymous",
        color,
        id: user.id ?? String(clientId),
        socketId: String(clientId) as unknown as SocketId,
      });
    });

    for (const clientId of [...this.trails.keys()]) {
      if (!states.has(clientId)) this.trails.delete(clientId);
    }

    return { peers, collaborators, active, trailed };
  }

  /** Cheap path for awareness changes: refresh the peer list, schedule a frame for the map. */
  private handleAwarenessChange = (): void => {
    if (this.disposed) return;
    this.collabDirty = true;
    const view = this.buildView(Date.now());
    const signature = peersSignature(view.peers);
    if (signature !== this.peersSignature) {
      this.peersSignature = signature;
      this.peers = view.peers;
      this.emitStatus();
    }
    this.scheduleFrame();
  };

  private handleAwarenessEvent = (changes: { added: number[]; updated: number[]; removed: number[] }): void => {
    const own = this.awarenessStore.clientID;
    const touched = [...changes.added, ...changes.updated, ...changes.removed];
    if (touched.every((id) => id === own)) return; // our own state is never shown to us
    this.handleAwarenessChange();
  };

  private scheduleFrame(): void {
    if (this.disposed || this.frameCancel) return;
    if (typeof requestAnimationFrame === "function") {
      const id = requestAnimationFrame(() => this.renderFrame());
      this.frameCancel = () => cancelAnimationFrame(id);
    } else {
      const id = setTimeout(() => this.renderFrame(), FRAME_FALLBACK_MS);
      this.frameCancel = () => clearTimeout(id);
    }
  }

  /** One animation frame: emit the collaborator map, and keep going while any cursor is still moving. */
  private renderFrame = (): void => {
    this.frameCancel = undefined;
    if (this.disposed) return;
    const wasDirty = this.collabDirty;
    this.collabDirty = false;
    const view = this.buildView(Date.now());
    if (wasDirty || view.trailed) {
      this.onCollaboratorsChange?.(view.collaborators);
    }
    if (view.active) this.scheduleFrame();
  };

  private emitStatus(): void {
    if (this.disposed) return;
    this.onStatusChange?.({
      connected: this.connected,
      peersCount: this.peers.length,
      webrtcPeersCount: 0,
      bcPeersCount: 0,
      peers: this.peers,
      clientId: this.awarenessStore.clientID,
      peerClientIds: this.peers.map((p) => p.clientId),
    });
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.flushTimer !== undefined) clearInterval(this.flushTimer);
    if (this.awarenessTimer !== undefined) clearTimeout(this.awarenessTimer);
    if (this.pollTimer !== undefined) clearTimeout(this.pollTimer);
    this.frameCancel?.();
    this.frameCancel = undefined;

    this.awarenessStore.off("change", this.handleAwarenessEvent);
    this.awarenessStore.off("update", this.handleAwarenessUpdate);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.handlePageHide);
    const clientId = this.doc.clientID;
    removeAwarenessStates(this.awarenessStore, [clientId], "destroy");

    const key = this.key;
    if (this.goodbye) {
      this.sendGoodbye();
    } else if (key) {
      const update = encodeAwarenessUpdate(this.awarenessStore, [clientId]);
      void encryptPayload(key, update)
        .then((data) =>
          fetch(this.publishUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: this.myFrom, kind: "awareness", data }),
            keepalive: true,
            cache: "no-store",
          }),
        )
        .catch(() => {});
    }

    this.doc.off("update", this.handleDocUpdate);
    this.awarenessStore.destroy();
  }
}
