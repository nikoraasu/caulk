/**
 * Binary attachments (local video clips and images) stored as separate encrypted files next
 * to the board, so the board itself stays small and the live relay never carries
 * the bytes.
 *
 *   boards/roadmap.caulk                         live board
 *   boards/.assets/roadmap/<sha256>.bin          encrypted asset, one dir per board
 *   boards/.assets/<sha256>.bin                  legacy shared dir, read-only fallback
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

import {
  deriveKey,
  decryptEnvelope,
  encryptEnvelope,
  parseEnvelope,
  PBKDF2_ITERATIONS,
} from "../crypto/envelope";
import { base64ToBytes, randomBytes } from "../lib/bytes";
import { getCachedAssetEnvelope, putCachedAssetEnvelope } from "./assetCache";
import { GitHubError, type GitHubAdapter } from "./github";

export const ASSET_REF_PREFIX = "caulk-asset:";
export const ASSET_MAX_MB = 25;
export const ASSET_MAX_BYTES = ASSET_MAX_MB * 1024 * 1024;

const FALLBACK_MIME = "application/octet-stream";
const REF_RE = /^caulk-asset:([0-9a-f]{64})(?:\?type=([^&#]*))?$/;

/**
 * `boards/roadmap.caulk` -> `boards/.assets/roadmap`. One dir per board, because each
 * board's assets are encrypted with that board's passphrase. Mirrors historyDirFor.
 */
export function assetsDirFor(boardPath: string): string {
  const idx = boardPath.lastIndexOf("/");
  const dir = idx === -1 ? "" : boardPath.slice(0, idx);
  const file = idx === -1 ? boardPath : boardPath.slice(idx + 1);
  return [dir, ".assets", file.replace(/\.(caulk|slate)$/i, "")].filter(Boolean).join("/");
}

/**
 * `boards/roadmap.caulk` -> `boards/.assets`: the old shared dir. Read-only fallback
 * for assets uploaded before per-board dirs existed (live videos still live there).
 */
