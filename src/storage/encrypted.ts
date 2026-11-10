/**
 * Wraps any StorageAdapter with passphrase encryption.
 *
 * Owns the write-cheap bookkeeping (blob sha, ETag, last plaintext) so the sync
 * engine only has to say "the doc changed" or "tell me what changed".
 */

import {
  deriveKey,
  decryptEnvelope,
  encryptEnvelope,
  parseEnvelope,
  PBKDF2_ITERATIONS,
} from "../crypto/envelope";
import { base64ToBytes, bytesToBase64, equalBytes, randomBytes } from "../lib/bytes";
import type { StorageAdapter } from "./types";

export class EncryptedStore {
  private salt: Uint8Array | null = null;
  private saltB64: string | null = null;
  private key: CryptoKey | null = null;
  private sha: string | undefined;
  private etag: string | undefined;
  private lastPlain: Uint8Array | null = null;

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly passphrase: string,
  ) {}

  get label(): string {
    return this.adapter.label;
  }

  private async ensureKey(): Promise<CryptoKey> {
    if (this.key) return this.key;
    if (!this.salt) this.salt = randomBytes(16);
    this.saltB64 = bytesToBase64(this.salt);
    this.key = await deriveKey(this.passphrase, this.salt, PBKDF2_ITERATIONS);
    return this.key;
  }

  private adoptSalt(saltB64: string, iterations: number): Promise<CryptoKey> {
    this.saltB64 = saltB64;
    this.salt = base64ToBytes(saltB64);
    return deriveKey(this.passphrase, this.salt, iterations).then((k) => {
      this.key = k;
      return k;
    });
  }

  /** Unconditional read. Returns null when the board file does not exist yet. */
  async open(): Promise<Uint8Array | null> {
    const res = await this.adapter.read();
    if (res.status === "unchanged") return null;
    if (res.status === "missing") {
      this.sha = undefined;
      this.etag = undefined;
      this.lastPlain = null;
      await this.ensureKey();
      return null;
    }

    this.sha = res.sha;
    this.etag = res.etag;
    const env = parseEnvelope(res.bytes);
    const key = await this.adoptSalt(env.kdf.salt, env.kdf.iterations);
    const plain = await decryptEnvelope(env, key);
    this.lastPlain = plain;
    return plain;
  }

  /** Conditional read. Null means "nothing new since last time". */
  async poll(): Promise<Uint8Array | null> {
    const res = await this.adapter.read(this.etag);
    if (res.status === "unchanged" || res.status === "missing") return null;

    this.sha = res.sha;
    this.etag = res.etag;
    const env = parseEnvelope(res.bytes);
    const key =
      this.saltB64 === env.kdf.salt && this.key
        ? this.key
        : await this.adoptSalt(env.kdf.salt, env.kdf.iterations);
    const plain = await decryptEnvelope(env, key);

    if (this.lastPlain && equalBytes(this.lastPlain, plain)) return null;
    this.lastPlain = plain;
    return plain;
  }

  async save(plain: Uint8Array): Promise<void> {
    const key = await this.ensureKey();
    const env = await encryptEnvelope(plain, key, this.salt!);
    const bytes = new TextEncoder().encode(JSON.stringify(env, null, 2));

    const res = await this.adapter.write(
      bytes,
      this.sha,
      `caulk: sync ${new Date().toISOString()}`,
    );
    this.sha = res.sha;
    this.etag = undefined; // next poll revalidates from scratch
    this.lastPlain = plain;
  }
}
