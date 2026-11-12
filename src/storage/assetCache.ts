/**
 * Local IndexedDB cache for *encrypted* asset envelopes.
 *
 * Caching ciphertext (rather than plaintext) keeps GitHub's zero-trust model
 * intact—decryption with the board's passphrase still runs on every read—while
 * dropping repeat API calls for unchanged content-addressed assets to zero.
 */

const DB_NAME = "caulk-asset-envelopes";
const STORE = "blobs";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function runTx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getCachedAssetEnvelope(key: string): Promise<Uint8Array | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const val = await runTx(db, "readonly", (s) => s.get(key) as IDBRequest<unknown>);
    if (val instanceof Uint8Array) return val;
    if (val instanceof ArrayBuffer) return new Uint8Array(val);
    return null;
  } catch {
    return null;
  }
}

export async function putCachedAssetEnvelope(key: string, bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await runTx(db, "readwrite", (s) => s.put(bytes, key));
  } catch {
    /* quota full or private mode: asset still decrypts in memory */
  }
}
