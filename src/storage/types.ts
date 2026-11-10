/**
 * The storage seam. Everything that touches "the cloud" implements this, so
 * swapping GitHub for Google Drive later is a new file, not a rewrite.
 *
 * Adapters deal in opaque bytes: encryption happens above this layer.
 */

export type ReadResult =
  | { status: "missing" }
  | { status: "unchanged" }
  | { status: "ok"; bytes: Uint8Array; sha?: string; etag?: string };

export type WriteResult = { sha?: string };

export type RateLimit = { remaining: number; limit: number; resetAt: number } | null;

export interface StorageAdapter {
  /** Human readable target, e.g. `owner/repo:boards/roadmap.slate`. */
  readonly label: string;
  /** Unconditional read when `etag` is omitted, conditional (304) when provided. */
  read(etag?: string): Promise<ReadResult>;
  /** `prevSha` is required by GitHub to overwrite an existing file. */
  write(bytes: Uint8Array, prevSha: string | undefined, message: string): Promise<WriteResult>;
  /** Last rate-limit snapshot seen on any response. */
  rateLimit(): RateLimit;
}
