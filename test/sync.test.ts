/**
 * Integration test: two clients, one fake GitHub Contents API, real crypto and
 * real Yjs convergence. Run with `npm run test:integration`.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import * as Y from "yjs";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import { AssetStore, assetRefFor, assetsDirFor, legacyAssetsDirFor, parseAssetRef } from "../src/storage/assets";
import { EncryptedStore } from "../src/storage/encrypted";
import { ConflictError, GitHubAdapter } from "../src/storage/github";
import { rekeyBoard } from "../src/storage/rekey";
import { SyncEngine } from "../src/sync/engine";
import { SceneBridge } from "../src/crdt/scene";
import { ImageAssetSync } from "../src/sync/imageAssets";

type FileState = { bytes: Buffer; sha: string; etag: string; isLarge?: boolean };

const files = new Map<string, FileState>();
let shaCounter = 0;
const nextSha = () => `sha-${(shaCounter += 1)}`;

// Git Data API state: the branch head, plus the commits, trees and blobs made through it.
let gitCounter = 0;
const nextGitSha = (kind: string) => `git-${kind}-${(gitCounter += 1)}`;
const gitCommits = new Map<string, { tree: string; parents: string[] }>();
const gitTrees = new Map<string, Array<{ path: string; sha: string }>>();
const gitBlobs = new Map<string, Buffer>();
let gitHead = nextGitSha("commit");
gitCommits.set(gitHead, { tree: nextGitSha("tree"), parents: [] });

// A Contents API write also lands as a commit, so the branch head moves with it.
const advanceGitHead = () => {
  const tree = gitCommits.get(gitHead)!.tree;
  const sha = nextGitSha("commit");
  gitCommits.set(sha, { tree, parents: [gitHead] });
  gitHead = sha;
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };

  // Git Data API routes used by commitFiles. GET blobs/:sha falls through to the block below.
  if (segments[3] === "git") {
    const kind = segments[4];
    if (req.method === "GET" && kind === "ref") {
      return json(200, { ref: "refs/heads/main", object: { sha: gitHead, type: "commit" } });
    }
    if (req.method === "GET" && kind === "commits") {
      const commit = gitCommits.get(segments[5]);
      if (!commit) return json(404, { message: "Not Found" });
      return json(200, { sha: segments[5], tree: { sha: commit.tree } });
    }
    if (req.method === "POST" || req.method === "PATCH") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}") as {
          content?: string;
          tree?: Array<{ path: string; sha: string }> | string;
          parents?: string[];
          sha?: string;
        };
        if (req.method === "POST" && kind === "blobs") {
          const sha = nextGitSha("blob");
          gitBlobs.set(sha, Buffer.from(body.content ?? "", "base64"));
          return json(201, { sha });
        }
        if (req.method === "POST" && kind === "trees") {
          const sha = nextGitSha("tree");
          gitTrees.set(sha, body.tree as Array<{ path: string; sha: string }>);
          return json(201, { sha });
        }
        if (req.method === "POST" && kind === "commits") {
          const sha = nextGitSha("commit");
          gitCommits.set(sha, { tree: body.tree as string, parents: body.parents ?? [] });
          return json(201, { sha });
        }
        if (req.method === "PATCH" && kind === "refs") {
          // Only a fast-forward from the current head lands, as on GitHub with force: false.
          const commit = body.sha ? gitCommits.get(body.sha) : undefined;
          if (!commit || commit.parents[0] !== gitHead) {
            return json(422, { message: "Update is not a fast forward" });
          }
          for (const entry of gitTrees.get(commit.tree) ?? []) {
            const bytes = gitBlobs.get(entry.sha);
            if (!bytes) continue;
            files.set(entry.path, { bytes, sha: entry.sha, etag: `"${entry.sha}"` });
          }
          gitHead = body.sha!;
          return json(200, { object: { sha: gitHead } });
        }
        json(404, { message: "Not Found" });
      });
      return;
    }
  }

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
    if (!file) {
      // Directory listing, like the Contents API returns for a folder path.
      const prefix = `${key}/`;
      const entries = Array.from(files.entries())
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
        .map(([p, f]) => ({ type: "file", name: p.slice(prefix.length), size: f.bytes.length, sha: f.sha }));
      if (entries.length > 0) return json(200, entries);
      return json(404, { message: "Not Found" });
    }
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
      advanceGitHead();
      return json(200, { content: { sha } });
    });
    return;
  }

  json(405, { message: "method not allowed" });
});

function makeAdapter() {
  return new GitHubAdapter({
    token: "test",
    owner: "octo",
    repo: "boards",
    branch: "main",
    path: "boards/room.slate",
    apiBase: "http://127.0.0.1:8787",
  });
}

function makeClient(passphrase: string) {
  return new EncryptedStore(makeAdapter(), passphrase);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(check: () => boolean, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out waiting for condition");
    await wait(20);
  }
}

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

  // images: moved to repo assets, and a peer gets the same dataURL back
  {
  const passphrase = "correct horse battery staple";
  const imageBytes = randomBytes(300);
  const imageDataURL = `data:image/png;base64,${imageBytes.toString("base64")}`;
  const imageFile = (id: string) =>
    ({ id, mimeType: "image/png", created: 1, dataURL: imageDataURL }) as any as BinaryFileData;
  const imageElement = (id: string, fileId: string) =>
    ({
      id,
      type: "image",
      fileId,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      status: "saved",
      scale: [1, 1],
      groupIds: [],
    }) as any;

  const fileIdA = "image-file-a";
  const docA = new Y.Doc();
  const bridgeA = new SceneBridge(docA, { id: "dev-a", name: "Ada" }, () => {});
  const addedA: BinaryFileData[] = [];
  const syncA = new ImageAssetSync({
    bridge: bridgeA,
    store: new AssetStore(makeAdapter(), passphrase, "boards/room.slate"),
    boardKey: "board-a",
    addFiles: (fs) => addedA.push(...fs),
  });
  syncA.start();
  bridgeA.applyLocal([imageElement("img-a", fileIdA)], { [fileIdA]: imageFile(fileIdA) });

  await waitUntil(() => {
    const v = docA.getMap("files").get(fileIdA) as any;
    return Boolean(v?.asset && !v.dataURL);
  });
  const refA = docA.getMap("files").get(fileIdA) as any;
  const parsedA = parseAssetRef(refA.asset);
  assert.ok(parsedA, "files entry should hold an asset ref");
  const assetPath = `${assetsDirFor("boards/room.slate")}/${parsedA!.sha}.bin`;
  assert.ok(files.has(assetPath), "asset should be written to the repo");
  assert.ok(
    !files.get(assetPath)!.bytes.toString("utf8").includes(imageBytes.toString("base64")),
    "asset must be encrypted",
  );

  const inlineDoc = new Y.Doc();
  new SceneBridge(inlineDoc, { id: "dev-a", name: "Ada" }, () => {}).applyLocal(
    [imageElement("img-a", fileIdA)],
    { [fileIdA]: imageFile(fileIdA) },
  );
  const refSize = Y.encodeStateAsUpdate(docA).length;
  const inlineSize = Y.encodeStateAsUpdate(inlineDoc).length;
  assert.ok(
    inlineSize - refSize > imageDataURL.length / 2,
    `doc with asset ref should be much smaller (${refSize} vs ${inlineSize} bytes)`,
  );

  syncA.resolveRefs();
  await wait(200);
  assert.equal(addedA.length, 0, "uploader should not re-download its own image");
  console.log("ok  image stored as repo asset, doc shrinks, uploader does not re-download");

  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  const addedB: BinaryFileData[] = [];
  const syncB = new ImageAssetSync({
    bridge: new SceneBridge(docB, { id: "dev-b", name: "Bob" }, () => {}),
    store: new AssetStore(makeAdapter(), passphrase, "boards/room.slate"),
    boardKey: "board-b",
    addFiles: (fs) => addedB.push(...fs),
  });
  syncB.start();
  await waitUntil(() => addedB.length > 0);
  assert.equal(addedB[0].id, fileIdA);
  assert.equal(addedB[0].dataURL, imageDataURL, "peer should get the same dataURL back");
  console.log("ok  peer resolves asset ref back to the original image");

  const fileIdM = "image-file-m";
  const docM = new Y.Doc();
  const bridgeM = new SceneBridge(docM, { id: "dev-m", name: "Mo" }, () => {});
  bridgeM.applyLocal([imageElement("img-m", fileIdM)], { [fileIdM]: imageFile(fileIdM) });
  assert.ok((docM.getMap("files").get(fileIdM) as any).dataURL, "legacy entry should start inline");
  const syncM = new ImageAssetSync({
    bridge: bridgeM,
    store: new AssetStore(makeAdapter(), passphrase, "boards/room.slate"),
    boardKey: "board-m",
    addFiles: () => {},
  });
  syncM.start();
  await waitUntil(() => {
    const v = docM.getMap("files").get(fileIdM) as any;
    return Boolean(v?.asset && !v.dataURL);
  });
  assert.ok(
    parseAssetRef((docM.getMap("files").get(fileIdM) as any).asset),
    "migrated entry should be an asset ref",
  );
  console.log("ok  inline image migrated to a repo asset");

  syncA.dispose();
  syncB.dispose();
  syncM.dispose();
  bridgeA.dispose();
  bridgeM.dispose();
  docA.destroy();
  docB.destroy();
  docM.destroy();
  inlineDoc.destroy();
  }

  // ---- 6. rekey moves the board, its per-board assets and its history to the new password
  {
    const oldPass = "old board password";
    const newPass = "new board password";
    const boardPath = "boards/rekey-test.caulk";
    const docR = new Y.Doc();
    docR.getMap("elements").set("note-r", { id: "note-r", text: "rekey me" });
    await new EncryptedStore(makeAdapter().clone(boardPath), oldPass).save(Y.encodeStateAsUpdate(docR));

    const assetBytes = randomBytes(64);
    const assetRef = await new AssetStore(makeAdapter(), oldPass, boardPath).put(assetBytes, "image/png", {
      cacheObjectUrl: false,
    });
    const historyPath = "boards/.history/rekey-test/snap-1.bin";
    await new EncryptedStore(makeAdapter().clone(historyPath), oldPass).save(new TextEncoder().encode('{"snap":1}'));

    await rekeyBoard({ adapter: makeAdapter(), boardPath, oldPassphrase: oldPass, newPassphrase: newPass });

    const reopened = await new EncryptedStore(makeAdapter().clone(boardPath), newPass).open();
    assert.ok(reopened, "board should open with the new password");
    const docR2 = new Y.Doc();
    Y.applyUpdate(docR2, reopened!);
    assert.deepEqual(docR2.getMap("elements").get("note-r"), { id: "note-r", text: "rekey me" });
    await assert.rejects(
      () => new EncryptedStore(makeAdapter().clone(boardPath), oldPass).open(),
      /Wrong passphrase/,
    );

    const got = await new AssetStore(makeAdapter(), newPass, boardPath).get(assetRef);
    assert.deepEqual(Buffer.from(got.bytes), Buffer.from(assetBytes));
    assert.equal(got.mime, "image/png");
    await assert.rejects(() => new AssetStore(makeAdapter(), oldPass, boardPath).get(assetRef));

    const history = await new EncryptedStore(makeAdapter().clone(historyPath), newPass).open();
    assert.equal(new TextDecoder().decode(history!), '{"snap":1}');
    await assert.rejects(
      () => new EncryptedStore(makeAdapter().clone(historyPath), oldPass).open(),
      /Wrong passphrase/,
    );
    console.log("ok  rekey moves board, per-board asset and history to the new password");
  }

  // ---- 7. legacy shared-dir assets: readable before rekey, copied per board by rekey
  {
    const oldPass = "legacy board password";
    const newPass = "legacy board new password";
    const boardPath = "boards/rekey-legacy.caulk";
    const mime = "image/png";
    // Same framing AssetStore writes: [u32 BE header length][JSON header][bytes].
    const framed = (bytes: Uint8Array) => {
      const header = new TextEncoder().encode(JSON.stringify({ v: 1, mime }));
      const out = new Uint8Array(4 + header.length + bytes.length);
      new DataView(out.buffer).setUint32(0, header.length);
      out.set(header, 4);
      out.set(bytes, 4 + header.length);
      return out;
    };

    const ownBytes = randomBytes(48);
    const ownSha = createHash("sha256").update(ownBytes).digest("hex");
    const ownLegacyPath = `${legacyAssetsDirFor(boardPath)}/${ownSha}.bin`;
    await new EncryptedStore(makeAdapter().clone(ownLegacyPath), oldPass).save(framed(ownBytes));

    // A legacy file that belongs to another board, under a different password.
    const foreignBytes = randomBytes(32);
    const foreignSha = createHash("sha256").update(foreignBytes).digest("hex");
    const foreignLegacyPath = `${legacyAssetsDirFor(boardPath)}/${foreignSha}.bin`;
    await new EncryptedStore(makeAdapter().clone(foreignLegacyPath), "someone else's password").save(framed(foreignBytes));

    const ownRef = assetRefFor(ownSha, mime);
    const foreignRef = assetRefFor(foreignSha, mime);
    const docL = new Y.Doc();
    docL.getMap("files").set("file-own", { id: "file-own", asset: ownRef, mimeType: mime });
    docL.getMap("files").set("file-foreign", { id: "file-foreign", asset: foreignRef, mimeType: mime });
    await new EncryptedStore(makeAdapter().clone(boardPath), oldPass).save(Y.encodeStateAsUpdate(docL));

    const before = await new AssetStore(makeAdapter(), oldPass, boardPath).get(ownRef);
    assert.deepEqual(Buffer.from(before.bytes), Buffer.from(ownBytes));

    await rekeyBoard({ adapter: makeAdapter(), boardPath, oldPassphrase: oldPass, newPassphrase: newPass });

    const perBoardOwn = `${assetsDirFor(boardPath)}/${ownSha}.bin`;
    assert.ok(files.has(perBoardOwn), "referenced legacy asset should get a per-board copy");
    assert.ok(files.has(ownLegacyPath), "legacy file should stay in place");
    assert.ok(
      !files.has(`${assetsDirFor(boardPath)}/${foreignSha}.bin`),
      "legacy file under another password must be skipped",
    );
    const after = await new AssetStore(makeAdapter(), newPass, boardPath).get(ownRef);
    assert.deepEqual(Buffer.from(after.bytes), Buffer.from(ownBytes));
    assert.equal(after.mime, mime);
    console.log("ok  referenced legacy asset copied to the per-board dir; foreign one skipped");
  }

  // ---- 8. commits read back through the Contents API; a stale expectedHead is refused
  {
    const adapter = makeAdapter();
    const head0 = await adapter.branchHead();
    await adapter.commitFiles(
      [{ path: "boards/git-check.txt", bytes: new TextEncoder().encode("first") }],
      "first commit",
      { expectedHead: head0 },
    );
    const back = await makeAdapter().clone("boards/git-check.txt").read();
    assert.ok(
      back.status === "ok" && new TextDecoder().decode(back.bytes) === "first",
      "committed bytes should read back",
    );

    // head0 is now behind the branch, so the commit is refused and nothing is written.
    await assert.rejects(
      () =>
        adapter.commitFiles(
          [{ path: "boards/git-stale.txt", bytes: new TextEncoder().encode("stale") }],
          "stale commit",
          { expectedHead: head0 },
        ),
      (err: unknown) => err instanceof ConflictError,
    );
    assert.ok(!files.has("boards/git-stale.txt"), "a refused commit must write nothing");
    console.log("ok  commitFiles read-back and stale expectedHead refused");
  }

  // ---- 7. canvas background is a board setting: it syncs, and local writes do not echo
  {
    const docBgA = new Y.Doc();
    const docBgB = new Y.Doc();
    const bridgeBgA = new SceneBridge(docBgA, { id: "dev-bg-a", name: "Ada" }, () => {});
    const bridgeBgB = new SceneBridge(docBgB, { id: "dev-bg-b", name: "Bob" }, () => {});
    assert.equal(bridgeBgA.getViewBackground(), undefined, "fresh board should store no background");

    const seenA: Array<string | undefined> = [];
    const seenB: Array<string | undefined> = [];
    const unobserveBgA = bridgeBgA.observeViewBackground((color) => seenA.push(color));
    const unobserveBgB = bridgeBgB.observeViewBackground((color) => seenB.push(color));

    bridgeBgA.setViewBackground("#1d3b2a");
    assert.deepEqual(seenA, [], "a local write should not fire its own observer");
    Y.applyUpdate(docBgB, Y.encodeStateAsUpdate(docBgA));
    assert.equal(bridgeBgB.getViewBackground(), "#1d3b2a", "background should reach the other peer");
    assert.deepEqual(seenB, ["#1d3b2a"], "remote background change should fire the observer");

    bridgeBgB.setViewBackground("#ffffff");
    Y.applyUpdate(docBgA, Y.encodeStateAsUpdate(docBgB));
    assert.equal(bridgeBgA.getViewBackground(), "#ffffff", "later change should sync back");
    assert.deepEqual(seenA, ["#ffffff"], "remote change should fire on the first peer too");
    assert.deepEqual(seenB, ["#1d3b2a"], "the peer's own write should not echo back");

    unobserveBgA();
    unobserveBgB();
    bridgeBgA.dispose();
    bridgeBgB.dispose();
    docBgA.destroy();
    docBgB.destroy();
    console.log("ok  canvas background syncs as a board setting");
  }

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
