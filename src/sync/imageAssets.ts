/**
 * Moves board images out of the Yjs `files` map and into the repo's asset store.
 *
 * Yjs keeps an image as a data URL until it is uploaded, then as a small
 * `AssetFileRef` that points at `.assets/<sha>.bin`. Peers resolve the ref by
 * downloading the asset and turning it back into a data URL for Excalidraw.
 *
 * Uploads run one at a time. Each new image is written to the pending queue
 * (IndexedDB) before it is uploaded, so a reload or an offline spell doesn't
 * lose it. Failed uploads stay queued and are retried every 15s and on "online".
 */

import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { AssetFileRef, SceneBridge } from "../crdt/scene";
import { bytesToDataURL, dataURLToBytes, type AssetStore } from "../storage/assets";
import { listPending, putPending, removePending } from "../storage/pendingUploads";

const RETRY_MS = 15_000;
/** Parallel asset downloads. A burst of dozens trips GitHub's secondary rate limit. */
const MAX_DOWNLOADS = 3;
const DOWNLOAD_RETRY_MS = [3_000, 10_000, 30_000, 60_000];

export class ImageAssetSync {
  private readonly bridge: SceneBridge;
  private readonly store: AssetStore;
  private readonly boardKey: string;
  private readonly addFiles: (files: BinaryFileData[]) => void;
  private readonly onError?: (message: string) => void;

  /** Queued or uploading. Keeps repeated onChange calls from re-uploading. */
  private readonly inFlight = new Set<string>();
  /** Uploaded by us, or downloaded and handed to Excalidraw. */
  private readonly resolved = new Set<string>();
  /** Refs being downloaded right now. */
  private readonly resolving = new Set<string>();
  private queue: BinaryFileData[] = [];
  private draining = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadFailures = 0;
  private activeDownloads = 0;
  private disposed = false;

  constructor(opts: {
    bridge: SceneBridge;
    store: AssetStore;
    boardKey: string;
    addFiles: (files: BinaryFileData[]) => void;
    onError?: (message: string) => void;
  }) {
    this.bridge = opts.bridge;
    this.store = opts.store;
    this.boardKey = opts.boardKey;
    this.addFiles = opts.addFiles;
    this.onError = opts.onError;
  }

  start(): void {
    this.disposed = false;
    this.bridge.onLocalFiles = (files) => {
      void this.enqueue(files);
    };
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    void this.retryPending();
    this.resolveRefs();
    this.migrateInline();
  }

  /** Download any asset ref we don't have yet and hand the image to Excalidraw. */
  resolveRefs(): void {
    if (this.disposed) return;
    for (const ref of this.bridge.getFileRefs()) {
      if (this.activeDownloads >= MAX_DOWNLOADS) return;
      if (this.resolved.has(ref.id) || this.inFlight.has(ref.id) || this.resolving.has(ref.id)) {
        continue;
      }
      this.resolving.add(ref.id);
      this.activeDownloads += 1;
      void this.download(ref).finally(() => {
        this.resolving.delete(ref.id);
        this.activeDownloads -= 1;
        this.resolveRefs();
      });
    }
  }

  /** Failed downloads are retried with backoff, so a photo never stays a placeholder. */
  private scheduleDownloadRetry(): void {
    if (this.downloadRetryTimer || this.disposed) return;
    const delay = DOWNLOAD_RETRY_MS[Math.min(this.downloadFailures, DOWNLOAD_RETRY_MS.length - 1)];
    this.downloadFailures += 1;
    this.downloadRetryTimer = setTimeout(() => {
      this.downloadRetryTimer = null;
      this.resolveRefs();
    }, delay);
  }

  dispose(): void {
    this.disposed = true;
    this.bridge.onLocalFiles = undefined;
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.downloadRetryTimer) clearTimeout(this.downloadRetryTimer);
    this.downloadRetryTimer = null;
  }

  private async download(ref: AssetFileRef): Promise<void> {
    try {
      const { bytes, mime } = await this.store.get(ref.asset);
      if (this.disposed) return;
      this.resolved.add(ref.id);
      this.downloadFailures = 0;
      this.addFiles([
        {
          id: ref.id as BinaryFileData["id"],
          mimeType: ref.mimeType as BinaryFileData["mimeType"],
          created: ref.created,
          dataURL: bytesToDataURL(bytes, mime) as DataURL,
        },
      ]);
    } catch (err) {
      // Not marked resolved: retried with backoff.
      console.warn("[caulk] image download failed", ref.id, err);
      if (this.downloadFailures === 0) this.onError?.(errorMessage(err, "This file could not be loaded."));
      this.scheduleDownloadRetry();
    }
  }

  /** Persist new images, then queue them for upload. */
  private async enqueue(files: BinaryFileData[]): Promise<void> {
    if (this.disposed) return;
    const fresh = files.filter(
      (f) => f.dataURL && !this.inFlight.has(f.id) && !this.resolved.has(f.id),
    );
    if (fresh.length === 0) return;
    for (const f of fresh) this.inFlight.add(f.id);
    await Promise.all(fresh.map((f) => putPending(this.boardKey, f)));
    this.queue.push(...fresh);
    void this.drain();
  }

  /** Images that were queued before a reload: show them again, then upload. */
  private async retryPending(): Promise<void> {
    const pending = await listPending(this.boardKey);
    if (this.disposed) return;
    const fresh = pending.filter((f) => !this.inFlight.has(f.id) && !this.resolved.has(f.id));
    if (fresh.length === 0) return;
    for (const f of fresh) this.inFlight.add(f.id);
    this.addFiles(fresh);
    this.queue.push(...fresh);
    void this.drain();
  }

  /** Images still stored inline in Yjs (from before assets existed). */
  migrateInline(): void {
    void this.enqueue(this.bridge.getInlineFiles());
  }

  private async drain(): Promise<void> {
    if (this.draining || this.disposed) return;
    this.draining = true;
    const failed: BinaryFileData[] = [];
    let lastError: unknown = null;
    try {
      for (let file = this.queue.shift(); file && !this.disposed; file = this.queue.shift()) {
        try {
          await this.upload(file);
        } catch (err) {
          failed.push(file);
          lastError = err;
        }
      }
    } finally {
      this.draining = false;
    }
    if (this.disposed) return;
    if (failed.length > 0) {
      this.queue.push(...failed);
      this.onError?.(errorMessage(lastError, "This file could not be uploaded. Will retry."));
      this.scheduleRetry();
    }
  }

  private async upload(file: BinaryFileData): Promise<void> {
    const { bytes, mime } = dataURLToBytes(file.dataURL);
    const asset = await this.store.put(bytes, mime, { cacheObjectUrl: false });
    if (this.disposed) return;
    this.bridge.setFileAsset({
      id: file.id,
      mimeType: file.mimeType,
      created: file.created,
      asset,
    });
    await removePending(this.boardKey, file.id);
    this.inFlight.delete(file.id);
    this.resolved.add(file.id);
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.drain();
    }, RETRY_MS);
  }

  private readonly onOnline = (): void => {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    void this.drain();
  };
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
