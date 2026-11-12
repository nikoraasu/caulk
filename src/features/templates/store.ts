/**
 * Pure template serialization, ID-remapped instantiation, and encrypted GitHub storage.
 * Keeps zero runtime imports from @excalidraw/excalidraw so Node sync tests can import it.
 */

import * as Y from "yjs";
import { EncryptedStore } from "../../storage/encrypted";
import { GitHubAdapter } from "../../storage/github";
import type { BoardTemplate, TemplateElement } from "./types";

const BASE_VERSION_NONCE = () => Math.floor(Math.random() * 2_000_000_000);
const BASE_SEED = () => Math.floor(Math.random() * 2_000_000_000);

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

export function slugifyTemplateName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `template-${Date.now()}`
  );
}

/** Computes bounding box across an array of elements. */
export function elementsBounds(elements: readonly TemplateElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 600, maxY: 400, width: 600, height: 400 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const x = Number(el.x) || 0;
    const y = Number(el.y) || 0;
    const w = Math.abs(Number(el.width) || 0);
    const h = Math.abs(Number(el.height) || 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(120, maxX - minX),
    height: Math.max(100, maxY - minY),
  };
}

/**
 * Strips runtime-only flags and normalizes a selection of canvas elements
 * around (0, 0) so saved templates insert cleanly anywhere.
 */
export function normalizeSelectionForTemplate(
  rawElements: readonly TemplateElement[],
): TemplateElement[] {
  const active = rawElements.filter((el) => !el.isDeleted);
  if (active.length === 0) return [];
  const bounds = elementsBounds(active);
  return active.map((el) => {
    const clone = JSON.parse(JSON.stringify(el)) as TemplateElement;
    clone.x = (Number(clone.x) || 0) - bounds.minX;
    clone.y = (Number(clone.y) || 0) - bounds.minY;
    clone.frameId = null;
    return clone;
  });
}

/**
 * Clones template elements with fresh IDs (remapping containerId, boundElements,
 * startBinding/endBinding, and groupIds), shifts to center at (centerX, centerY),
 * and optionally wraps everything inside a new labeled Frame element.
 */
export function instantiateTemplate(
  template: Pick<BoardTemplate, "name" | "elements">,
  opts: {
    centerX?: number;
    centerY?: number;
    wrapInFrame?: boolean;
    padding?: number;
  } = {},
): TemplateElement[] {
  const source = template.elements.filter((el) => !el.isDeleted);
  if (source.length === 0) return [];

  const bounds = elementsBounds(source);
  const cx = opts.centerX ?? 0;
  const cy = opts.centerY ?? 0;
  const dx = cx - (bounds.minX + bounds.width / 2);
  const dy = cy - (bounds.minY + bounds.height / 2);
  const pad = opts.padding ?? 48;

  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();

  for (const el of source) {
    const oldId = String(el.id ?? randomId("el"));
    idMap.set(oldId, randomId("tpl"));
    const gids = Array.isArray(el.groupIds) ? (el.groupIds as string[]) : [];
    for (const gid of gids) {
      if (!groupMap.has(gid)) groupMap.set(gid, randomId("grp"));
    }
  }

  const wrapInFrame = opts.wrapInFrame !== false;
  const frameId = wrapInFrame ? randomId("frame") : null;
  const now = Date.now();

  const cloned: TemplateElement[] = source.map((el) => {
    const copy = JSON.parse(JSON.stringify(el)) as TemplateElement;
    const oldId = String(el.id ?? "");
    copy.id = idMap.get(oldId) ?? randomId("tpl");
    copy.x = (Number(el.x) || 0) + dx;
    copy.y = (Number(el.y) || 0) + dy;
    copy.version = 1;
    copy.versionNonce = BASE_VERSION_NONCE();
    copy.seed = BASE_SEED();
    copy.updated = now;
    copy.isDeleted = false;

    if (typeof copy.containerId === "string" && idMap.has(copy.containerId)) {
      copy.containerId = idMap.get(copy.containerId)!;
    } else if (copy.containerId) {
      copy.containerId = null;
    }

    if (Array.isArray(copy.boundElements)) {
      copy.boundElements = (copy.boundElements as Array<{ id: string; type: string }>)
        .filter((b) => idMap.has(b.id))
        .map((b) => ({ ...b, id: idMap.get(b.id)! }));
    }

    for (const edgeKey of ["startBinding", "endBinding"] as const) {
      const binding = copy[edgeKey] as { elementId?: string } | null | undefined;
      if (binding && typeof binding.elementId === "string") {
        if (idMap.has(binding.elementId)) {
          copy[edgeKey] = { ...binding, elementId: idMap.get(binding.elementId)! };
        } else {
          copy[edgeKey] = null;
        }
      }
    }

    if (Array.isArray(copy.groupIds)) {
      copy.groupIds = (copy.groupIds as string[]).map((g) => groupMap.get(g) ?? g);
    } else {
      copy.groupIds = [];
    }

    // Keep frame if template itself did not provide one; skip overwriting existing frame children if wrapped.
    if (wrapInFrame && copy.type !== "frame") {
      copy.frameId = frameId;
    }

    return copy;
  });

  if (!wrapInFrame) return cloned;

  const hasFrame = cloned.some((el) => el.type === "frame");
  if (hasFrame) return cloned;

  const frameEl: TemplateElement = {
    id: frameId,
    type: "frame",
    x: bounds.minX + dx - pad,
    y: bounds.minY + dy - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
    angle: 0,
    strokeColor: "#8c9684",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: BASE_SEED(),
    version: 1,
    versionNonce: BASE_VERSION_NONCE(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    name: template.name,
  };

  return [...cloned, frameEl];
}

export function encodeTemplatePayload(template: Omit<BoardTemplate, "source">): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(template));
}

