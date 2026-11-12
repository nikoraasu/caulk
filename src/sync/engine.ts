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
import { ConflictError, GitHubError } from "../storage/github";
import { WrongPassphraseError } from "../crypto/envelope";
import { equalBytes } from "../lib/bytes";
import type { EncryptedStore } from "../storage/encrypted";

export type SyncStatus =
  | { kind: "loading" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  /** The board is encrypted with a different passphrase than the one we have. */
  | { kind: "locked" };

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
  private pollMs: number;
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
  /** True only after start() has opened the board with the current passphrase. */
  private started = false;
  /** True once the board refused our passphrase. Nothing may be saved then. */
  private locked = false;
  /** A local edit arrived before start() finished; it gets saved once we're open. */
  private dirtyBeforeStart = false;
  /** Whether this client is currently elected to commit to GitHub. */
  private saver = true;
  /** Whether the doc has local or live edits not yet confirmed in GitHub. */
  private dirty = false;
  /** Origin used by LiveSession when applying remote live edits. */
  private liveOrigin: unknown = undefined;
  private rateBackoffMs = 0;
  private rateBackoffUntil = 0;

  constructor(opts: SyncEngineOptions) {
    this.doc = opts.doc;
    this.store = opts.store;
    this.pollMs = opts.pollMs ?? 2500;
    this.debounceMs = opts.debounceMs ?? 10_000;
    this.maxWaitMs = opts.maxWaitMs ?? 60_000;
    this.onStatus = opts.onStatus;
    this.onRemoteApplied = opts.onRemoteApplied;
    this.onCommitted = opts.onCommitted;
    this.doc.on("update", this.handleDocUpdate);
  }

  get lastPolledAt(): number {
    return this.lastPollAt;
  }

  get isSaver(): boolean {
    return this.saver;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  /** Marks live relay updates as dirty so the elected saver commits peer edits too. */
  setLiveOrigin(origin: unknown): void {
    this.liveOrigin = origin;
  }

  /** Adjusts the GitHub poll cadence (e.g. 30s when live relay is up, 2.5s when down). */
  setPollMs(ms: number): void {
    if (ms === this.pollMs) return;
    const prev = this.pollMs;
    this.pollMs = ms;
    if (!this.started || this.disposed || this.locked) return;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => void this.poll(), this.pollMs);
    if (ms < prev && Date.now() - this.lastPollAt >= ms) {
      void this.poll();
    }
  }

  /**
   * Controls whether this engine commits to GitHub. Non-savers keep tracking dirty
   * state so if the elected saver leaves before committing, the new saver takes over.
   */
  setSaver(enabled: boolean): void {
    if (this.saver === enabled || this.disposed || this.locked) return;
    this.saver = enabled;
    if (!enabled) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = undefined;
      }
      this.queuedSave = false;
      return;
    }
    if (this.started && this.dirty && !this.saving && !this.saveTimer) {
      this.scheduleSave();
    }
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
      this.started = true;
      this.lastPollAt = Date.now();
      this.emit({ kind: "saved", at: this.lastPollAt });
      this.pollTimer = setInterval(() => void this.poll(), this.pollMs);
      document.addEventListener("visibilitychange", this.handleVisibility);
      if (this.dirtyBeforeStart) {
        this.dirtyBeforeStart = false;
        this.handleDocUpdate(new Uint8Array(), ORIGIN_LOCAL);
      }
      return true;
    } catch (err) {
      this.handleError(err);
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
    this.rateBackoffMs = 0;
    this.rateBackoffUntil = 0;
    await this.poll();
  }

  /** Force a push, e.g. from a "Save now" button or before re-keying. */
  async saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    await this.flush();
  }

  /** Save on tab hide only when this client is the elected saver and has unsaved edits. */
  async saveOnHide(): Promise<void> {
    if (!this.saver || !this.dirty) return;
    await this.saveNow();
  }

  private isDirtyOrigin(origin: unknown): boolean {
    return origin === ORIGIN_LOCAL || (this.liveOrigin !== undefined && origin === this.liveOrigin);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // Edits before start() or while locked stay in memory. Saving them with
    // the wrong key would overwrite the board, so no timers are armed.
    if (!this.isDirtyOrigin(origin) || this.disposed || this.locked) return;
    if (origin !== ORIGIN_LOCAL && update.length === 0) return;
    if (!this.started) {
      this.dirtyBeforeStart = true;
      return;
    }
    this.dirty = true;
    this.emit({ kind: "pending" });
    if (!this.saver) return;
    this.scheduleSave();
  };

  private scheduleSave(): void {
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
  }

  private handleVisibility = (): void => {
    if (document.visibilityState === "visible") void this.poll();
  };

  private async poll(): Promise<void> {
    if (this.disposed || this.locked || this.saving || this.polling) return;
    if (document.visibilityState === "hidden") return;
    if (Date.now() < this.rateBackoffUntil) return;
    this.polling = true;
    this.lastPollAt = Date.now();
    try {
      const bytes = await this.store.poll();
      this.rateBackoffMs = 0;
      this.rateBackoffUntil = 0;
      if (!bytes || this.disposed) return;
      Y.applyUpdate(this.doc, bytes, ORIGIN_REMOTE);
      this.onRemoteApplied?.();
      if (this.dirty && equalBytes(bytes, Y.encodeStateAsUpdate(this.doc))) {
        this.dirty = false;
        this.firstDirtyAt = 0;
      }
      if (!this.saving) {
        this.emit(this.dirty ? { kind: "pending" } : { kind: "saved", at: Date.now() });
      }
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 403 || err.status === 429)) {
        this.rateBackoffMs = this.rateBackoffMs ? Math.min(300_000, this.rateBackoffMs * 2) : 60_000;
        this.rateBackoffUntil = Date.now() + this.rateBackoffMs;
      }
      this.handleError(err);
    } finally {
      this.polling = false;
    }
  }

  private async flush(): Promise<void> {
    if (this.disposed || !this.started || this.locked) return;
    if (this.saving) {
      this.queuedSave = true;
      return;
    }

    this.saving = true;
    this.emit({ kind: "saving" });
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        this.dirty = false;
        const bytes = Y.encodeStateAsUpdate(this.doc);
        try {
          await this.store.save(bytes);
          this.firstDirtyAt = 0;
          if (!this.disposed && !this.dirty) this.emit({ kind: "saved", at: Date.now() });
          this.onCommitted?.();
          return;
        } catch (err) {
          if (err instanceof ConflictError && attempt < 2) {
            // Another client committed first. Pull their state, merge, retry.
            let remote: Uint8Array | null;
            try {
              remote = await this.store.open();
            } catch (openErr) {
              // Someone re-keyed the board. Retrying would only overwrite it.
              this.dirty = true;
              if (openErr instanceof WrongPassphraseError) this.lock();
              else this.fail(openErr);
              return;
            }
            if (remote) Y.applyUpdate(this.doc, remote, ORIGIN_REMOTE);
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      this.dirty = true;
      this.handleError(err);
    } finally {
      this.saving = false;
      if (this.queuedSave && !this.disposed && !this.locked) {
        this.queuedSave = false;
        if (this.saver) {
          this.emit({ kind: "pending" });
          this.saveTimer = setTimeout(() => {
            this.saveTimer = undefined;
            void this.flush();
          }, this.debounceMs);
        }
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

  private handleError(err: unknown): void {
    if (err instanceof WrongPassphraseError) this.lock();
    else this.fail(err);
  }

  /** Stop saving and polling for good. Only a fresh engine with the right passphrase can resume. */
  private lock(): void {
    this.locked = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.queuedSave = false;
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.emit({ kind: "locked" });
  }
}