export function legacyAssetsDirFor(boardPath: string): string {
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

/** Decode a base64 `data:` URL (what Excalidraw keeps for images). */
export function dataURLToBytes(dataURL: string): { bytes: Uint8Array; mime: string } {
  const comma = dataURL.indexOf(",");
  const header = comma === -1 ? "" : dataURL.slice(0, comma);
  if (!header.startsWith("data:") || !header.endsWith(";base64")) {
    throw new Error("This file is corrupted.");
  }
  const mime = header.slice(5, -";base64".length).split(";")[0] || FALLBACK_MIME;
  const binary = atob(dataURL.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

/** Plain base64 `data:` URL. Chunked so large images don't overflow the call stack. */
export function bytesToDataURL(bytes: Uint8Array, mime: string): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return `data:${mime || FALLBACK_MIME};base64,${btoa(parts.join(""))}`;
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
  const corrupt = () => new Error("This file is corrupted.");
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

const DIR_REFRESH_COOLDOWN_MS = 2_000;
const GITHUB_DIR_LIST_LIMIT = 1_000;

type DirIndex = {
  /** Maps content sha256 -> git blob sha (may be empty if just uploaded without a returned blob sha). */
  entries: Map<string, string>;
  totalEntries: number;
  fetchedAt: number;
};

async function decryptAssetEnvelope(raw: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const env = parseEnvelope(raw);
  const key = await deriveKey(passphrase, base64ToBytes(env.kdf.salt), env.kdf.iterations);
  return decryptEnvelope(env, key);
}

/**
 * Keeps the encrypted assets for one board under `<parent>/.assets/<board>/`.
 * Reads fall back to the old shared `<parent>/.assets/` so existing boards still open.
 */
export class AssetStore {
  /** Coalesced directory listings so concurrent image downloads share one listDir call. */
  private dirIndexPromise: Promise<DirIndex> | null = null;
  private legacyDirIndexPromise: Promise<DirIndex> | null = null;
  private dirRefreshedFrom = new WeakMap<DirIndex, Promise<DirIndex>>();
  private legacyRefreshedFrom = new WeakMap<DirIndex, Promise<DirIndex>>();
  readonly dir: string;
  readonly legacyDir: string;
  readonly label: string;

  constructor(
    private readonly adapter: GitHubAdapter,
    private readonly passphrase: string,
    boardPath: string,
  ) {
    this.dir = assetsDirFor(boardPath);
    this.legacyDir = legacyAssetsDirFor(boardPath);
    this.label = `${adapter.label}#assets`;
  }

  private pathFor(sha: string): string {
    return `${this.dir}/${sha}.bin`;
  }

  private cacheKey(sha: string): string {
    return `${this.adapter.label}\n${sha}`;
  }

  private async loadDirIndex(dir: string): Promise<DirIndex> {
    const rows = await this.adapter.listDir(dir);
    const entries = new Map<string, string>();
    for (const e of rows) {
      if (e.name.endsWith(".bin")) {
        entries.set(e.name.slice(0, -4), e.sha);
      }
    }
    return { entries, totalEntries: rows.length, fetchedAt: Date.now() };
  }

  private getDirIndex(which: "dir" | "legacy", forceRefresh = false): Promise<DirIndex> {
    const dir = which === "dir" ? this.dir : this.legacyDir;
    const current = which === "dir" ? this.dirIndexPromise : this.legacyDirIndexPromise;
    if (!current || forceRefresh) {
      const next = this.loadDirIndex(dir);
      if (which === "dir") this.dirIndexPromise = next;
      else this.legacyDirIndexPromise = next;
      next.catch(() => {
        if (which === "dir" && this.dirIndexPromise === next) this.dirIndexPromise = null;
        if (which === "legacy" && this.legacyDirIndexPromise === next) this.legacyDirIndexPromise = null;
      });
      return next;
    }
    return current;
  }

  private refreshStaleDirIndex(which: "dir" | "legacy", stale: DirIndex): Promise<DirIndex> {
    const slot = which === "dir" ? this.dirRefreshedFrom : this.legacyRefreshedFrom;
    const existing = slot.get(stale);
    if (existing) return existing;
    const next = this.getDirIndex(which, true);
    slot.set(stale, next);
    return next;
  }

  private async lookupInDir(
    which: "dir" | "legacy",
    assetSha: string,
  ): Promise<{ blobSha: string | null; mayBeTruncated: boolean }> {
    let idx = await this.getDirIndex(which);
    let blobSha = idx.entries.get(assetSha);
    if (blobSha === undefined && Date.now() - idx.fetchedAt > DIR_REFRESH_COOLDOWN_MS) {
      idx = await this.refreshStaleDirIndex(which, idx);
      blobSha = idx.entries.get(assetSha);
    }
    return {
      blobSha: blobSha ?? null,
      mayBeTruncated: idx.totalEntries >= GITHUB_DIR_LIST_LIMIT,
    };
  }

  private async hasAsset(sha: string, forceRefresh = false): Promise<boolean> {
    const idx = await this.getDirIndex("dir", forceRefresh);
    return idx.entries.has(sha);
  }

  /** Encrypt and store the bytes (skipped if already present). Returns the element link. */
  async put(
    bytes: Uint8Array,
    mime: string,
    opts: { cacheObjectUrl?: boolean } = {},
  ): Promise<string> {
    if (bytes.byteLength > ASSET_MAX_BYTES) {
      throw new Error(`This file is larger than ${ASSET_MAX_MB} MB.`);
    }
    const type = mime || FALLBACK_MIME;
    const sha = await sha256Hex(bytes);
    const ref = assetRefFor(sha, type);

    if (!(await this.hasAsset(sha))) {
      try {
        const salt = randomBytes(16);
        const key = await deriveKey(this.passphrase, salt, PBKDF2_ITERATIONS);
        const env = await encryptEnvelope(encodePlain(bytes, type), key, salt);
        const envelopeBytes = new TextEncoder().encode(JSON.stringify(env, null, 2));
        const res = await this.adapter
          .clone(this.pathFor(sha))
          .write(envelopeBytes, undefined, `caulk: sync ${new Date().toISOString()}`);
        const idx = await this.dirIndexPromise?.catch(() => null);
        idx?.entries.set(sha, res.sha ?? "");
        void putCachedAssetEnvelope(this.cacheKey(sha), envelopeBytes);
      } catch (err) {
        // Another tab or peer may have written the same file first. The content is
        // identical, so that counts as success. Otherwise the error is real.
        if (!(await this.hasAsset(sha, true))) throw err;
      }
    }

    const key = urlKey(this, ref);
    // Images are drawn by Excalidraw from dataURLs, so they skip the object URL cache.
    if ((opts.cacheObjectUrl ?? true) && !objectUrls.has(key)) {
      objectUrls.set(key, Promise.resolve(URL.createObjectURL(new Blob([bytes as BlobPart], { type }))));
    }
    return ref;
  }

  private async readFromDir(which: "dir" | "legacy", assetSha: string): Promise<Uint8Array | null> {
    const { blobSha, mayBeTruncated } = await this.lookupInDir(which, assetSha);
    if (blobSha) {
      try {
        return await this.adapter.readBlob(blobSha);
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) return null;
        throw err;
      }
    }
    // Fall back to /contents/ only when the blob sha wasn't returned or the dir hit GitHub's 1000-entry cap.
    if (blobSha === "" || mayBeTruncated) {
      const path = `${which === "dir" ? this.dir : this.legacyDir}/${assetSha}.bin`;
      const res = await this.adapter.clone(path).read();
      if (res.status === "ok") return res.bytes;
    }
    return null;
  }

  private async fetchEnvelopeBytes(assetSha: string): Promise<Uint8Array> {
    const primary = await this.readFromDir("dir", assetSha);
    if (primary) return primary;
    const legacy = await this.readFromDir("legacy", assetSha);
    if (legacy) return legacy;
    throw new Error("This file is missing from the board's repo.");
  }

  /** Download and decrypt an asset (cached encrypted in IndexedDB across reloads). */
  async get(ref: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const parsed = parseAssetRef(ref);
    if (!parsed) throw new Error("Not an asset reference.");

    const cacheKey = this.cacheKey(parsed.sha);
    const cached = await getCachedAssetEnvelope(cacheKey);
    if (cached) {
      try {
        const plain = await decryptAssetEnvelope(cached, this.passphrase);
        return decodePlain(plain);
      } catch {
        // Ignore stale or corrupted cache entry and re-fetch cleanly from GitHub.
      }
    }

    const raw = await this.fetchEnvelopeBytes(parsed.sha);
    const plain = await decryptAssetEnvelope(raw, this.passphrase);
    const decoded = decodePlain(plain);
    void putCachedAssetEnvelope(cacheKey, raw);
    return decoded;
  }
}
