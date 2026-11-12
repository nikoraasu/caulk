/**
 * Live collaboration integration test: three clients plus one client with a
 * wrong passphrase share a room through an in-process HTTP polling relay that
 * implements the protocol of public/api/signal.php (in memory, random port).
 *
 * Covers element sync both ways, pointer awareness, late-joiner catch-up via
 * the hello handshake, passphrase isolation and departure detection.
 */

import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as Y from "yjs";
import { getLiveRoomName, LiveSession } from "../src/sync/live";
import { SceneBridge } from "../src/crdt/scene";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Collaborator } from "@excalidraw/excalidraw/types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const target = {
  owner: "nikolas",
  repo: "boards",
  branch: "main",
  path: "boards/test-fixed-suite.slate",
};
const PASSPHRASE = "correct-horse-battery-staple";
const WRONG_PASSPHRASE = "not-the-right-passphrase";

/** Polls `pred` until it returns true or `timeoutMs` elapses. */
async function waitFor(pred: () => boolean, timeoutMs = 3000, label = "condition"): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await wait(50);
  }
}

// ---------------------------------------------------------------------------
// In-memory relay: same contract as public/api/signal.php
// ---------------------------------------------------------------------------

type RelayMessage = {
  seq: number;
  ts: number;
  from: string;
  kind: string;
  data: string;
  to?: string;
};
type RelayRoom = { seq: number; messages: RelayMessage[] };
type RelayWaiter = {
  room: string;
  since: number;
  res: http.ServerResponse;
  timer?: ReturnType<typeof setTimeout>;
};

const RETAIN_MS = 60_000;
const RETAIN_MAX = 300;
const WAIT_MS = 15_000;

function startRelay(): Promise<{ server: http.Server; relayUrl: string; release: () => void }> {
  const rooms = new Map<string, RelayRoom>();
  const waiters = new Set<RelayWaiter>();
  let released = false;

  const prune = (room: RelayRoom) => {
    const cutoff = Date.now() - RETAIN_MS;
    room.messages = room.messages.filter((m) => m.ts >= cutoff);
    if (room.messages.length > RETAIN_MAX) {
      room.messages = room.messages.slice(-RETAIN_MAX);
    }
  };

  const reply = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };

  const pollResult = (roomName: string, since: number) => {
    const room = rooms.get(roomName);
    if (!room) return { messages: [] as RelayMessage[], last: 0 };
    prune(room);
    const messages =
      since > room.seq ? room.messages : room.messages.filter((m) => m.seq > since);
    return { messages, last: room.seq };
  };

  const settle = (w: RelayWaiter) => {
    if (w.timer !== undefined) clearTimeout(w.timer);
    waiters.delete(w);
    reply(w.res, 200, pollResult(w.room, w.since));
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const action = url.searchParams.get("action");
    const roomName = url.searchParams.get("room") ?? "";

    if (req.method === "POST" && action === "publish") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          reply(res, 400, { ok: false, error: "invalid json" });
          return;
        }
        let room = rooms.get(roomName);
        if (!room) {
          room = { seq: 0, messages: [] };
          rooms.set(roomName, room);
        }
        const seq = ++room.seq;
        room.messages.push({
          seq,
          ts: Date.now(),
          from: body.from,
          kind: body.kind,
          data: body.data,
          ...(body.to ? { to: body.to } : {}),
        });
        prune(room);
        reply(res, 200, { ok: true, seq });
        for (const w of [...waiters]) if (w.room === roomName) settle(w);
      });
      return;
    }

    if (req.method === "GET" && action === "poll") {
      const since = Number(url.searchParams.get("since") ?? "0") || 0;
      const result = pollResult(roomName, since);
      // wait=1 mirrors signal.php: hold until a message arrives, at most 15s.
      if (url.searchParams.get("wait") !== "1" || result.messages.length > 0 || released) {
        reply(res, 200, result);
        return;
      }
      const waiter: RelayWaiter = { room: roomName, since, res };
      waiter.timer = setTimeout(() => settle(waiter), WAIT_MS);
      waiters.add(waiter);
      res.on("close", () => {
        if (!waiters.delete(waiter)) return;
        if (waiter.timer !== undefined) clearTimeout(waiter.timer);
      });
      return;
    }

    reply(res, 404, { ok: false, error: "unknown action" });
  });

  // Settles every held poll now and answers later polls at once, so teardown never waits on a 15s hold.
  const release = () => {
    released = true;
    for (const w of [...waiters]) settle(w);
  };

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, relayUrl: `http://127.0.0.1:${port}/`, release });
    });
  });
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

