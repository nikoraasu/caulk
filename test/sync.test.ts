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
import { ConflictError, GitHubAdapter, GitHubError } from "../src/storage/github";
import { WrongPassphraseError } from "../src/crypto/envelope";
import { rekeyBoard } from "../src/storage/rekey";
import { SyncEngine } from "../src/sync/engine";
import { isElectedSaver } from "../src/sync/live";
import { SceneBridge, sanitizeElement } from "../src/crdt/scene";
import { ImageAssetSync } from "../src/sync/imageAssets";
import {
  addCommentReply,
  createCommentThread,
  deleteCommentMessage,
  extractMentions,
  isThreadUnread,
  listCommentThreads,
  setCommentResolved,
  toggleCommentReaction,
  updateCommentAnchorPos,
} from "../src/features/comments/store";
import {
  castVote,
  endVotingSession,
  formatVotingResultsMarkdown,
  getElementReactions,
  getVotesUsedByAuthor,
  getVotingSnapshot,
  retractVote,
  startVotingSession,
  summarizeVotingResults,
  toggleElementReaction,
} from "../src/features/voting/store";
import { BUILTIN_TEMPLATES } from "../src/features/templates/builtin";
import {
  instantiateTemplate,
  listRepoTemplates,
  saveRepoTemplate,
  seedDocFromTemplate,
} from "../src/features/templates/store";
import {
  addTagToElement,
  clusterByColor,
  clusterByTag,
  extractHashtags,
  findStickyItems,
  getElementTags,
  getTagColor,
  normalizeTag,
  removeTagFromElement,
  tidyGrid,
} from "../src/features/tags/store";
import { soundEngine } from "../src/audio/soundEngine";
import { isGitHubIssueLink, parseGitHubIssueRef } from "../src/storage/issues";
import {
  deleteRepoBoard,
  duplicateOrRenameBoard,
  listDashboardBoards,
  loadCachedBoards,
  loadCachedRepos,
  loadLastRepo,
  saveBoardThumbnail,
  saveCachedBoards,
  saveCachedRepos,
  saveLastRepo,
} from "../src/features/home/store";
import { defaultPassphrase } from "../src/config";

type FileState = { bytes: Buffer; sha: string; etag: string; isLarge?: boolean };

