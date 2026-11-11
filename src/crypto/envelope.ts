/**
 * Client-side encryption for the board file that lands in a GitHub repo.
 *
 * The file on GitHub is a JSON envelope: metadata is readable, the board itself
 * is AES-GCM ciphertext. The key is derived from a passphrase with PBKDF2 and
 * never leaves the browser, so a public repo leaks nothing but the fact that a
 * board exists.
 */

import { base64ToBytes, bytesToBase64, randomBytes } from "../lib/bytes";

export const PBKDF2_ITERATIONS = 600_000;

export type Envelope = {
  v: 1;
  app: "caulk" | "slateboard";
  kdf: {
    algo: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  iv: string;
  data: string;
};

function toBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toBuffer(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptEnvelope(
  plain: Uint8Array,
  key: CryptoKey,
  salt: Uint8Array,
): Promise<Envelope> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    key,
    toBuffer(plain),
  );
  return {
    v: 1,
    app: "caulk",
    kdf: {
      algo: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
}

export function parseEnvelope(bytes: Uint8Array): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("This file is not a Caulk board (unreadable JSON).");
  }
  const env = parsed as Partial<Envelope>;
  if (
    env?.v !== 1 ||
    (env.app !== "caulk" && env.app !== "slateboard") ||
    !env.kdf?.salt ||
    !env.iv ||
    !env.data
  ) {
    throw new Error("This file is not a Caulk board (unexpected format).");
  }
  return env as Envelope;
}

/** The passphrase did not open the envelope (or the file is corrupted). */
export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase for this board, or the file is corrupted.");
    this.name = "WrongPassphraseError";
  }
}

export async function decryptEnvelope(env: Envelope, key: CryptoKey): Promise<Uint8Array> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBuffer(base64ToBytes(env.iv)) },
      key,
      toBuffer(base64ToBytes(env.data)),
    );
    return new Uint8Array(plain);
  } catch {
    throw new WrongPassphraseError();
  }
}