export function decodeTemplatePayload(bytes: Uint8Array, slug: string): BoardTemplate | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<BoardTemplate>;
    if (!Array.isArray(parsed.elements)) return null;
    return {
      id: typeof parsed.id === "string" ? parsed.id : `repo-${slug}`,
      slug,
      name: typeof parsed.name === "string" ? parsed.name : slug,
      category: typeof parsed.category === "string" ? parsed.category : "Repo templates",
      description: typeof parsed.description === "string" ? parsed.description : "Saved board template",
      source: "repo",
      elements: parsed.elements,
    };
  } catch {
    return null;
  }
}

export type RepoTemplateConfig = {
  token: string | (() => Promise<string>);
  owner: string;
  repo: string;
  branch: string;
  passphrase: string;
  apiBase?: string;
};

export async function saveRepoTemplate(
  cfg: RepoTemplateConfig,
  input: { name: string; description?: string; elements: readonly TemplateElement[] },
): Promise<BoardTemplate> {
  const slug = slugifyTemplateName(input.name);
  const normalized = normalizeSelectionForTemplate(input.elements);
  const template: BoardTemplate = {
    id: `repo-${slug}`,
    slug,
    name: input.name.trim() || slug,
    category: "This repo",
    description: input.description?.trim() || `${normalized.length} elements`,
    source: "repo",
    elements: normalized,
  };
  const adapter = new GitHubAdapter({
    token: cfg.token,
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: `templates/${slug}.json`,
    apiBase: cfg.apiBase,
  });
  const store = new EncryptedStore(adapter, cfg.passphrase);
  await store.open().catch(() => null); // grab latest sha if overwriting existing template
  await store.save(encodeTemplatePayload(template));
  return template;
}

export async function listRepoTemplates(cfg: RepoTemplateConfig): Promise<BoardTemplate[]> {
  const rootAdapter = new GitHubAdapter({
    token: cfg.token,
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: "",
    apiBase: cfg.apiBase,
  });
  const entries = await rootAdapter.listDir("templates");
  const jsonEntries = entries.filter((e) => e.name.endsWith(".json"));
  const out: BoardTemplate[] = [];
  for (const entry of jsonEntries) {
    const slug = entry.name.replace(/\.json$/i, "");
    const itemAdapter = new GitHubAdapter({
      token: cfg.token,
      owner: cfg.owner,
      repo: cfg.repo,
      branch: cfg.branch,
      path: `templates/${entry.name}`,
      apiBase: cfg.apiBase,
    });
    const store = new EncryptedStore(itemAdapter, cfg.passphrase);
    try {
      const plain = await store.open();
      if (!plain) continue;
      const tpl = decodeTemplatePayload(plain, slug);
      if (tpl) out.push(tpl);
    } catch {
      // Encrypted with another board's passphrase — skip silently
    }
  }
  return out;
}

/** Seeds an empty Y.Doc with a template (used when creating a new board from a template). */
export function seedDocFromTemplate(doc: Y.Doc, template: BoardTemplate): void {
  const elements = instantiateTemplate(template, { centerX: 0, centerY: 0, wrapInFrame: true });
  const map = doc.getMap<Record<string, unknown>>("elements");
  const order = doc.getArray<string>("order");
  doc.transact(() => {
    for (const el of elements) {
      const id = String(el.id);
      map.set(id, el);
      order.push([id]);
    }
  }, "local");
}