type Client = {
  name: string;
  bridge: SceneBridge;
  live: LiveSession;
  elements: Map<string, ExcalidrawElement>;
  collaborators: Map<string, Collaborator>;
  /** Every pointer x shown by onCollaboratorsChange, keyed by username. */
  pointerXs: Map<string, number[]>;
  getLatestPeers: () => Array<{
    name: string;
    presenting?: boolean;
    votingSessionId?: string | null;
    summon?: { id: string } | null;
    ping?: { id: string; x: number; y: number } | null;
  }>;
};

function createClient(name: string, passphrase: string, room: string, relayUrl: string): Client {
  const doc = new Y.Doc();
  const identity = { id: `user-${name.toLowerCase()}`, name };
  const elements = new Map<string, ExcalidrawElement>();
  const collaborators = new Map<string, Collaborator>();
  const pointerXs = new Map<string, number[]>();
  let latestPeers: Client["getLatestPeers"] extends () => infer R ? R : never = [];

  const bridge = new SceneBridge(doc, identity, (incoming) => {
    for (const el of incoming) elements.set(el.id, el);
  });
  const live = new LiveSession(room, {
    doc,
    target,
    passphrase,
    identity,
    relayUrl,
    onStatusChange: (status) => {
      latestPeers = status.peers;
    },
    onCollaboratorsChange: (next) => {
      collaborators.clear();
      next.forEach((c, key) => {
        collaborators.set(String(key), c);
        if (!c.pointer) return;
        const xs = pointerXs.get(c.username) ?? [];
        xs.push(c.pointer.x);
        pointerXs.set(c.username, xs);
      });
    },
  });
  return { name, bridge, live, elements, collaborators, pointerXs, getLatestPeers: () => latestPeers };
}

function makeNote(x: number, version = 1): ExcalidrawElement {
  const note: ExcalidrawElement = {
    id: "note-1",
    type: "rectangle",
    x,
    y: 100,
    width: 200,
    height: 150,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "#fff9b1",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 12345,
    version,
    versionNonce: version,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
  } as ExcalidrawElement;
  return note;
}

