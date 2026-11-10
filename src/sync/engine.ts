/**
 * The sync loop: one Y.Doc, one encrypted store, poll for changes, debounce
 * writes, and resolve the occasional write race by merging.
 *
 * Deliberately dumb in the right places: there is exactly one writer-side
 * mechanism (debounce + retry-on-conflict) and one reader-side mechanism
 * (conditional poll). Yjs merges are commutative, so a retry after a conflict
 * is lossless rather than destructive.
 */

import * as Y from "yjs";
import { ConflictError } from "../storage/github";
import type { EncryptedStore } from "../storage/encrypted";

export type SyncStatus =
  | { kind: "loading" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export type SyncEngineOptions = {
  doc: Y.Doc;
  store: EncryptedStore;
  /** How often to check GitHub while the tab is visible. */
  pollMs?: number;
  /** How long to wait after the last local edit before committing. */
  debounceMs?: number;
  /** Never let continuous editing postpone the commit longer than this. */
  maxWaitMs?: number;
  onStatus: (status: SyncStatus) => void;
  onRemoteApplied?: () => void;
  /** Fired after every successful commit, used to schedule snapshots. */
  onCommitted?: () => void;
};

const ORIGIN_LOCAL = "local";
const ORIGIN_REMOTE = "remote";

export class SyncEngine {
  private readonly doc: Y.Doc;
  private readonly store: EncryptedStore;
  private readonly pollMs: number;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly onStatus: (status: SyncStatus) => void;
  private readonly onRemoteApplied?: () => void;
  private readonly onCommitted?: () => void;

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private firstDirtyAt = 0;
  private saving = false;
  private polling = false;
  private queuedSave = false;
  private disposed = false;
  private lastPollAt = 0;

  constructor(opts: SyncEngineOptions) {
    this.doc = opts.doc;
    this.store = opts.store;
    this.pollMs = opts.pollMs ?? 2500;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.maxWaitMs = opts.maxWaitMs ?? 15_000;
    this.onStatus = opts.onStatus;
    this.onRemoteApplied = opts.onRemoteApplied;
    this.onCommitted = opts.onCommitted;
    this.doc.on("update", this.handleDocUpdate);
  }

  get lastPolledAt(): number {
    return this.lastPollAt;
  }

  async start(): Promise<boolean> {
    this.emit({ kind: "loading" });
    try {
      const bytes = await this.store.open();
      if (this.disposed) return false;
      if (bytes) {
        Y.applyUpdate(this.doc, bytes, ORIGIN_REMOTE);
        this.onRemoteApplied?.();
      }
      this.lastPollAt = Date.now();
      this.emit({ kind: "saved", at: this.lastPollAt });
      this.pollTimer = setInterval(() => void this.poll(), this.pollMs);
      document.addEventListener("visibilitychange", this.handleVisibility);
      return true;
    } catch (err) {
      this.fail(err);
      return false;
    }
  }

  stop(): void {
    this.disposed = true;
    this.doc.off("update", this.handleDocUpdate);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    document.removeEventListener("visibilitychange", this.handleVisibility);
  }

  /** Force a pull, e.g. from a "Sync now" button. */
  async pullNow(): Promise<void> {
    await this.poll();
  }

  /** Force a push, e.g. from a "Save now" button or on unload. */
  async saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    await this.flush();
  }

  private handleDocUpdate = (_update: Uint8Array, origin: unknown): void => {
    if (origin !== ORIGIN_LOCAL || this.disposed) return;
    this.emit({ kind: "pending" });
    if (!this.firstDirtyAt) this.firstDirtyAt = Date.now();

    // A long uninterrupted edit session still gets committed periodically
    // instead of waiting for the user to stop.
    if (Date.now() - this.firstDirtyAt >= this.maxWaitMs) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = undefined;
      }
      void this.flush();
      return;
    }

    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.flush();
    }, this.debounceMs);
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === "visible") void this.poll();
  };

  private async poll(): Promise<void> {
    if (this.disposed || this.saving || this.polling) return;
    if (document.visibilityState === "hidden") return;
    this.polling = true;
    this.lastPollAt = Date.now();
    try {
      const bytes = await this.store.poll();
      if (!bytes || this.disposed) return;
      Y.applyUpdate(this.doc, bytes, ORIGIN_REMOTE);
      this.onRemoteApplied?.();
      if (!this.saving) this.emit({ kind: "saved", at: Date.now() });
    } catch (err) {
      this.fail(err);
    } finally {
      this.polling = false;
    }
  }

  private async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.saving) {
      this.queuedSave = true;
      return;
    }

    this.saving = true;
    this.emit({ kind: "saving" });
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const bytes = Y.encodeStateAsUpdate(this.doc);
        try {
          await this.store.save(bytes);
          this.firstDirtyAt = 0;
          if (!this.disposed) this.emit({ kind: "saved", at: Date.now() });
          this.onCommitted?.();
          return;
        } catch (err) {
          if (err instanceof ConflictError && attempt < 2) {
            // Another client committed first. Pull their state, merge, retry.
            const remote = await this.store.open();
            if (remote) Y.applyUpdate(this.doc, remote, ORIGIN_REMOTE);
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      this.fail(err);
    } finally {
      this.saving = false;
      if (this.queuedSave && !this.disposed) {
        this.queuedSave = false;
        this.emit({ kind: "pending" });
        this.saveTimer = setTimeout(() => {
          this.saveTimer = undefined;
          void this.flush();
        }, this.debounceMs);
      }
    }
  }

  private emit(status: SyncStatus): void {
    if (!this.disposed) this.onStatus(status);
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.emit({ kind: "error", message });
  }
}
