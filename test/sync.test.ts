/**
 * Integration test: two clients, one fake GitHub Contents API, real crypto and
 * real Yjs convergence. Run with `npm run test:integration`.
 */

import assert from "node:assert/strict";
import http from "node:http";
import * as Y from "yjs";

import { EncryptedStore } from "../src/storage/encrypted";
import { ConflictError, GitHubAdapter } from "../src/storage/github";
import { SyncEngine } from "../src/sync/engine";
import { SceneBridge } from "../src/crdt/scene";

type FileState = { bytes: Buffer; sha: string; etag: string; isLarge?: boolean };

const files = new Map<string, FileState>();
let shaCounter = 0;
const nextSha = () => `sha-${(shaCounter += 1)}`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };

  // Support /repos/:o/:r/git/blobs/:sha
  if (segments[3] === "git" && segments[4] === "blobs") {
    const sha = segments[5];
    const file = Array.from(files.values()).find((f) => f.sha === sha);
    if (!file) return json(404, { message: "Not Found" });
    if (req.headers.accept?.includes("application/vnd.github.raw")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(file.bytes);
    }
    return json(200, {
      sha: file.sha,
      size: file.bytes.length,
      content: file.bytes.toString("base64"),
      encoding: "base64",
    });
  }

  const path = segments.slice(4).join("/"); // /repos/:o/:r/contents/:path
  const key = path;

  if (req.method === "GET") {
    const file = files.get(key);
    if (!file) return json(404, { message: "Not Found" });
    if (req.headers["if-none-match"] === file.etag) {
      res.writeHead(304, { etag: file.etag });
      return res.end();
    }
    if (file.isLarge) {
      // Simulate GitHub Contents API behavior for files > 1 MB (encoding: none, no content)
      return json(
        200,
        {
          type: "file",
          encoding: "none",
          size: file.bytes.length,
          sha: file.sha,
          content: "",
        },
        { etag: file.etag },
      );
    }
    return json(
      200,
      {
        type: "file",
        encoding: "base64",
        size: file.bytes.length,
        sha: file.sha,
        content: file.bytes.toString("base64"),
      },
      { etag: file.etag },
    );
  }

  if (req.method === "PUT") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as { content: string; sha?: string };
      const current = files.get(key);
      if (current && current.sha !== body.sha) {
        return json(409, { message: "sha does not match" });
      }
      if (!current && body.sha) {
        return json(409, { message: "file does not exist" });
      }
      const bytes = Buffer.from(body.content, "base64");
      const sha = nextSha();
      files.set(key, { bytes, sha, etag: `"${sha}"` });
      return json(200, { content: { sha } });
    });
    return;
  }

  json(405, { message: "method not allowed" });
});

