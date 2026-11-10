/**
 * Snapshots: periodic restore points, stored as encrypted board files next to
 * the live board.
 *
 *   boards/roadmap.slate                        live board
 *   boards/.history/roadmap/1718000000000-ana-4f2a.slate
 *
 * Each snapshot is a full encrypted Yjs update, so restoring one is a plain
 * local edit rather than a rewrite of history — the old state stays in the
 * snapshot you restored from.
 */

import * as Y from "yjs";
import { EncryptedStore } from "../storage/encrypted";
import type { GitHubAdapter } from "../storage/github";
import { sanitizeElement, type ElementMeta } from "../crdt/scene";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type SnapshotInfo = {
  name: string;
  path: string;
  at: number;
  author: string;
  size: number;
  sha: string;
};

export type RestoredBoard = {
  elements: ExcalidrawElement[];
  meta: Map<string, ElementMeta>;
};

const KEEP = 40;

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "anon"
  );
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function parseName(name: string): { at: number; author: string } | null {
  const base = name.replace(/\.slate$/i, "");
  const parts = base.split("-");
  if (parts.length < 3) return null;
  const at = Number(parts[0]);
  if (!Number.isFinite(at)) return null;
  return { at, author: parts.slice(1, -1).join("-") || "unknown" };
}

export class SnapshotStore {
  constructor(
    private readonly adapter: GitHubAdapter,
    private readonly passphrase: string,
    readonly dir: string,
  ) {}

  async list(): Promise<SnapshotInfo[]> {
    const entries = await this.adapter.listDir(this.dir);
    const out: SnapshotInfo[] = [];
    for (const entry of entries) {
      if (!entry.name.endsWith(".slate")) continue;
      const parsed = parseName(entry.name);
      if (!parsed) continue;
      out.push({
        name: entry.name,
        path: `${this.dir}/${entry.name}`,
        at: parsed.at,
        author: parsed.author,
        size: entry.size,
        sha: entry.sha,
      });
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async create(doc: Y.Doc, author: string): Promise<SnapshotInfo> {
    const name = `${Date.now()}-${slug(author)}-${suffix()}.slate`;
    const path = `${this.dir}/${name}`;
    const store = new EncryptedStore(this.adapter.clone(path), this.passphrase);
    await store.save(Y.encodeStateAsUpdate(doc));
    return {
      name,
      path,
      at: Number(name.split("-")[0]),
      author: slug(author),
      size: 0,
      sha: "",
    };
  }

  async read(path: string): Promise<RestoredBoard> {
    const store = new EncryptedStore(this.adapter.clone(path), this.passphrase);
    const bytes = await store.open();
    if (!bytes) throw new Error("That snapshot could not be read.");

    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, bytes);
      const order = doc.getArray<string>("order").toArray();
      const stored = doc.getMap<ExcalidrawElement>("elements");
      const elements: ExcalidrawElement[] = [];
      const seen = new Set<string>();
      for (const id of order) {
        const el = stored.get(id);
        if (el && !seen.has(id)) {
          elements.push(sanitizeElement(JSON.parse(JSON.stringify(el))));
          seen.add(id);
        }
      }
      for (const [id, el] of stored.entries()) {
        if (!seen.has(id)) {
          elements.push(sanitizeElement(JSON.parse(JSON.stringify(el))));
          seen.add(id);
        }
      }
      const meta = new Map<string, ElementMeta>();
      for (const [id, record] of doc.getMap<ElementMeta>("meta").entries()) {
        meta.set(id, { ...record });
      }
      return { elements, meta };
    } finally {
      doc.destroy();
    }
  }

  /** Keep the repo from growing without limit. Best effort, never throws. */
  async prune(): Promise<void> {
    try {
      const all = await this.list();
      for (const snapshot of all.slice(KEEP)) {
        await this.adapter.remove(snapshot.path, snapshot.sha, "caulk: prune old snapshots");
      }
    } catch {
      /* pruning is housekeeping, not correctness */
    }
  }
}
