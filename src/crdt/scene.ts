/**
 * Bridges Excalidraw's element array to a Yjs document.
 *
 * Layout:
 *   elements : Y.Map<elementId, ExcalidrawElement>   keyed by id, so two people
 *              editing different shapes never touch the same CRDT cell
 *   order    : Y.Array<elementId>                    z-order
 *   meta     : Y.Map<elementId, ElementMeta>         who touched what, when
 *   settings : Y.Map<string, string>                 board-wide canvas settings
 *
 * Conflict granularity is one element. Two people editing the same sticky at
 * the same instant resolve last-writer-wins on that element, which is the same
 * promise Miro makes. Element identity comes from Excalidraw's own
 * `version`/`versionNonce` pair, so we never have to deep-diff anything.
 *
 * `meta` is what makes the async digest possible: it costs one small record per
 * element and lets us answer "what changed while I was gone" without diffing
 * whole snapshots.
 */

import * as Y from "yjs";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";

export function sanitizeElement<T extends ExcalidrawElement = ExcalidrawElement>(el: any): T {
  if (!el || typeof el !== "object") return el;
  return {
    ...el,
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : (el.boundElements ?? null),
    frameId: el.frameId ?? null,
    index: el.index ?? null,
    link: el.link ?? null,
    locked: Boolean(el.locked),
    isDeleted: Boolean(el.isDeleted),
    roundness: el.roundness ?? null,
    angle: typeof el.angle === "number" ? el.angle : 0,
    opacity: typeof el.opacity === "number" ? el.opacity : 100,
    roughness: typeof el.roughness === "number" ? el.roughness : 0,
    strokeWidth: typeof el.strokeWidth === "number" ? el.strokeWidth : 1,
    strokeStyle: el.strokeStyle || "solid",
    fillStyle: el.fillStyle || "solid",
    strokeColor: el.strokeColor || "#3B4438",
    backgroundColor: el.backgroundColor || "transparent",
    seed: typeof el.seed === "number" ? el.seed : 1,
    version: typeof el.version === "number" ? el.version : 1,
    versionNonce: typeof el.versionNonce === "number" ? el.versionNonce : 1,
    updated: typeof el.updated === "number" ? el.updated : Date.now(),
  } as T;
}

const ORIGIN_LOCAL = "local";

/** Don't rewrite attribution on every drag frame; once a second is plenty. */
const META_THROTTLE_MS = 1000;

const versionKey = (el: ExcalidrawElement): string => `${el.version}:${el.versionNonce}`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type Identity = { id: string; name: string };

/**
 * An image stored in the repo's assets dir instead of inline. `asset` is the
 * `caulk-asset:<sha>?type=<mime>` link (see storage/assets.ts).
 */
export type AssetFileRef = { id: string; mimeType: string; created: number; asset: string };

const isInlineFile = (f: BinaryFileData | AssetFileRef): f is BinaryFileData =>
  Boolean(f && "dataURL" in f && f.dataURL);
const isAssetFile = (f: BinaryFileData | AssetFileRef): f is AssetFileRef =>
  Boolean(f && "asset" in f && typeof f.asset === "string" && f.asset);

export type ElementMeta = {
  /** Device id of the last writer. */
  by: string;
  /** Display name captured at write time. */
  name: string;
  /** Last change, ms epoch. */
  at: number;
  /** First appearance, ms epoch. */
  created: number;
  /** Tombstone: the element was removed. */
  deleted?: true;
};

export type Digest = {
  added: number;
  changed: number;
  removed: number;
  total: number;
  authors: Array<{ name: string; count: number }>;
};

export type TimerState = {
  running: boolean;
  durationSeconds: number;
  startedAt: number;
  startedBy: string;
};