function makeClient(passphrase: string) {
  const adapter = new GitHubAdapter({
    token: "test",
    owner: "octo",
    repo: "boards",
    branch: "main",
    path: "boards/room.slate",
    apiBase: "http://127.0.0.1:8787",
  });
  return new EncryptedStore(adapter, passphrase);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise<void>((resolve) => server.listen(8787, "127.0.0.1", resolve));

  // Stub the bits of the DOM that SyncEngine touches.
  (globalThis as unknown as { document: unknown }).document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
  };

  // ---- 1. first save creates an encrypted envelope, no plaintext on the wire
  const storeA = makeClient("correct horse battery staple");
  assert.equal(await storeA.open(), null, "missing file should read as null");

  const docA = new Y.Doc();
  docA.getMap("elements").set("note-1", { id: "note-1", text: "secret plan" });
  await storeA.save(Y.encodeStateAsUpdate(docA));

  const onDisk = files.get("boards/room.slate");
  assert.ok(onDisk, "file should exist after save");
  const envelope = JSON.parse(onDisk!.bytes.toString("utf8"));
  assert.equal(envelope.v, 1);
  assert.equal(envelope.app, "caulk");
  assert.ok(envelope.kdf.salt && envelope.iv && envelope.data);
  assert.ok(!onDisk!.bytes.toString("utf8").includes("secret plan"), "plaintext leaked");
  console.log("ok  envelope written and encrypted");

  // ---- 2. a second client decrypts the same file
  const storeB = makeClient("correct horse battery staple");
  const bytesB = await storeB.open();
  assert.ok(bytesB);
  const docB = new Y.Doc();
  Y.applyUpdate(docB, bytesB!);
  assert.deepEqual(docB.getMap("elements").get("note-1"), { id: "note-1", text: "secret plan" });
  console.log("ok  second client decrypts");

  // ---- 3. wrong passphrase fails loudly
  const storeWrong = makeClient("wrong passphrase");
  await assert.rejects(() => storeWrong.open(), /Wrong passphrase/);
  console.log("ok  wrong passphrase rejected");

  // ---- 4. write race surfaces as ConflictError, then resolves on retry
  const racingA = makeClient("correct horse battery staple");
  await racingA.open();
  const racingB = makeClient("correct horse battery staple");
  await racingB.open();
  await racingB.save(new TextEncoder().encode("{}")); // B commits first
  await assert.rejects(
    async () => racingA.save(new TextEncoder().encode("{}")),
    (err: unknown) => err instanceof ConflictError,
  );
  await racingA.open(); // re-sync, then retry
  await racingA.save(new TextEncoder().encode("{}"));
  console.log("ok  write conflict detected and retried");

  // ---- 5. two live engines converge in both directions
  files.clear();
  const statusA: string[] = [];
  const statusB: string[] = [];

  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const engine1 = new SyncEngine({
    doc: doc1,
    store: makeClient("correct horse battery staple"),
    pollMs: 60,
    debounceMs: 40,
    onStatus: (s) => statusA.push(s.kind),
  });
  const engine2 = new SyncEngine({
    doc: doc2,
    store: makeClient("correct horse battery staple"),
    pollMs: 60,
    debounceMs: 40,
    onStatus: (s) => statusB.push(s.kind),
  });

  await engine1.start();
  await engine2.start();

  doc1.transact(() => doc1.getMap("elements").set("a", { id: "a" }), "local");
  await wait(1600);
  assert.deepEqual(doc2.getMap("elements").get("a"), { id: "a" }, "B should see A's note");
  console.log("ok  A -> B propagation");

  doc2.transact(() => doc2.getMap("elements").set("b", { id: "b" }), "local");
  await wait(1600);
  assert.deepEqual(doc1.getMap("elements").get("b"), { id: "b" }, "A should see B's note");
  console.log("ok  B -> A propagation");

  // concurrent edits to different notes, no lost writes
  doc1.transact(() => doc1.getMap("elements").set("a", { id: "a", x: 10 }), "local");
  doc2.transact(() => doc2.getMap("elements").set("b", { id: "b", x: 20 }), "local");
  await wait(2000);
  assert.deepEqual(doc1.getMap("elements").get("b"), { id: "b", x: 20 });
  assert.deepEqual(doc2.getMap("elements").get("a"), { id: "a", x: 10 });
  assert.equal(doc1.getMap("elements").size, 2);
  assert.equal(doc2.getMap("elements").size, 2);
  console.log("ok  concurrent edits merge without loss");

  // allowed nicknames whitelist test
  const bridgeA = new SceneBridge(doc1, { id: "dev-1", name: "Gordon" }, () => {});
  const bridgeRandom = new SceneBridge(doc1, { id: "dev-2", name: "stranger" }, () => {});
  assert.equal(bridgeA.isNicknameAllowed("Gordon"), true, "empty list allows anyone");
  assert.equal(bridgeA.isNicknameAllowed("stranger"), true, "empty list allows anyone");

  bridgeA.setAllowedNicknames(["gordon", "alyx"]);
  assert.deepEqual(bridgeA.getAllowedNicknames(), ["gordon", "alyx"]);
  assert.equal(bridgeA.isNicknameAllowed("Gordon"), true, "case-insensitive match allowed");
  assert.equal(bridgeA.isNicknameAllowed("ALYX"), true, "case-insensitive match allowed");
  assert.equal(bridgeA.isNicknameAllowed("stranger"), false, "unlisted nickname rejected");

  const blocked = bridgeRandom.applyLocal([{
    id: "hack-element",
    type: "rectangle",
    version: 1,
    versionNonce: 1,
    isDeleted: false,
  } as any]);
  assert.equal(blocked, false, "unauthorized nickname local apply must be rejected");
  assert.equal(doc1.getMap("elements").has("hack-element"), false, "doc must remain clean");
  console.log("ok  allowed nicknames whitelist gates mutations and protects doc");

  // element sanitization & recovery test (fixes "can't access property 'find', p.groupIds is undefined")
  const corruptedDoc = new Y.Doc();
  // Simulate an element stored without groupIds in Yjs (e.g. from an older version or corrupted payload)
  corruptedDoc.getMap("elements").set("legacy-video", {
    id: "legacy-video",
    type: "embeddable",
    link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    // groupIds deliberately undefined/missing!
  });
  corruptedDoc.getArray("order").push(["legacy-video"]);

  let receivedElements: any[] = [];
  const healingBridge = new SceneBridge(corruptedDoc, { id: "dev-3", name: "Alyx" }, (els) => {
    receivedElements = els;
  });
  healingBridge.hydrate();

  assert.equal(receivedElements.length, 1);
  const healed = receivedElements[0];
  assert.equal(Array.isArray(healed.groupIds), true, "groupIds must be an array");
  assert.deepEqual(healed.groupIds, [], "groupIds must default to empty array");
  assert.doesNotThrow(() => {
    // This is the exact check Excalidraw performs when clicking/hovering/selecting:
    const selectedGroupIds: Record<string, boolean> = {};
    healed.groupIds.find((id: string) => selectedGroupIds[id]);
  }, "Excalidraw groupIds.find must not throw");

  // Verify that the Yjs map was also healed in-place
  const inDoc = corruptedDoc.getMap("elements").get("legacy-video") as any;
  assert.equal(Array.isArray(inDoc.groupIds), true, "doc map must be repaired in-place");
  console.log("ok  corrupted/missing groupIds healed and protected from selection crashes");

  healingBridge.dispose();
  corruptedDoc.destroy();

  // Test retrieval of boards > 1 MB (bypasses GitHub Contents API 1 MB inline limit via Git Blobs API)
  const largeAdapter = new GitHubAdapter({
    token: "fake-token",
    owner: "fake-owner",
    repo: "fake-repo",
    branch: "main",
    path: "boards/large-board.slate",
    apiBase: "http://127.0.0.1:8787",
  });
  const largePayload = Buffer.from("super-large-crdt-board-data-simulating-over-1mb-payload");
  const largeSha = "sha-large-blob-999";
  files.set("boards/large-board.slate", {
    bytes: largePayload,
    sha: largeSha,
    etag: "etag-large",
    isLarge: true, // triggers encoding: "none" in mock contents API
  });

  const largeReadResult = await largeAdapter.read();
  assert.equal(largeReadResult.status, "ok");
  if (largeReadResult.status === "ok") {
    assert.deepEqual(largeReadResult.bytes, new Uint8Array(largePayload));
    assert.equal(largeReadResult.sha, largeSha);
  }
  console.log("ok  files larger than 1 MB fetched successfully via Git Blobs API fallback");

  engine1.stop();
  engine2.stop();
  doc1.destroy();
  doc2.destroy();

  server.close();
  console.log("\nall integration checks passed");
}

main().catch((err) => {
  console.error("FAILED:", err);
  server.close();
  process.exit(1);
});
