/**
 * Images that were added to the board but are not in the repo yet. They are kept
 * in IndexedDB so a reload or a dropped connection doesn't lose them before the
 * upload finishes. Without IndexedDB (Node tests, locked-down browsers) an
 * in-memory Map is used instead, which is enough for a single session.
 */

import type { BinaryFileData } from "@excalidraw/excalidraw/types";

const DB_NAME = "caulk-pending-assets";
const STORE = "files";

type Row = { boardKey: string; file: BinaryFileData };

const memory = new Map<string, Row>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

const keyFor = (boardKey: string, fileId: string): string => `${boardKey}\n${fileId}`;

/** Resolves to null when IndexedDB is missing or cannot be opened. */
function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === "undefined") return resolve(null);
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

function request<T>(
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

export async function putPending(boardKey: string, file: BinaryFileData): Promise<void> {
  const key = keyFor(boardKey, file.id);
  const row: Row = { boardKey, file };
  const db = await openDb();
  if (db) {
    try {
      await request(db, "readwrite", (s) => s.put(row, key));
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memory.set(key, row);
}

export async function removePending(boardKey: string, fileId: string): Promise<void> {
  const key = keyFor(boardKey, fileId);
  memory.delete(key);
  const db = await openDb();
  if (db) {
    try {
      await request(db, "readwrite", (s) => s.delete(key));
    } catch {
      /* the row is harmless; a later upload removes it again */
    }
  }
}

export async function listPending(boardKey: string): Promise<BinaryFileData[]> {
  const db = await openDb();
  let rows: Row[] = [];
  if (db) {
    try {
      rows = await request(db, "readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    } catch {
      rows = Array.from(memory.values());
    }
  } else {
    rows = Array.from(memory.values());
  }
  return rows.filter((r) => r.boardKey === boardKey).map((r) => r.file);
}
