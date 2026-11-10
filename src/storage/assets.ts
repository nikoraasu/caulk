/**
 * Binary attachments (local video clips) stored as separate encrypted files next
 * to the board, so the board itself stays small and the live relay never carries
 * the bytes.
 *
 *   boards/roadmap.caulk                      live board
 *   boards/.assets/<sha256 of plaintext>.bin  encrypted asset
 *
 * Assets are content-addressed: the same bytes always map to the same file, so
 * an upload is skipped when the file is already there. The element on the board
 * only holds a reference, `caulk-asset:<sha256>?type=<mime>`. Excalidraw keeps
 * that link intact (it is a valid URL and not a data: URL), so peers see the same
 * reference and load the bytes from the repo with their own token and key.
 *
 * Plaintext layout (encrypted with the board's passphrase, same envelope):
 *   [u32 BE header length][header JSON {"v":1,"mime":"..."}][payload bytes]
 */

import { EncryptedStore } from "./encrypted";
import type { GitHubAdapter } from "./github";

export const ASSET_REF_PREFIX = "caulk-asset:";
export const ASSET_MAX_MB = 25;
export const ASSET_MAX_BYTES = ASSET_MAX_MB * 1024 * 1024;

const FALLBACK_MIME = "application/octet-stream";
const REF_RE = /^caulk-asset:([0-9a-f]{64})(?:\?type=([^&#]*))?$/;

/** `boards/roadmap.caulk` -> `boards/.assets`. Mirrors historyDirFor in config.ts. */
export function assetsDirFor(boardPath: string): string {
  const idx = boardPath.lastIndexOf("/");
  const dir = idx === -1 ? "" : boardPath.slice(0, idx);
  return [dir, ".assets"].filter(Boolean).join("/");
}

export function assetRefFor(sha: string, mime: string): string {
  return `${ASSET_REF_PREFIX}${sha}?type=${encodeURIComponent(mime || FALLBACK_MIME)}`;
}

export function parseAssetRef(ref: string): { sha: string; mime: string } | null {
  const m = REF_RE.exec(ref.trim());
  if (!m) return null;
  let mime = FALLBACK_MIME;
  try {
    mime = decodeURIComponent(m[2] ?? "") || FALLBACK_MIME;
  } catch {
    /* keep fallback */
  }
  return { sha: m[1], mime };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function encodePlain(bytes: Uint8Array, mime: string): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify({ v: 1, mime }));
  const out = new Uint8Array(4 + header.length + bytes.length);
  new DataView(out.buffer).setUint32(0, header.length);
  out.set(header, 4);
  out.set(bytes, 4 + header.length);
  return out;
}

function decodePlain(plain: Uint8Array): { bytes: Uint8Array; mime: string } {
  const corrupt = () => new Error("This video file is corrupted.");
  if (plain.length < 4) throw corrupt();
  const headerLen = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0);
  const start = 4 + headerLen;
  if (start > plain.length) throw corrupt();
  let mime = FALLBACK_MIME;
  try {
    const header = JSON.parse(new TextDecoder().decode(plain.subarray(4, start))) as { mime?: unknown };
    if (typeof header.mime === "string" && header.mime) mime = header.mime;
  } catch {
    throw corrupt();
  }
  return { bytes: plain.subarray(start), mime };
}

/* ---------- in-memory object URL cache ---------- */

/** Keyed by board + ref, so two boards never share a decrypted entry by accident. */
const objectUrls = new Map<string, Promise<string>>();

function urlKey(store: AssetStore, ref: string): string {
  return `${store.label}\n${ref}`;
}

/**
 * Object URL for an asset reference. Concurrent calls share one load, and the
 * result stays cached for the page's lifetime. A failed load is not cached.
 */
export function assetObjectUrl(store: AssetStore, ref: string): Promise<string> {
  const key = urlKey(store, ref);
  let pending = objectUrls.get(key);
  if (!pending) {
    pending = store.get(ref).then(({ bytes, mime }) =>
      URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })),
    );
    objectUrls.set(key, pending);
    pending.catch(() => {
      if (objectUrls.get(key) === pending) objectUrls.delete(key);
    });
  }
  return pending;
}

export class AssetStore {
  /** Asset file names (without .bin) known to exist in the assets dir. */
  private known: Set<string> | null = null;
  readonly dir: string;
  readonly label: string;

  constructor(
    private readonly adapter: GitHubAdapter,
    private readonly passphrase: string,
    boardPath: string,
  ) {
    this.dir = assetsDirFor(boardPath);
    this.label = `${adapter.label}#assets`;
  }

  private pathFor(sha: string): string {
    return `${this.dir}/${sha}.bin`;
  }

  private async hasAsset(sha: string): Promise<boolean> {
    if (!this.known) {
      const entries = await this.adapter.listDir(this.dir);
      this.known = new Set(
        entries.filter((e) => e.name.endsWith(".bin")).map((e) => e.name.slice(0, -4)),
      );
    }
    return this.known.has(sha);
  }

  /** Encrypt and store the bytes (skipped if already present). Returns the element link. */
  async put(bytes: Uint8Array, mime: string): Promise<string> {
    if (bytes.byteLength > ASSET_MAX_BYTES) {
      throw new Error(`This file is larger than ${ASSET_MAX_MB} MB.`);
    }
    const type = mime || FALLBACK_MIME;
    const sha = await sha256Hex(bytes);
    const ref = assetRefFor(sha, type);

    if (!(await this.hasAsset(sha))) {
      try {
        const store = new EncryptedStore(this.adapter.clone(this.pathFor(sha)), this.passphrase);
        await store.save(encodePlain(bytes, type));
        this.known?.add(sha);
      } catch (err) {
        // Another tab or peer may have written the same file first. The content is
        // identical, so that counts as success. Otherwise the error is real.
        this.known = null;
        if (!(await this.hasAsset(sha))) throw err;
      }
    }

    const key = urlKey(this, ref);
    if (!objectUrls.has(key)) {
      objectUrls.set(key, Promise.resolve(URL.createObjectURL(new Blob([bytes as BlobPart], { type }))));
    }
    return ref;
  }

  /** Download and decrypt an asset. Not cached here; see assetObjectUrl. */
  async get(ref: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const parsed = parseAssetRef(ref);
    if (!parsed) throw new Error("Not a video reference.");
    const store = new EncryptedStore(this.adapter.clone(this.pathFor(parsed.sha)), this.passphrase);
    const plain = await store.open();
    if (!plain) throw new Error("This video is missing from the board's repo.");
    return decodePlain(plain);
  }
}
