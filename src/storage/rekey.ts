/**
 * Change a board's password. Every file the board owns (the board itself, its
 * per-board assets, its history snapshots) is decrypted with the old passphrase,
 * encrypted with the new one, and written in ONE commit. Either all of them move or
 * none do, so a failed run never leaves a board half under each password.
 */

import { historyDirFor } from "../config";
import { deriveKey, decryptEnvelope, encryptEnvelope, parseEnvelope, PBKDF2_ITERATIONS } from "../crypto/envelope";
import { base64ToBytes, randomBytes } from "../lib/bytes";
import { assetsDirFor, legacyAssetsDirFor } from "./assets";
import { ConflictError, type GitHubAdapter } from "./github";

export async function rekeyBoard(opts: {
  adapter: GitHubAdapter; // configured for the board path
  boardPath: string;
  oldPassphrase: string;
  newPassphrase: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  // Someone saving between our read and our commit makes the commit fail. Start over
  // once from a fresh read, then let the error through.
  try {
    await rekeyOnce(opts);
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    await rekeyOnce(opts);
  }
}

async function rekeyOnce({
  adapter,
  boardPath,
  oldPassphrase,
  newPassphrase,
  onProgress,
}: {
  adapter: GitHubAdapter;
  boardPath: string;
  oldPassphrase: string;
  newPassphrase: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const head = await adapter.branchHead();

  const assetsDir = assetsDirFor(boardPath);
  const historyDir = historyDirFor(boardPath);
  const assetFiles = (await adapter.clone(assetsDir).listDir(assetsDir))
    .filter((e) => e.name.endsWith(".bin"))
    .map((e) => `${assetsDir}/${e.name}`);
  const historyFiles = (await adapter.clone(historyDir).listDir(historyDir)).map(
    (e) => `${historyDir}/${e.name}`,
  );
  const paths = [boardPath, ...assetFiles, ...historyFiles];

  // One new salt and one key for the whole batch. Old keys are cached per salt.
  const newSalt = randomBytes(16);
  const newKey = await deriveKey(newPassphrase, newSalt, PBKDF2_ITERATIONS);
  const oldKeys = new Map<string, CryptoKey>();

  const encode = (next: unknown) => new TextEncoder().encode(JSON.stringify(next, null, 2));
  const out: Array<{ path: string; bytes: Uint8Array }> = [];
  let boardPlain: Uint8Array | null = null;
  for (const path of paths) {
    const res = await adapter.clone(path).read();
    if (res.status === "missing" && path === boardPath) {
      // A board that was never saved has nothing to re-key.
      onProgress?.(out.length, paths.length);
      continue;
    }
    if (res.status !== "ok") {
      throw new Error(`"${path}" could not be read (${res.status}). Nothing was changed.`);
    }

    const env = parseEnvelope(res.bytes);
    const cacheKey = `${env.kdf.salt}:${env.kdf.iterations}`;
    let oldKey = oldKeys.get(cacheKey);
    if (!oldKey) {
      oldKey = await deriveKey(oldPassphrase, base64ToBytes(env.kdf.salt), env.kdf.iterations);
      oldKeys.set(cacheKey, oldKey);
    }

    let plain: Uint8Array;
    try {
      plain = await decryptEnvelope(env, oldKey);
    } catch {
      throw new Error(
        `"${path}" does not open with the current password. Nothing was changed. Check the password and try again.`,
      );
    }

    if (path === boardPath) boardPlain = plain;
    const next = await encryptEnvelope(plain, newKey, newSalt);
    out.push({ path, bytes: encode(next) });
    onProgress?.(out.length, paths.length);
  }

  // Legacy shared-dir assets the board's doc points at. Copy each one into the per-board
  // dir under the new passphrase and leave the legacy file where it is. A legacy file that
  // does not open with this password belongs to another board, so it is skipped.
  if (boardPlain) {
    const refs = new Set<string>();
    for (const m of new TextDecoder("utf-8").decode(boardPlain).matchAll(/caulk-asset:([0-9a-f]{64})/g)) {
      refs.add(m[1]);
    }
    const haveInBoardDir = new Set(assetFiles.map((p) => p.slice(p.lastIndexOf("/") + 1)));
    const legacyDir = legacyAssetsDirFor(boardPath);
    for (const sha of refs) {
      const name = `${sha}.bin`;
      if (haveInBoardDir.has(name)) continue;
      const res = await adapter.clone(`${legacyDir}/${name}`).read();
      if (res.status !== "ok") continue;
      let plain: Uint8Array;
      try {
        const env = parseEnvelope(res.bytes);
        const key = await deriveKey(oldPassphrase, base64ToBytes(env.kdf.salt), env.kdf.iterations);
        plain = await decryptEnvelope(env, key);
      } catch {
        continue;
      }
      out.push({ path: `${assetsDir}/${name}`, bytes: encode(await encryptEnvelope(plain, newKey, newSalt)) });
    }
  }

  if (out.length === 0) return;
  await adapter.commitFiles(out, "Change board password", { expectedHead: head });
}