export class SceneBridge {
  private readonly elements: Y.Map<ExcalidrawElement>;
  private readonly order: Y.Array<string>;
  private readonly meta: Y.Map<ElementMeta>;
  private readonly files: Y.Map<BinaryFileData | AssetFileRef>;
  private readonly allowedNicknames: Y.Array<string>;
  private readonly accessRequests: Y.Map<{ name: string; at: number }>;
  private readonly versions = new Map<string, string>();
  private muted = false;
  private disposed = false;
  private currentIdentity: Identity;

  /**
   * When set, new images are handed here instead of being written to Yjs as data
   * URLs. The caller uploads them and records the result with setFileAsset.
   */
  onLocalFiles?: (files: BinaryFileData[]) => void;

  constructor(
    private readonly doc: Y.Doc,
    identity: Identity,
    private readonly onRemote: (elements: ExcalidrawElement[]) => void,
    private readonly onRemoteFiles?: (files: BinaryFiles) => void,
  ) {
    this.currentIdentity = identity;
    this.elements = doc.getMap<ExcalidrawElement>("elements");
    this.order = doc.getArray<string>("order");
    this.meta = doc.getMap<ElementMeta>("meta");
    this.files = doc.getMap<BinaryFileData | AssetFileRef>("files");
    this.allowedNicknames = doc.getArray<string>("allowedNicknames");
    this.accessRequests = doc.getMap<{ name: string; at: number }>("accessRequests");
    this.elements.observe(this.handleRemoteChange);
    this.order.observe(this.handleRemoteChange);
    this.files.observe(this.handleRemoteFilesChange);
  }

  /** Inline images only (entries that carry a dataURL). */
  getFiles(): BinaryFiles {
    const out: BinaryFiles = {};
    for (const [id, f] of this.files.entries()) {
      if (f && f.id && isInlineFile(f)) out[id] = clone(f);
    }
    return out;
  }

  /** Images that live in the repo as assets. */
  getFileRefs(): AssetFileRef[] {
    const out: AssetFileRef[] = [];
    for (const f of this.files.values()) {
      if (f && f.id && isAssetFile(f)) out.push(clone(f));
    }
    return out;
  }

  /** Inline images that have not been moved to the repo yet. */
  getInlineFiles(): BinaryFileData[] {
    const out: BinaryFileData[] = [];
    for (const f of this.files.values()) {
      if (f && f.id && isInlineFile(f) && !isAssetFile(f)) out.push(clone(f));
    }
    return out;
  }

  /** Replace an inline entry (or add one) with a repo asset reference. */
  setFileAsset(ref: AssetFileRef): void {
    if (this.disposed) return;
    if (!this.isNicknameAllowed(this.currentIdentity.name)) return;
    this.doc.transact(() => {
      this.files.set(ref.id, clone(ref));
    }, ORIGIN_LOCAL);
  }

  updateIdentity(next: Identity): void {
    this.currentIdentity = next;
  }

  getAllowedNicknames(): string[] {
    return this.allowedNicknames.toArray();
  }