const hasCollaborator = (c: Client, username: string) =>
  [...c.collaborators.values()].some((col) => col.username === username);

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { server, relayUrl, release } = await startRelay();
  const clients: Client[] = [];
  let current = "setup";
  const step = (name: string) => {
    current = name;
    console.log(`-> ${name}`);
  };
  const pass = (name: string) => console.log(`ok  ${name}`);

  try {
    const room = await getLiveRoomName(target);

    step("1: element added in A reaches B");
    const a = createClient("Alice", PASSPHRASE, room, relayUrl);
    clients.push(a);
    const b = createClient("Bob", PASSPHRASE, room, relayUrl);
    clients.push(b);
    a.bridge.applyLocal([makeNote(100)]);
    // First wait covers PBKDF2 key derivation (600k iterations) for both sessions.
    await waitFor(() => b.elements.has("note-1"), 10_000, "B to receive note-1 from A");
    assert.equal(b.elements.get("note-1")?.x, 100, "B must see note-1 at x=100");
    pass("1: element added in A reaches B");

    step("2: edit in B reaches A");
    const current1 = b.elements.get("note-1")!;
    b.bridge.applyLocal([makeNote(150, current1.version + 1)]);
    await waitFor(() => a.elements.get("note-1")?.x === 150, 3000, "A to receive moved note-1");
    pass("2: edit in B reaches A");

    step("3: pointer awareness reaches B");
    a.live.updatePointer({ x: 10, y: 20, tool: "pointer" });
    await waitFor(
      () =>
        [...b.collaborators.values()].some(
          (col) => col.username === "Alice" && col.pointer?.x === 10 && col.pointer?.y === 20,
        ),
      3000,
      "B to see Alice's pointer at (10,20)",
    );
    pass("3: pointer awareness reaches B");

    step("4: late joiner C catches up via hello handshake");
    const c = createClient("Carol", PASSPHRASE, room, relayUrl);
    clients.push(c);
    await waitFor(() => c.elements.get("note-1")?.x === 150, 10_000, "C to receive note-1");
    pass("4: late joiner C catches up via hello handshake");

    step("5: wrong passphrase client never receives elements");
    const d = createClient("Mallory", WRONG_PASSPHRASE, room, relayUrl);
    clients.push(d);
    await wait(2000);
    assert.equal(d.elements.size, 0, "client with wrong passphrase must receive no elements");
    pass("5: wrong passphrase client never receives elements");

    step("6: A's departure is seen by B within 5s");
    a.live.destroy();
    await waitFor(() => !hasCollaborator(b, "Alice"), 5000, "B to drop Alice");
    pass("6: A's departure is seen by B within 5s");

    // A was destroyed in step 6, so the pointer check uses a fresh client with the same name.
    step("7: A's pointer trail reaches B and settles at x=90");
    const a2 = createClient("Alice", PASSPHRASE, room, relayUrl);
    clients.push(a2);
    await waitFor(() => hasCollaborator(b, "Alice"), 10_000, "B to see the new Alice");
    b.pointerXs.set("Alice", []);
    for (let i = 0; i < 10; i++) {
      a2.live.updatePointer({ x: i * 10, y: 0, tool: "pointer" });
      await wait(20);
    }
    await waitFor(
      () => {
        const xs = b.pointerXs.get("Alice") ?? [];
        return xs.length > 0 && xs[xs.length - 1] === 90;
      },
      3000,
      "B to show Alice's pointer settle at x=90",
    );
    const seen = new Set(b.pointerXs.get("Alice"));
    assert.ok(seen.size >= 5, `B must see at least 5 distinct pointer x values, saw ${seen.size}`);
    pass("7: A's pointer trail reaches B and settles at x=90");

    step("8: a crashed peer's ghost is not replayed to a fresh joiner");
    const e = createClient("Eve", PASSPHRASE, room, relayUrl);
    clients.push(e);
    e.live.updatePointer({ x: 5, y: 5, tool: "pointer" });
    await waitFor(() => hasCollaborator(b, "Eve"), 10_000, "B to see Eve");
    // Simulate a crash: stop every timer and the poll loop, but never call destroy(), so no goodbye goes out.
    const eLive = e.live as any;
    clearTimeout(eLive.pollTimer);
    clearTimeout(eLive.awarenessTimer);
    clearInterval(eLive.flushTimer);
    clearInterval(eLive.awarenessStore._checkInterval);
    eLive.disposed = true;
    const f = createClient("Frank", PASSPHRASE, room, relayUrl);
    clients.push(f);
    await waitFor(() => hasCollaborator(f, "Bob"), 10_000, "F to hear from B");
    const ghostEnd = Date.now() + 2000;
    while (Date.now() < ghostEnd) {
      assert.ok(!hasCollaborator(f, "Eve"), "fresh client F must never see crashed peer Eve");
      await wait(50);
    }
    pass("8: a crashed peer's ghost is not replayed to a fresh joiner");

    step("9: pagehide goodbye removes a peer within 1.5s");
    const g = createClient("Grace", PASSPHRASE, room, relayUrl);
    clients.push(g);
    g.live.updatePointer({ x: 7, y: 7, tool: "pointer" });
    await waitFor(() => hasCollaborator(b, "Grace"), 10_000, "B to see Grace");
    await waitFor(() => (g.live as any).goodbye !== null, 3000, "Grace's goodbye to be cached");
    (g.live as any).handlePageHide();
    await waitFor(() => !hasCollaborator(b, "Grace"), 1500, "B to drop Grace after pagehide goodbye");
    pass("9: pagehide goodbye removes a peer within 1.5s");

    step("10: summon, presenter, ping, and votingSession awareness propagate");
    {
      b.live.updatePresenting(true);
      b.live.updateVotingSession("vote-1");
      b.live.triggerSummon({ id: "sum-1", at: Date.now(), viewport: { scrollX: -120, scrollY: -80, zoom: 1.5 } });
      b.live.triggerPing({ id: "ping-1", x: 320, y: 480, at: Date.now() });

      const cLive = createClient("Carol", PASSPHRASE, room, relayUrl);
      clients.push(cLive);
      await waitFor(() => {
        const peer = cLive.getLatestPeers().find((p) => p.name === "Bob");
        return Boolean(
          peer?.presenting &&
            peer?.votingSessionId === "vote-1" &&
            peer?.summon?.id === "sum-1" &&
            peer?.ping?.id === "ping-1",
        );
      }, 10_000, "Carol to receive Bob's presenter, summon, ping, and voting awareness");
      pass("10: summon, presenter, ping, and votingSession awareness propagate");
    }

    console.log("all live collaboration checks passed");
  } catch (err) {
    console.error(`FAILED at step "${current}":`, err);
    await teardown(clients, server, release);
    process.exit(1);
  }

  await teardown(clients, server, release);
  process.exit(0);
}

async function teardown(clients: Client[], server: http.Server, release: () => void): Promise<void> {
  for (const c of clients) {
    c.live.destroy();
    c.bridge.dispose();
  }
  release();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

main();