const files = new Map<string, FileState>();
let apiRequestCount = 0;
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
  apiRequestCount += 1;
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

  // Support /repos/:o/:r/commits
  if (segments[3] === "commits" && req.method === "GET") {
    return json(200, [
      {
        author: { login: "alice" },
        commit: { author: { name: "alice", date: "2026-11-11T10:00:00Z" } },
      },
    ]);
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

  if (req.method === "DELETE") {
    const existing = files.get(key);
    if (!existing) return json(404, { message: "Not Found" });
    files.delete(key);
    return json(200, { commit: { sha: nextSha() } });
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

  // ---- 8. canvas wallpaper background image & tiling syncs as a board setting
  {
    const docImgA = new Y.Doc();
    const docImgB = new Y.Doc();
    const bridgeImgA = new SceneBridge(docImgA, { id: "dev-img-a", name: "Ada" }, () => {});
    const bridgeImgB = new SceneBridge(docImgB, { id: "dev-img-b", name: "Bob" }, () => {});
    assert.equal(bridgeImgA.getCanvasBackgroundImage(), undefined, "fresh board should have no wallpaper");

    const seenA: Array<any> = [];
    const seenB: Array<any> = [];
    const unobserveImgA = bridgeImgA.observeCanvasBackgroundImage((bg) => seenA.push(bg));
    const unobserveImgB = bridgeImgB.observeCanvasBackgroundImage((bg) => seenB.push(bg));

    bridgeImgA.setCanvasBackgroundImage({ ref: "caulk-asset:abcdef0123456789", tile: true });
    assert.deepEqual(seenA, [], "local wallpaper write should not fire its own observer");
    Y.applyUpdate(docImgB, Y.encodeStateAsUpdate(docImgA));
    assert.deepEqual(
      bridgeImgB.getCanvasBackgroundImage(),
      { ref: "caulk-asset:abcdef0123456789", tile: true },
      "wallpaper ref and tiling should reach peer B",
    );
    assert.deepEqual(
      seenB,
      [{ ref: "caulk-asset:abcdef0123456789", tile: true }],
      "remote wallpaper change should fire peer B's observer",
    );

    bridgeImgB.setCanvasBackgroundImage({ ref: "caulk-asset:abcdef0123456789", tile: false });
    Y.applyUpdate(docImgA, Y.encodeStateAsUpdate(docImgB));
    assert.deepEqual(bridgeImgA.getCanvasBackgroundImage(), { ref: "caulk-asset:abcdef0123456789", tile: false });
    assert.deepEqual(seenA, [{ ref: "caulk-asset:abcdef0123456789", tile: false }]);

    // Removing wallpaper clears setting
    bridgeImgA.setCanvasBackgroundImage(undefined);
    Y.applyUpdate(docImgB, Y.encodeStateAsUpdate(docImgA));
    assert.equal(bridgeImgB.getCanvasBackgroundImage(), undefined, "clearing wallpaper syncs to peer B");
    assert.deepEqual(seenB, [{ ref: "caulk-asset:abcdef0123456789", tile: true }, undefined]);

    unobserveImgA();
    unobserveImgB();
    bridgeImgA.dispose();
    bridgeImgB.dispose();
    docImgA.destroy();
    docImgB.destroy();
    console.log("ok  canvas wallpaper background image & tiling syncs as a board setting");
  }

  // ---- 9. smarter saving: one elected saver per live room, non-saver handover on leave
  {
    assert.equal(isElectedSaver(false, 999, [1]), true, "offline client always saves");
    assert.equal(isElectedSaver(true, 999, []), true, "solo online client always saves");
    assert.equal(isElectedSaver(true, 100, [200, 300]), true, "lowest clientID is elected saver");
    assert.equal(isElectedSaver(true, 200, [100, 300]), false, "higher clientID stays non-saver");

    const electionPath = "boards/election.slate";
    const makeElectionStore = () =>
      new EncryptedStore(
        new GitHubAdapter({
          token: "test",
          owner: "octo",
          repo: "boards",
          branch: "main",
          path: electionPath,
          apiBase: "http://127.0.0.1:8787",
        }),
        "election passphrase",
      );

    const docSaver = new Y.Doc();
    docSaver.clientID = 100;
    const docFollower = new Y.Doc();
    docFollower.clientID = 200;
    const fakeLiveOrigin = { kind: "live-test" };

    let saverCommits = 0;
    let followerCommits = 0;

    const engSaver = new SyncEngine({
      doc: docSaver,
      store: makeElectionStore(),
      pollMs: 5000,
      debounceMs: 50,
      maxWaitMs: 200,
      onStatus: () => {},
      onCommitted: () => {
        saverCommits += 1;
      },
    });
    const engFollower = new SyncEngine({
      doc: docFollower,
      store: makeElectionStore(),
      pollMs: 5000,
      debounceMs: 50,
      maxWaitMs: 200,
      onStatus: () => {},
      onCommitted: () => {
        followerCommits += 1;
      },
    });

    engSaver.setLiveOrigin(fakeLiveOrigin);
    engFollower.setLiveOrigin(fakeLiveOrigin);
    engSaver.setSaver(isElectedSaver(true, docSaver.clientID, [docFollower.clientID]));
    engFollower.setSaver(isElectedSaver(true, docFollower.clientID, [docSaver.clientID]));

    await engSaver.start();
    await engFollower.start();

    // Non-saver edits locally and sends over live relay: only the saver commits.
    const updatesFromFollower: Uint8Array[] = [];
    docFollower.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === "local") updatesFromFollower.push(u);
    });
    docFollower.transact(() => docFollower.getMap("elements").set("n1", { id: "n1", v: 1 }), "local");
    for (const u of updatesFromFollower) Y.applyUpdate(docSaver, u, fakeLiveOrigin);
    updatesFromFollower.length = 0;

    await waitUntil(() => saverCommits === 1, 2000);
    await wait(120);
    assert.equal(followerCommits, 0, "non-saver must not commit during live editing");

    // Non-saver hiding its tab while peers remain must not commit.
    docFollower.transact(() => docFollower.getMap("elements").set("n2", { id: "n2", v: 2 }), "local");
    await engFollower.saveOnHide();
    assert.equal(followerCommits, 0, "non-saver must not commit on tab hide while saver is alive");

    // Saver leaves -> follower is re-elected and flushes the pending edit.
    engSaver.stop();
    engFollower.setSaver(isElectedSaver(true, docFollower.clientID, []));
    await waitUntil(() => followerCommits === 1, 2000);

    // Verify both n1 and n2 made it into GitHub.
    const checkBytes = await makeElectionStore().open();
    assert.ok(checkBytes, "elected handover commit should be readable");
    const docCheck = new Y.Doc();
    Y.applyUpdate(docCheck, checkBytes!);
    assert.deepEqual(docCheck.getMap("elements").get("n1"), { id: "n1", v: 1 });
    assert.deepEqual(docCheck.getMap("elements").get("n2"), { id: "n2", v: 2 });

    engFollower.stop();
    docSaver.destroy();
    docFollower.destroy();
    docCheck.destroy();
    console.log("ok  saver election commits once and hands over cleanly on leave");
  }

  // Task 8.1: Comments & threads CRDT convergence
  {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const tid = createCommentThread(docA, {
      x: 120,
      y: 240,
      elementId: "sticky-1",
      offsetX: 12,
      offsetY: 18,
      author: "alice",
      text: "Hey @bob, check this sticky!",
    });

    assert.deepEqual(extractMentions("Hey @bob, cc @Alice_2!"), ["bob", "alice_2"]);

    // Replicate initial thread to B.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Concurrent replies from A and B on the same thread must both survive.
    addCommentReply(docA, tid, { author: "alice", text: "Follow up from Alice" });
    addCommentReply(docB, tid, { author: "bob", text: "Reply from Bob" });

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const threadsA = listCommentThreads(docA);
    const threadsB = listCommentThreads(docB);
    assert.equal(threadsA.length, 1);
    assert.deepEqual(
      threadsA[0].messages.map((m) => m.text).sort(),
      ["Follow up from Alice", "Hey @bob, check this sticky!", "Reply from Bob"],
    );
    assert.deepEqual(threadsA, threadsB);

    assert.equal(isThreadUnread(threadsB[0], 0, "carol"), true);

    // Toggle reaction, resolve, move anchor, and delete own message.
    const firstMsgId = threadsA[0].messages[0].id;
    toggleCommentReaction(docA, tid, firstMsgId, "👍", "bob");
    setCommentResolved(docA, tid, true);
    updateCommentAnchorPos(docA, tid, 300, 400);
    const aliceReply = threadsA[0].messages.find((m) => m.text === "Follow up from Alice");
    assert.ok(aliceReply);
    deleteCommentMessage(docA, tid, aliceReply.id, "alice");

    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const afterB = listCommentThreads(docB)[0];
    assert.equal(afterB.resolved, true);
    assert.equal(afterB.x, 300);
    assert.equal(afterB.y, 400);
    assert.deepEqual(afterB.messages[0].reactions["👍"], ["bob"]);
    assert.equal(afterB.messages.length, 2);
    assert.equal(isThreadUnread(afterB, 0, "carol"), false);

    docA.destroy();
    docB.destroy();
    console.log("ok  comments CRDT threads, concurrent replies, reactions & resolve converge");
  }

  // Task 8.2: Sticky reactions & dot voting CRDT convergence
  {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Concurrent emoji reactions on the same sticky never overwrite each other.
    toggleElementReaction(docA, "el-1", "👍", "alice");
    toggleElementReaction(docB, "el-1", "👍", "bob");
    toggleElementReaction(docB, "el-1", "🔥", "bob");

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const rA = getElementReactions(docA).get("el-1") ?? [];
    const rB = getElementReactions(docB).get("el-1") ?? [];
    assert.deepEqual(rA, rB);
    assert.equal(rA.find((b) => b.emoji === "👍")?.count, 2);
    assert.deepEqual(rA.find((b) => b.emoji === "🔥")?.authors, ["bob"]);

    // Toggle off
    toggleElementReaction(docA, "el-1", "👍", "alice");
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    assert.deepEqual(
      getElementReactions(docB).get("el-1")?.find((b) => b.emoji === "👍")?.authors,
      ["bob"],
    );

    // Dot voting session with 2 votes per person, concurrent voters, and budget enforcement.
    const sid = startVotingSession(docA, {
      votesPerPerson: 2,
      anonymous: true,
      startedBy: "alice",
    });
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    assert.equal(castVote(docA, "el-1", "alice"), true);
    assert.equal(castVote(docA, "el-2", "alice"), true);
    assert.equal(castVote(docA, "el-2", "alice"), false); // budget reached
    assert.equal(getVotesUsedByAuthor(docA, sid, "alice"), 2);

    assert.equal(castVote(docB, "el-2", "bob"), true);
    assert.equal(castVote(docB, "el-2", "bob"), true);
    assert.equal(retractVote(docB, "el-2", "bob"), true);
    assert.equal(castVote(docB, "el-1", "bob"), true);

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    endVotingSession(docA);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const snap = getVotingSnapshot(docB);
    assert.equal(snap.session?.status, "ended");
    const rows = summarizeVotingResults(snap, [
      { id: "el-1", type: "rectangle", text: "Top idea" },
      { id: "el-2", type: "rectangle", text: "Runner up" },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].totalVotes, 2);
    assert.equal(rows[0].voters.length, 0); // anonymous strips voter names

    const md = formatVotingResultsMarkdown(rows, snap.session);
    assert.ok(md.includes("Top idea"));

    docA.destroy();
    docB.destroy();
    console.log("ok  element reactions & dot voting CRDT budgets, concurrency & results converge");
  }

  // Task 8.4: Templates instantiation, frame wrapping & encrypted repo templates round-trip
  {
    assert.equal(BUILTIN_TEMPLATES.length, 8);
    const swot = BUILTIN_TEMPLATES.find((t) => t.slug === "swot")!;
    const instA = instantiateTemplate(swot, { centerX: 500, centerY: 400, wrapInFrame: true });
    const instB = instantiateTemplate(swot, { centerX: 500, centerY: 400, wrapInFrame: true });

    const frameA = instA.find((e) => e.type === "frame");
    assert.ok(frameA, "template insertion should wrap elements inside a frame");
    const idsA = new Set(instA.map((e) => String(e.id)));
    const idsB = new Set(instB.map((e) => String(e.id)));
    for (const id of idsA) {
      assert.ok(!idsB.has(id), "each instantiation must regenerate fresh element IDs");
    }

    // Verify bound text containerId matches newly minted parent ID.
    const boundText = instA.find((e) => e.type === "text" && typeof e.containerId === "string");
    assert.ok(boundText && idsA.has(String(boundText.containerId)));

    // Seed a Y.Doc cleanly from a built-in template.
    const docTpl = new Y.Doc();
    seedDocFromTemplate(docTpl, swot);
    assert.equal(docTpl.getMap("elements").size, instA.length);
    docTpl.destroy();

    // Save encrypted repo template and read it back via fake GitHub server.
    const repoCfg = {
      token: "tok-test",
      owner: "o",
      repo: "r",
      branch: "main",
      passphrase: "tpl-secret-passphrase",
      apiBase: "http://127.0.0.1:8787",
    };
    const saved = await saveRepoTemplate(repoCfg, {
      name: "Custom Sprint Plan",
      elements: swot.elements.slice(0, 5),
    });
    assert.equal(saved.slug, "custom-sprint-plan");
    assert.ok(files.has("templates/custom-sprint-plan.json"));
    const wireJson = files.get("templates/custom-sprint-plan.json")!.bytes.toString("utf8");
    assert.ok(!wireJson.includes("Strengths"), "repo template must be encrypted at rest");

    const listed = await listRepoTemplates(repoCfg);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "Custom Sprint Plan");
    assert.equal(listed[0].source, "repo");
    assert.equal(listed[0].elements.length, 5);

    console.log("ok  8 built-in templates, ID remapping, frame wrap & encrypted repo templates verified");
  }

  // Task 8.5: Boards home discovery, thumbnails, lock detection, rename, duplicate & delete
  {
    files.clear();
    const homeCfg = {
      token: "tok-test",
      owner: "o",
      repo: "r",
      branch: "main",
      apiBase: "http://127.0.0.1:8787",
    };

    // Create one open board + encrypted SVG thumbnail, and one password-protected board.
    const openTarget = { owner: "o", repo: "r", branch: "main", path: "boards/alpha.slate" };
    const openDoc = new Y.Doc();
    openDoc.getMap("elements").set("n1", { id: "n1", type: "rectangle", text: "Hello" });
    await new EncryptedStore(
      new GitHubAdapter({ ...homeCfg, path: openTarget.path }),
      defaultPassphrase(openTarget),
    ).save(Y.encodeStateAsUpdate(openDoc));
    openDoc.destroy();

    await saveBoardThumbnail(
      { ...homeCfg, boardPath: openTarget.path, passphrase: defaultPassphrase(openTarget) },
      "<svg><rect width='10' height='10'/></svg>",
    );

    const lockedTarget = { owner: "o", repo: "r", branch: "main", path: "boards/secret.slate" };
    const lockedDoc = new Y.Doc();
    lockedDoc.getMap("elements").set("s1", { id: "s1", type: "rectangle" });
    await new EncryptedStore(
      new GitHubAdapter({ ...homeCfg, path: lockedTarget.path }),
      "secret-board-pw",
    ).save(Y.encodeStateAsUpdate(lockedDoc));
    lockedDoc.destroy();

    const listed = await listDashboardBoards(homeCfg);
    assert.equal(listed.length, 2);
    const alpha = listed.find((b) => b.name === "alpha")!;
    const secret = listed.find((b) => b.name === "secret")!;
    assert.equal(alpha.locked, false);
    assert.equal(alpha.lastAuthor, "alice");
    assert.ok(alpha.thumbnailSvg?.includes("<svg>"));
    assert.equal(secret.locked, true);
    assert.equal(secret.thumbnailSvg, null);

    // Duplicate alpha -> alpha-copy (re-encrypted with alpha-copy default key)
    const dupTarget = await duplicateOrRenameBoard(homeCfg, {
      sourcePath: openTarget.path,
      newName: "alpha-copy",
      mode: "duplicate",
    });
    assert.equal(dupTarget.path, "boards/alpha-copy.slate");
    const dupBytes = await new EncryptedStore(
      new GitHubAdapter({ ...homeCfg, path: dupTarget.path }),
      defaultPassphrase(dupTarget),
    ).open();
    assert.ok(dupBytes, "duplicated open board must decrypt with new board default passphrase");

    // Rename alpha-copy -> alpha-final
    const renTarget = await duplicateOrRenameBoard(homeCfg, {
      sourcePath: dupTarget.path,
      newName: "alpha-final",
      mode: "rename",
    });
    assert.equal(files.has("boards/alpha-copy.slate"), false);
    assert.equal(files.has("boards/alpha-final.slate"), true);
    assert.equal(renTarget.path, "boards/alpha-final.slate");

    // Delete alpha-final + its thumbnail
    await deleteRepoBoard(homeCfg, renTarget.path);
    assert.equal(files.has("boards/alpha-final.slate"), false);
    assert.equal(files.has("boards/.thumbs/alpha-final.svg.enc"), false);

    console.log("ok  boards home discovery, thumbs, lock detection, duplicate, rename & delete verified");
  }

  // ── Step 14: Rate-limit backoff in SyncEngine & offline home cache fallback ──
  {
    const backoffDoc = new Y.Doc();
    let pollCalls = 0;
    const rateLimitedAdapter = {
      label: "owner/repo:boards/ratelimit.slate",
      async read() {
        pollCalls += 1;
        if (pollCalls === 1) return { status: "missing" as const };
        throw new GitHubError(403, "GitHub API rate limit reached (403).");
      },
      async write() {
        throw new GitHubError(403, "GitHub API rate limit reached (403).");
      },
    };
    const backoffStatuses: string[] = [];
    const backoffEngine = new SyncEngine({
      doc: backoffDoc,
      store: new EncryptedStore(rateLimitedAdapter, "pass"),
      pollMs: 25,
      onStatus: (s) => backoffStatuses.push(s.kind),
    });
    assert.equal(await backoffEngine.start(), true);
    await new Promise((r) => setTimeout(r, 120));
    backoffEngine.stop();
    backoffDoc.destroy();
    // Initial start() read (=1) + at most 1 polled 403 -> subsequent 25ms ticks backed off!
    assert.equal(pollCalls, 2, `expected backoff to stop repeated 403 polling (got ${pollCalls})`);
    assert.ok(backoffStatuses.includes("error"));

    // Stub both window and globalThis localStorage to verify offline home cache helpers
    const lsMap = new Map<string, string>();
    const fakeLs = {
      getItem: (k: string) => lsMap.get(k) ?? null,
      setItem: (k: string, v: string) => void lsMap.set(k, v),
      removeItem: (k: string) => void lsMap.delete(k),
    };
    const prevWin = (globalThis as { window?: unknown }).window;
    const prevLs = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { window: unknown }).window = { localStorage: fakeLs };
    (globalThis as { localStorage: unknown }).localStorage = fakeLs;
    try {
      saveLastRepo("owner/repo-a");
      assert.equal(loadLastRepo(), "owner/repo-a");
      saveCachedRepos([
        {
          fullName: "owner/repo-a",
          owner: "owner",
          name: "repo-a",
          private: true,
          defaultBranch: "main",
          canPush: true,
        },
      ]);
      assert.equal(loadCachedRepos().length, 1);
      saveCachedBoards("owner", "repo-a", [
        {
          owner: "owner",
          repo: "repo-a",
          branch: "main",
          path: "boards/alpha.slate",
          slug: "alpha",
          name: "alpha",
          sha: "sha1",
          size: 100,
          lastEditedAt: null,
          lastAuthor: "alice",
          locked: false,
          thumbnailSvg: "<svg/>",
        },
      ]);
      const cached = loadCachedBoards("owner", "repo-a");
      assert.equal(cached.length, 1);
      assert.equal(cached[0].name, "alpha");
    } finally {
      (globalThis as { window?: unknown }).window = prevWin;
      (globalThis as { localStorage?: unknown }).localStorage = prevLs;
    }

    // Verify ImageAssetSync never spin-loops on WrongPassphraseError or transient 403
    let assetGets = 0;
    let transientGets = 0;
    const assetBridge = {
      getFileRefs: () => [
        {
          id: "file-wrong-key",
          mimeType: "image/png",
          created: 1,
          asset: "caulk-asset:0000000000000000000000000000000000000000000000000000000000000001",
        },
        {
          id: "file-rate-limited",
          mimeType: "image/png",
          created: 1,
          asset: "caulk-asset:0000000000000000000000000000000000000000000000000000000000000002",
        },
      ],
      getInlineFiles: () => [],
      setFileAsset: () => undefined,
      onLocalFiles: undefined,
    } as unknown as SceneBridge;
    const assetStoreStub = {
      async get(ref: string) {
        if (ref.endsWith("0001")) {
          assetGets += 1;
          throw new WrongPassphraseError();
        }
        transientGets += 1;
        throw new GitHubError(403, "Rate limit");
      },
      async put() {
        return "";
      },
    } as unknown as AssetStore;
    const assetSync = new ImageAssetSync({
      bridge: assetBridge,
      store: assetStoreStub,
      boardKey: "test-backoff-board",
      addFiles: () => undefined,
    });
    assetSync.resolveRefs();
    await new Promise((r) => setTimeout(r, 80));
    assetSync.dispose();
    assert.equal(assetGets, 1, `expected WrongPassphraseError download once (got ${assetGets})`);
    assert.equal(transientGets, 1, `expected 403 download to back off once (got ${transientGets})`);

    console.log("ok  SyncEngine 403 backoff, ImageAssetSync non-spin backoff & offline cache verified");
  }

  engine1.stop();
  engine2.stop();
  doc1.destroy();
  doc2.destroy();

  // ---- 9. 17 concurrent large/legacy photo fetches use coalesced listDir + direct /git/blobs
  {
    const pass = "photo-budget-pass";
    const boardPath = "boards/budget-board.caulk";
    const uploader = new AssetStore(makeAdapter(), pass, boardPath);
    const refs: string[] = [];
    for (let i = 0; i < 17; i += 1) {
      const payload = new Uint8Array([i + 1, 2, 3, 4, 5]);
      const ref = await uploader.put(payload, "image/png", { cacheObjectUrl: false });
      const parsed = parseAssetRef(ref)!;
      const entry = files.get(`${assetsDirFor(boardPath)}/${parsed.sha}.bin`);
      if (entry) entry.isLarge = true;
      refs.push(ref);
    }

    const coldReader = new AssetStore(makeAdapter(), pass, boardPath);
    apiRequestCount = 0;
    const loaded = await Promise.all(refs.map((r) => coldReader.get(r)));
    assert.equal(loaded.length, 17);
    assert.ok(
      apiRequestCount <= 18,
      `expected 17 large photos to use <= 18 GitHub API requests (got ${apiRequestCount})`,
    );

    // Move all 17 files into legacy dir and verify a fresh reader uses 1 dir + 1 legacy + 17 blobs = 19 calls.
    for (const ref of refs) {
      const sha = parseAssetRef(ref)!.sha;
      const perBoardKey = `${assetsDirFor(boardPath)}/${sha}.bin`;
      const legacyKey = `boards/.assets/${sha}.bin`;
      const f = files.get(perBoardKey)!;
      files.set(legacyKey, f);
      files.delete(perBoardKey);
    }
    const legacyReader = new AssetStore(makeAdapter(), pass, boardPath);
    apiRequestCount = 0;
    const loadedLegacy = await Promise.all(refs.map((r) => legacyReader.get(r)));
    assert.equal(loadedLegacy.length, 17);
    assert.ok(
      apiRequestCount <= 19,
      `expected 17 legacy large photos to use <= 19 GitHub API requests (got ${apiRequestCount})`,
    );

    console.log(
      `ok  17 concurrent >1MB photos cost ${apiRequestCount} requests (legacy) and <= 18 requests (per-board)`,
    );
  }

  // ---- 10. board-wide theme preset and UI color overrides sync via settings map
  {
    const themeDocA = new Y.Doc();
    const themeDocB = new Y.Doc();
    const bridgeA = new SceneBridge(themeDocA, { id: "t-a", name: "Ada" }, () => {});
    const bridgeB = new SceneBridge(themeDocB, { id: "t-b", name: "Bob" }, () => {});
    const received: unknown[] = [];
    const unsub = bridgeB.observeBoardTheme((t) => received.push(t));

    bridgeA.setBoardTheme({
      preset: "frutiger-aero",
      colors: { surface: "#d0ebff", accent: "#0099ff", text: "#0a2540" },
    });
    Y.applyUpdate(themeDocB, Y.encodeStateAsUpdate(themeDocA));

    assert.deepEqual(bridgeB.getBoardTheme(), {
      preset: "frutiger-aero",
      colors: { surface: "#d0ebff", accent: "#0099ff", text: "#0a2540" },
    });
    assert.equal(received.length, 1);

    bridgeA.setBoardTheme({ preset: "dos-tui" });
    Y.applyUpdate(themeDocB, Y.encodeStateAsUpdate(themeDocA));
    assert.deepEqual(bridgeB.getBoardTheme(), { preset: "dos-tui" });
    assert.equal(received.length, 2);

    bridgeA.setBoardTheme({ preset: "frutiger-glacier", radius: 20 });
    Y.applyUpdate(themeDocB, Y.encodeStateAsUpdate(themeDocA));
    assert.deepEqual(bridgeB.getBoardTheme(), { preset: "frutiger-glacier", radius: 20 });
    assert.equal(received.length, 3);

    bridgeA.setBoardTheme({
      preset: "frutiger-glacier",
      radius: 20,
      adaptToBackground: true,
    });
    Y.applyUpdate(themeDocB, Y.encodeStateAsUpdate(themeDocA));
    assert.deepEqual(bridgeB.getBoardTheme(), {
      preset: "frutiger-glacier",
      radius: 20,
      adaptToBackground: true,
    });
    assert.equal(received.length, 4);

    unsub();
    bridgeA.dispose();
    bridgeB.dispose();
    themeDocA.destroy();
    themeDocB.destroy();
    console.log("ok  board theme preset and UI color overrides sync across peers");
  }

  {
    // Sticky note tags, hashtags, color clustering and grid tidy across peers
    const tagDocA = new Y.Doc();
    const tagDocB = new Y.Doc();
    let receivedB: any[] = [];
    const bridgeA = new SceneBridge(tagDocA, { id: "client-a", name: "Alice" }, () => {});
    const bridgeB = new SceneBridge(tagDocB, { id: "client-b", name: "Bob" }, (els) => {
      receivedB = els;
    });

    const note1 = {
      id: "note-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 160,
      height: 160,
      backgroundColor: "#c4b550", // Gold
      customData: { isSticky: true, tags: ["frontend", "urgent"] },
      version: 1,
      versionNonce: 111,
      isDeleted: false,
    };
    const boundText1 = {
      id: "text-1",
      type: "text",
      containerId: "note-1",
      text: "Build tag picker #vgui",
      x: 110,
      y: 110,
      version: 1,
      versionNonce: 222,
      isDeleted: false,
    };
    const note2 = {
      id: "note-2",
      type: "rectangle",
      x: 400,
      y: 100,
      width: 160,
      height: 160,
      backgroundColor: "#6b8e23", // Sage
      customData: { isSticky: true, tags: ["backend"] },
      version: 1,
      versionNonce: 333,
      isDeleted: false,
    };

    // Client A applies local elements with tags
    bridgeA.applyLocal([note1, boundText1, note2] as any);
    Y.applyUpdate(tagDocB, Y.encodeStateAsUpdate(tagDocA));
    bridgeB.hydrate();

    // Client B verifies tags are synced and extracted correctly
    const items = findStickyItems(receivedB);
    assert.equal(items.length, 2);

    const bItem1 = items.find((i) => i.container.id === "note-1");
    assert.ok(bItem1);
    // Extracted tags include customData.tags + hashtags in text ("frontend", "urgent", "vgui")
    assert.ok(bItem1.tags.includes("frontend"));
    assert.ok(bItem1.tags.includes("urgent"));
    assert.ok(bItem1.tags.includes("vgui"));

    // Verify tag color hashing is deterministic
    const colA = getTagColor("frontend");
    const colB = getTagColor("frontend");
    assert.deepEqual(colA, colB);

    // Verify clustering algorithms
    const tagCluster = clusterByTag(items, { createFrames: true });
    assert.ok(tagCluster.newFrames.length >= 2);
    assert.equal(tagCluster.updatedElements.length, 3); // 2 containers + 1 bound text

    const colorCluster = clusterByColor(items, { createFrames: true });
    assert.equal(colorCluster.newFrames.length, 2);

    const tidyRes = tidyGrid(items, { columnsPerGroup: 2 });
    assert.equal(tidyRes.updatedElements.length, 3);

    bridgeA.dispose();
    bridgeB.dispose();
    tagDocA.destroy();
    tagDocB.destroy();
    console.log("ok  sticky note tags, hashtags, color clustering and grid tidy verified");
  }

  {
    // Retro sound engine configuration, volume clamping and theme pack resolution
    soundEngine.setEnabled(false);
    assert.equal(soundEngine.getConfig().enabled, false);
    soundEngine.setEnabled(true);

    soundEngine.setVolume(1.5);
    assert.equal(soundEngine.getConfig().volume, 1.0);
    soundEngine.setVolume(0.5);

    soundEngine.setSoundPack("auto");
    soundEngine.setActiveThemePreset("frutiger-glacier");
    assert.equal(soundEngine.resolveEffectivePack(), "frutiger");

    soundEngine.setActiveThemePreset("vgui");
    assert.equal(soundEngine.resolveEffectivePack(), "vgui");

    soundEngine.setActiveThemePreset("windows-xp");
    assert.equal(soundEngine.resolveEffectivePack(), "windows-xp");

    soundEngine.setActiveThemePreset("mac-os9");
    assert.equal(soundEngine.resolveEffectivePack(), "mac-os9");

    soundEngine.play("click");
    soundEngine.play("create");
    soundEngine.play("hover");
    console.log("ok  retro sound effects engine & theme pack resolution verified");
  }

  {
    // GitHub Issue Cards: link parsing, scheme handling & customData preservation across CRDT
    assert.equal(isGitHubIssueLink("https://github.com/facebook/react/issues/100"), true);
    assert.equal(isGitHubIssueLink("caulk-issue://owner/repo/42"), true);
    assert.equal(isGitHubIssueLink("https://example.com/not-an-issue"), false);

    const ref1 = parseGitHubIssueRef("#42", "acme", "widgets");
    assert.deepEqual(ref1, { owner: "acme", repo: "widgets", number: 42 });

    const ref2 = parseGitHubIssueRef("facebook/react#123");
    assert.deepEqual(ref2, { owner: "facebook", repo: "react", number: 123 });

    const ref3 = parseGitHubIssueRef("https://github.com/nikolas/miro-alt/issues/99");
    assert.deepEqual(ref3, { owner: "nikolas", repo: "miro-alt", number: 99 });

    const ref4 = parseGitHubIssueRef("caulk-issue://myorg/myrepo/77");
    assert.deepEqual(ref4, { owner: "myorg", repo: "myrepo", number: 77 });

    // CRDT sync of an Issue Card element without affecting sticky notes
    const issueDocA = new Y.Doc();
    const issueDocB = new Y.Doc();
    let receivedOnB: any[] = [];
    const bridgeA = new SceneBridge(issueDocA, { id: "iss-a", name: "Ada" }, () => {});
    const bridgeB = new SceneBridge(issueDocB, { id: "iss-b", name: "Bob" }, (els) => {
      receivedOnB = els;
    });

    issueDocA.on("update", (u) => Y.applyUpdate(issueDocB, u));
    issueDocB.on("update", (u) => Y.applyUpdate(issueDocA, u));

    const issueCard = {
      id: "card-issue-1",
      type: "embeddable",
      x: 100,
      y: 100,
      width: 320,
      height: 180,
      link: "https://github.com/owner/repo/issues/42",
      customData: {
        isIssueCard: true,
        issueNumber: 42,
        issueTitle: "Implement issue card badges",
        issueState: "open",
        issueLabels: [{ name: "enhancement", color: "a2eeef" }],
        issueAuthor: "octocat",
      },
      version: 1,
      versionNonce: 777,
      isDeleted: false,
    };

    const stickyNote = {
      id: "sticky-1",
      type: "rectangle",
      x: 450,
      y: 100,
      width: 220,
      height: 160,
      backgroundColor: "#fff089",
      customData: { isSticky: true },
      version: 1,
      versionNonce: 888,
      isDeleted: false,
    };

    bridgeA.applyLocal([issueCard as any, stickyNote as any]);

    assert.equal(receivedOnB.length, 2);

    const bCard = receivedOnB.find((el) => el.id === "card-issue-1");
    assert.ok(bCard);
    assert.equal((bCard?.customData as any)?.isIssueCard, true);
    assert.equal((bCard?.customData as any)?.issueNumber, 42);
    assert.equal((bCard?.customData as any)?.issueState, "open");

    // Verify the sticky note remained a completely untouched sticky note (not overridden)
    const bSticky = receivedOnB.find((el) => el.id === "sticky-1");
    assert.ok(bSticky);
    assert.equal((bSticky?.customData as any)?.isSticky, true);
    assert.equal((bSticky?.customData as any)?.isIssueCard, undefined);

    bridgeA.dispose();
    bridgeB.dispose();
    issueDocA.destroy();
    issueDocB.destroy();
    console.log("ok  GitHub issue cards CRDT sync & non-override separation verified");
  }

  // Miro-like Native Frames & Child Movement Synchronization
  {
    // 1. Legacy frame migration in sanitizeElement
    const legacyFrame = {
      id: "legacy-frame-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 600,
      height: 400,
      customData: { isFrame: true, frameTitle: "Sprint Backlog" },
      version: 1,
      versionNonce: 101,
      isDeleted: false,
    };
    const sanitizedLegacy = sanitizeElement(legacyFrame);
    assert.equal(sanitizedLegacy.type, "frame", "legacy rectangle frames must migrate to native frame type");
    assert.equal((sanitizedLegacy as any).name, "Sprint Backlog", "frame title must migrate to native name");

    // 2. Native frame CRDT sync and child element frameId binding
    const frameDocA = new Y.Doc();
    const frameDocB = new Y.Doc();
    frameDocA.on("update", (u) => Y.applyUpdate(frameDocB, u));
    frameDocB.on("update", (u) => Y.applyUpdate(frameDocA, u));

    let receivedOnB: any[] = [];
    const bridgeA = new SceneBridge(frameDocA, { id: "user-a", name: "Alice" }, () => {});
    const bridgeB = new SceneBridge(frameDocB, { id: "user-b", name: "Bob" }, (els) => {
      receivedOnB = els;
    });

    const nativeFrame = {
      id: "frame-live-1",
      type: "frame",
      name: "Q4 Roadmap",
      x: 200,
      y: 300,
      width: 800,
      height: 500,
      version: 1,
      versionNonce: 201,
      isDeleted: false,
    };

    const childSticky1 = {
      id: "child-sticky-1",
      type: "rectangle",
      x: 250,
      y: 350,
      width: 200,
      height: 150,
      frameId: "frame-live-1",
      backgroundColor: "#ffd166",
      customData: { isSticky: true },
      version: 1,
      versionNonce: 202,
      isDeleted: false,
    };

    const childSticky2 = {
      id: "child-sticky-2",
      type: "rectangle",
      x: 500,
      y: 350,
      width: 200,
      height: 150,
      frameId: "frame-live-1",
      backgroundColor: "#06d6a0",
      customData: { isSticky: true },
      version: 1,
      versionNonce: 203,
      isDeleted: false,
    };

    // Ordering invariant: children precede frame
    bridgeA.applyLocal([childSticky1 as any, childSticky2 as any, nativeFrame as any]);

    assert.equal(receivedOnB.length, 3);
    const bFrame = receivedOnB.find((el) => el.id === "frame-live-1");
    assert.ok(bFrame);
    assert.equal(bFrame.type, "frame");
    assert.equal(bFrame.name, "Q4 Roadmap");

    const bChildren = receivedOnB.filter((el) => el.frameId === "frame-live-1");
    assert.equal(bChildren.length, 2, "both children must be bound to frame-live-1");

    // 3. Moving the frame: when frame moves by (+100, +50), all children follow by (+100, +50)
    const dx = 100;
    const dy = 50;
    const movedFrame = { ...nativeFrame, x: nativeFrame.x + dx, y: nativeFrame.y + dy, version: 2, versionNonce: 301 };
    const movedChild1 = { ...childSticky1, x: childSticky1.x + dx, y: childSticky1.y + dy, version: 2, versionNonce: 302 };
    const movedChild2 = { ...childSticky2, x: childSticky2.x + dx, y: childSticky2.y + dy, version: 2, versionNonce: 303 };

    bridgeA.applyLocal([movedChild1 as any, movedChild2 as any, movedFrame as any]);

    const bMovedFrame = receivedOnB.find((el) => el.id === "frame-live-1");
    const bMovedChild1 = receivedOnB.find((el) => el.id === "child-sticky-1");
    const bMovedChild2 = receivedOnB.find((el) => el.id === "child-sticky-2");

    assert.equal(bMovedFrame?.x, 300);
    assert.equal(bMovedFrame?.y, 350);
    assert.equal(bMovedChild1?.x, 350);
    assert.equal(bMovedChild1?.y, 400);
    assert.equal(bMovedChild2?.x, 600);
    assert.equal(bMovedChild2?.y, 400);

    // 4. Clustered notes: verify createFrameElement generates native frame and binds sticky items
    const stickyItems = [
      { id: "s-1", container: { id: "s-1", type: "rectangle", x: 100, y: 100, version: 1 }, x: 100, y: 100, width: 160, height: 160, color: "#ffd166", text: "Tag A note", tags: ["frontend"] },
      { id: "s-2", container: { id: "s-2", type: "rectangle", x: 300, y: 100, version: 1 }, x: 300, y: 100, width: 160, height: 160, color: "#ffd166", text: "Tag B note", tags: ["frontend"] },
    ];
    const clusterResult = clusterByTag(stickyItems as any, { createFrames: true });
    assert.equal(clusterResult.newFrames.length, 1);
    assert.equal(clusterResult.newFrames[0].type, "frame");
    assert.ok(clusterResult.newFrames[0].name.includes("frontend"));

    // Every clustered note container must have its frameId bound to the generated frame
    const clusterFrameId = clusterResult.newFrames[0].id;
    for (const el of clusterResult.updatedElements) {
      if (el.type === "rectangle") {
        assert.equal(el.frameId, clusterFrameId, "clustered sticky notes must be bound to the cluster frame");
      }
    }

    bridgeA.dispose();
    bridgeB.dispose();
    frameDocA.destroy();
    frameDocB.destroy();
    console.log("ok  Miro-like native frames, legacy migration, child binding & translation verified");
  }

  server.close();
  console.log("\nall integration checks passed");
}

main().catch((err) => {
  console.error("FAILED:", err);
  server.close();
  process.exit(1);
});