  setAllowedNicknames(names: string[]): void {
    const cleaned = Array.from(
      new Set(
        names
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    );
    this.doc.transact(() => {
      this.allowedNicknames.delete(0, this.allowedNicknames.length);
      if (cleaned.length > 0) {
        this.allowedNicknames.insert(0, cleaned);
      }
    }, ORIGIN_LOCAL);
  }

  isNicknameAllowed(name: string): boolean {
    const list = this.getAllowedNicknames();
    if (list.length === 0) return true;
    const norm = name.trim().toLowerCase();
    return list.some((allowed) => allowed.trim().toLowerCase() === norm);
  }

  observeAllowedNicknames(cb: (names: string[]) => void): () => void {
    const handler = () => {
      cb(this.getAllowedNicknames());
    };
    this.allowedNicknames.observe(handler);
    cb(this.getAllowedNicknames());
    return () => {
      this.allowedNicknames.unobserve(handler);
    };
  }

  getAccessRequests(): Array<{ name: string; at: number }> {
    return Array.from(this.accessRequests.values()).sort((a, b) => a.at - b.at);
  }

  requestAccess(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.doc.transact(() => {
      this.accessRequests.set(trimmed.toLowerCase(), { name: trimmed, at: Date.now() });
    }, ORIGIN_LOCAL);
  }

  approveAccess(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = this.getAllowedNicknames();
    if (!this.isNicknameAllowed(trimmed)) {
      this.setAllowedNicknames([...current, trimmed]);
    }
    this.doc.transact(() => {
      this.accessRequests.delete(trimmed.toLowerCase());
    }, ORIGIN_LOCAL);
  }

  denyAccess(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.doc.transact(() => {
      this.accessRequests.delete(trimmed.toLowerCase());
    }, ORIGIN_LOCAL);
  }

  observeAccessRequests(
    cb: (requests: Array<{ name: string; at: number }>) => void,
  ): () => void {
    const handler = () => {
      cb(this.getAccessRequests());
    };
    this.accessRequests.observe(handler);
    cb(this.getAccessRequests());
    return () => {
      this.accessRequests.unobserve(handler);
    };
  }

  getTimer(): TimerState | null {
    const raw = this.doc.getMap<TimerState>("timer").get("current");
    return raw ? clone(raw) : null;
  }

  setTimer(timer: TimerState | null): void {
    const map = this.doc.getMap<TimerState>("timer");
    this.doc.transact(() => {
      if (!timer) {
        map.delete("current");
      } else {
        map.set("current", timer);
      }
    }, ORIGIN_LOCAL);
  }

  observeTimer(cb: (timer: TimerState | null) => void): () => void {
    const map = this.doc.getMap<TimerState>("timer");
    const handler = () => {
      cb(this.getTimer());
    };
    map.observe(handler);
    cb(this.getTimer());
    return () => {
      map.unobserve(handler);
    };
  }

  /** Board-wide canvas background. Lives in the `settings` map, synced like the timer. */
  getViewBackground(): string | undefined {
    const raw = this.doc.getMap<string>("settings").get("viewBackgroundColor");
    return typeof raw === "string" ? raw : undefined;
  }

  setViewBackground(color: string): void {
    const map = this.doc.getMap<string>("settings");
    this.doc.transact(() => {
      if (map.get("viewBackgroundColor") !== color) map.set("viewBackgroundColor", color);
    }, ORIGIN_LOCAL);
  }

  /** Fires for changes that arrive from other peers only; local writes do not echo back. */
  observeViewBackground(cb: (color: string | undefined) => void): () => void {
    const map = this.doc.getMap<string>("settings");
    const handler = (_event: unknown, tx: Y.Transaction) => {
      if (this.disposed || tx.origin === ORIGIN_LOCAL) return;
      cb(this.getViewBackground());
    };
    map.observe(handler);
    return () => {
      map.unobserve(handler);
    };
  }

  /** Push the current document state into the editor. Used once at boot. */
  hydrate(
    existing: readonly ExcalidrawElement[] = [],
    initialAllowed?: string[],
  ): void {
    if (
      this.allowedNicknames.length === 0 &&
      initialAllowed &&
      initialAllowed.length > 0
    ) {
      this.setAllowedNicknames(initialAllowed);
    }

    // Repair any damaged or legacy elements already in Yjs doc (e.g. missing groupIds)
    this.doc.transact(() => {
      for (const [id, el] of this.elements.entries()) {
        if (!el || !Array.isArray(el.groupIds) || el.groupIds === undefined) {
          this.elements.set(id, sanitizeElement(el));
        }
      }
    }, ORIGIN_LOCAL);

    // Anything already drawn before hydration finished is folded into the doc.
    const knownIds = new Set(this.elements.keys());
    const additions = existing
      .filter((el) => !el.isDeleted && !knownIds.has(el.id))
      .map((el) => sanitizeElement(el));

    if (additions.length > 0) {
      this.muted = true;
      try {
        this.doc.transact(() => {
          for (const el of additions) {
            this.elements.set(el.id, clone(el));
            this.touch(el.id, true);
          }
          this.order.insert(this.order.length, additions.map((el) => el.id));
        }, ORIGIN_LOCAL);
      } finally {
        this.muted = false;
      }
    }

    const byId = new Map<string, ExcalidrawElement>();
    for (const el of additions) byId.set(el.id, sanitizeElement(clone(el)));
    for (const el of this.snapshot()) byId.set(el.id, sanitizeElement(el));

    const ordered: ExcalidrawElement[] = [];
    for (const id of this.orderedIds()) {
      const el = byId.get(id);
      if (el) ordered.push(sanitizeElement(el));
    }

    this.remember(ordered);
    this.onRemote(ordered);
  }

  /** Called from Excalidraw's onChange. Returns true when the doc was touched. */
  applyLocal(next: readonly ExcalidrawElement[], nextFiles?: BinaryFiles): boolean {
    if (this.muted || this.disposed) return false;
    if (!this.isNicknameAllowed(this.currentIdentity.name)) return false;

    const live = next.filter((el) => !el.isDeleted).map((el) => sanitizeElement(el));
    const ids = live.map((el) => el.id);
    const liveIds = new Set(ids);
    const prevOrder = this.order.toArray();
    const orderChanged =
      ids.length !== prevOrder.length || ids.some((id, i) => prevOrder[i] !== id);

    const changedElements: ExcalidrawElement[] = [];
    for (const el of live) {
      if (this.versions.get(el.id) !== versionKey(el)) changedElements.push(el);
    }
    const removed: string[] = [];
    for (const id of this.versions.keys()) {
      if (!liveIds.has(id)) removed.push(id);
    }

    const newFiles: BinaryFileData[] = [];
    if (nextFiles) {
      for (const [fId, fileData] of Object.entries(nextFiles)) {
        if (fileData && fileData.dataURL && !this.files.has(fId)) {
          newFiles.push(fileData);
        }
      }
    }

    // With a file uploader attached, images leave through onLocalFiles instead of Yjs.
    const hook = this.onLocalFiles;
    const inlineFiles = hook ? [] : newFiles;
    const handOff = hook && newFiles.length > 0 ? newFiles : null;

    if (
      !orderChanged &&
      changedElements.length === 0 &&
      removed.length === 0 &&
      inlineFiles.length === 0
    ) {
      if (hook && handOff) hook(handOff);
      return false;
    }

    this.muted = true;
    try {
      this.doc.transact(() => {
        for (const el of changedElements) {
          this.elements.set(el.id, clone(el));
          this.versions.set(el.id, versionKey(el));
          this.touch(el.id, false);
        }
        for (const id of removed) {
          this.elements.delete(id);
          this.versions.delete(id);
          this.bury(id);
        }
        if (orderChanged) {
          this.order.delete(0, this.order.length);
          this.order.insert(0, ids);
        }
        for (const f of inlineFiles) {
          this.files.set(f.id, clone(f));
        }
      }, ORIGIN_LOCAL);
    } finally {
      this.muted = false;
    }
    if (hook && handOff) hook(handOff);
    return true;
  }

  /** Replace the whole board, used when restoring a snapshot. */
  replaceAll(elements: readonly ExcalidrawElement[], previous: Map<string, ElementMeta>): void {
    const now = Date.now();
    this.muted = true;
    try {
      this.doc.transact(() => {
        for (const id of Array.from(this.elements.keys())) this.elements.delete(id);
        this.order.delete(0, this.order.length);
        for (const id of Array.from(this.meta.keys())) this.meta.delete(id);

        for (const rawEl of elements) {
          const el = sanitizeElement(rawEl);
          const before = previous.get(el.id);
          this.elements.set(el.id, clone(el));
          this.meta.set(el.id, {
            by: this.currentIdentity.id,
            name: this.currentIdentity.name,
            at: now,
            created: before?.created ?? now,
          });
        }
        this.order.insert(0, elements.map((el) => el.id));
      }, ORIGIN_LOCAL);
    } finally {
      this.muted = false;
    }

    const ordered = this.snapshot();
    this.remember(ordered);
    this.onRemote(ordered);
  }

  /** What changed on this board since `since`, ignoring this device's own edits. */
  digestSince(since: number): Digest {
    let added = 0;
    let changed = 0;
    let removed = 0;
    const authors = new Map<string, number>();

    for (const [id, record] of this.meta.entries()) {
      if (record.at <= since) continue;
      if (record.by === this.currentIdentity.id) continue;

      const exists = this.elements.has(id);
      if (record.deleted) {
        if (exists) continue;
        removed += 1;
      } else if (record.created > since) {
        added += 1;
      } else {
        changed += 1;
      }
      authors.set(record.name, (authors.get(record.name) ?? 0) + 1);
    }

    const sorted = Array.from(authors.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { added, changed, removed, total: added + changed + removed, authors: sorted };
  }

  metaSnapshot(): Map<string, ElementMeta> {
    const out = new Map<string, ElementMeta>();
    for (const [id, record] of this.meta.entries()) out.set(id, { ...record });
    return out;
  }

  elementCount(): number {
    return this.elements.size;
  }

  private touch(id: string, isNew: boolean): void {
    const now = Date.now();
    const prev = this.meta.get(id);
    if (!prev) {
      this.meta.set(id, { by: this.currentIdentity.id, name: this.currentIdentity.name, at: now, created: now });
      return;
    }
    if (prev.deleted) {
      this.meta.set(id, { by: this.currentIdentity.id, name: this.currentIdentity.name, at: now, created: prev.created });
      return;
    }
    if (isNew || now - prev.at >= META_THROTTLE_MS) {
      this.meta.set(id, {
        by: this.currentIdentity.id,
        name: this.currentIdentity.name,
        at: now,
        created: prev.created,
      });
    }
  }

  private bury(id: string): void {
    const now = Date.now();
    const prev = this.meta.get(id);
    this.meta.set(id, {
      by: this.currentIdentity.id,
      name: this.currentIdentity.name,
      at: now,
      created: prev?.created ?? now,
      deleted: true,
    });
  }

  private snapshot(): ExcalidrawElement[] {
    const out: ExcalidrawElement[] = [];
    for (const el of this.elements.values()) out.push(sanitizeElement(clone(el)));
    return out;
  }

  private orderedIds(): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of this.order.toArray()) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    for (const id of this.elements.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  }

  private remember(elements: readonly ExcalidrawElement[]): void {
    this.versions.clear();
    for (const el of elements) this.versions.set(el.id, versionKey(el));
  }

  private handleRemoteChange = (_event: unknown, tx: Y.Transaction): void => {
    if (this.disposed || this.muted || tx.origin === ORIGIN_LOCAL) return;

    const byId = new Map<string, ExcalidrawElement>();
    for (const [id, el] of this.elements.entries()) byId.set(id, sanitizeElement(clone(el)));

    const elements: ExcalidrawElement[] = [];
    for (const id of this.orderedIds()) {
      const el = byId.get(id);
      if (el) elements.push(sanitizeElement(el));
    }

    this.remember(elements);
    this.onRemote(elements);
  };

  private handleRemoteFilesChange = (_event: unknown, tx: Y.Transaction): void => {
    if (this.disposed || this.muted || tx.origin === ORIGIN_LOCAL) return;
    this.onRemoteFiles?.(this.getFiles());
  };

  dispose(): void {
    this.disposed = true;
    this.elements.unobserve(this.handleRemoteChange);
    this.order.unobserve(this.handleRemoteChange);
    this.files.unobserve(this.handleRemoteFilesChange);
  }
}
