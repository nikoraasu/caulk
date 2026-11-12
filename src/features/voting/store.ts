/**
 * Yjs-backed emoji reactions and dot-voting sessions on board elements.
 *
 * Layout inside Y.Doc:
 *   elementReactions: Y.Map<number>
 *     key = `${elementId}\x1f${emoji}\x1f${author}` -> timestamp (atomic toggle, no conflicts)
 *   votingSession: Y.Map<unknown>
 *     flat fields: id, status ("active"|"ended"), votesPerPerson, anonymous, frameId, startedAt, endsAt, endedAt, startedBy, timerLinked
 *   votingBallots: Y.Map<number>
 *     key = `${sessionId}\x1f${author}\x1f${elementId}` -> integer count (>= 1)
 */

import * as Y from "yjs";

const ORIGIN_LOCAL = "local";
const REACTIONS_KEY = "elementReactions";
const SESSION_KEY = "votingSession";
const BALLOTS_KEY = "votingBallots";
const SEP = "\x1f";

export const ELEMENT_REACTION_EMOJIS = ["👍", "❤️", "🎉", "🔥", "👀"] as const;

export type ElementReactionBucket = {
  emoji: string;
  authors: string[];
  count: number;
};

export type VotingSession = {
  id: string;
  status: "active" | "ended";
  votesPerPerson: number;
  anonymous: boolean;
  frameId: string | null;
  startedAt: number;
  endsAt: number | null;
  endedAt: number | null;
  startedBy: string;
  timerLinked: boolean;
};

export type VoteBallotEntry = {
  sessionId: string;
  author: string;
  elementId: string;
  count: number;
};

export type VotingSnapshot = {
  session: VotingSession | null;
  ballots: VoteBallotEntry[];
};

export type ElementLike = {
  id: string;
  type: string;
  isDeleted?: boolean;
  frameId?: string | null;
  text?: string;
  name?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  boundElements?: ReadonlyArray<{ id: string; type: string }> | null;
};

export type VotingResultRow = {
  elementId: string;
  label: string;
  totalVotes: number;
  voters: Array<{ author: string; count: number }>;
};

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────────────────── Emoji Reactions ─────────────────────

function reactionsMap(doc: Y.Doc): Y.Map<number> {
  return doc.getMap<number>(REACTIONS_KEY);
}

export function toggleElementReaction(
  doc: Y.Doc,
  elementId: string,
  emoji: string,
  author: string,
): void {
  if (!elementId || !emoji || !author) return;
  const map = reactionsMap(doc);
  const key = `${elementId}${SEP}${emoji}${SEP}${author}`;
  doc.transact(() => {
    if (map.has(key)) {
      map.delete(key);
    } else {
      map.set(key, Date.now());
    }
  }, ORIGIN_LOCAL);
}

export function getElementReactions(doc: Y.Doc): Map<string, ElementReactionBucket[]> {
  const map = reactionsMap(doc);
  const byElement = new Map<string, Map<string, string[]>>();

  map.forEach((_val, rawKey) => {
    const parts = rawKey.split(SEP);
    if (parts.length < 3) return;
    const [elementId, emoji, ...rest] = parts;
    const author = rest.join(SEP);
    if (!elementId || !emoji || !author) return;
    let emojiMap = byElement.get(elementId);
    if (!emojiMap) {
      emojiMap = new Map();
      byElement.set(elementId, emojiMap);
    }
    const list = emojiMap.get(emoji) ?? [];
    if (!list.includes(author)) list.push(author);
    emojiMap.set(emoji, list);
  });

  const order = new Map<string, number>(ELEMENT_REACTION_EMOJIS.map((e, i) => [e, i]));
  const result = new Map<string, ElementReactionBucket[]>();
  for (const [elementId, emojiMap] of byElement.entries()) {
    const buckets: ElementReactionBucket[] = [];
    for (const [emoji, authors] of emojiMap.entries()) {
      authors.sort();
      buckets.push({ emoji, authors, count: authors.length });
    }
    buckets.sort((a, b) => {
      const oa = order.get(a.emoji) ?? 99;
      const ob = order.get(b.emoji) ?? 99;
      if (oa !== ob) return oa - ob;
      return a.emoji.localeCompare(b.emoji);
    });
    result.set(elementId, buckets);
  }
  return result;
}

export function observeElementReactions(
  doc: Y.Doc,
  cb: (reactions: Map<string, ElementReactionBucket[]>) => void,
): () => void {
  const map = reactionsMap(doc);
  const handler = () => cb(getElementReactions(doc));
  map.observe(handler);
  cb(getElementReactions(doc));
  return () => {
    map.unobserve(handler);
  };
}

// ───────────────────── Dot Voting ─────────────────────

function sessionMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(SESSION_KEY);
}

function ballotsMap(doc: Y.Doc): Y.Map<number> {
  return doc.getMap<number>(BALLOTS_KEY);
}

export function readVotingSession(doc: Y.Doc): VotingSession | null {
  const m = sessionMap(doc);
  const id = m.get("id");
  const status = m.get("status");
  if (typeof id !== "string" || (status !== "active" && status !== "ended")) {
    return null;
  }
  return {
    id,
    status,
    votesPerPerson: Number(m.get("votesPerPerson")) || 3,
    anonymous: Boolean(m.get("anonymous")),
    frameId: typeof m.get("frameId") === "string" ? (m.get("frameId") as string) : null,
    startedAt: Number(m.get("startedAt")) || 0,
    endsAt: typeof m.get("endsAt") === "number" ? (m.get("endsAt") as number) : null,
    endedAt: typeof m.get("endedAt") === "number" ? (m.get("endedAt") as number) : null,
    startedBy: typeof m.get("startedBy") === "string" ? (m.get("startedBy") as string) : "unknown",
    timerLinked: Boolean(m.get("timerLinked")),
  };
}

export function getVotingSnapshot(doc: Y.Doc): VotingSnapshot {
  const session = readVotingSession(doc);
  const ballots: VoteBallotEntry[] = [];
  if (session) {
    const bm = ballotsMap(doc);
    bm.forEach((rawCount, rawKey) => {
      const count = typeof rawCount === "number" ? Math.floor(rawCount) : 0;
      if (count <= 0) return;
      const parts = rawKey.split(SEP);
      if (parts.length < 3) return;
      const [sessionId, author, ...rest] = parts;
      const elementId = rest.join(SEP);
      if (sessionId !== session.id || !author || !elementId) return;
      ballots.push({ sessionId, author, elementId, count });
    });
  }
  return { session, ballots };
}

export function observeVoting(doc: Y.Doc, cb: (snapshot: VotingSnapshot) => void): () => void {
  const sm = sessionMap(doc);
  const bm = ballotsMap(doc);
  const handler = () => cb(getVotingSnapshot(doc));
  sm.observe(handler);
  bm.observe(handler);
  cb(getVotingSnapshot(doc));
  return () => {
    sm.unobserve(handler);
    bm.unobserve(handler);
  };
}

export function startVotingSession(
  doc: Y.Doc,
  opts: {
    id?: string;
    votesPerPerson: number;
    anonymous: boolean;
    frameId?: string | null;
    durationSeconds?: number | null;
    startedBy: string;
    timerLinked?: boolean;
    now?: number;
  },
): string {
  const id = opts.id ?? makeId("vote");
  const now = opts.now ?? Date.now();
  const votesPerPerson = Math.max(1, Math.min(20, Math.round(opts.votesPerPerson || 3)));
  const endsAt =
    opts.durationSeconds && opts.durationSeconds > 0
      ? now + Math.round(opts.durationSeconds * 1000)
      : null;

  doc.transact(() => {
    const sm = sessionMap(doc);
    sm.set("id", id);
    sm.set("status", "active");
    sm.set("votesPerPerson", votesPerPerson);
    sm.set("anonymous", Boolean(opts.anonymous));
    sm.set("frameId", opts.frameId ?? null);
    sm.set("startedAt", now);
    sm.set("endsAt", endsAt);
    sm.set("endedAt", null);
    sm.set("startedBy", opts.startedBy);
    sm.set("timerLinked", Boolean(opts.timerLinked));
  }, ORIGIN_LOCAL);

  return id;
}

export function endVotingSession(doc: Y.Doc, at = Date.now()): void {
  const sm = sessionMap(doc);
  if (sm.get("status") !== "active") return;
  doc.transact(() => {
    sm.set("status", "ended");
    sm.set("endedAt", at);
  }, ORIGIN_LOCAL);
}

export function clearVotingSession(doc: Y.Doc): void {
  const sm = sessionMap(doc);
  const bm = ballotsMap(doc);
  const id = sm.get("id");
  doc.transact(() => {
    sm.clear();
    if (typeof id === "string") {
      const prefix = `${id}${SEP}`;
      for (const k of Array.from(bm.keys())) {
        if (k.startsWith(prefix)) bm.delete(k);
      }
    }
  }, ORIGIN_LOCAL);
}

export function getVotesUsedByAuthor(doc: Y.Doc, sessionId: string, author: string): number {
  const bm = ballotsMap(doc);
  const prefix = `${sessionId}${SEP}${author}${SEP}`;
  let sum = 0;
  bm.forEach((rawCount, k) => {
    if (k.startsWith(prefix) && typeof rawCount === "number" && rawCount > 0) {
      sum += Math.floor(rawCount);
    }
  });
  return sum;
}

export function castVote(
  doc: Y.Doc,
  elementId: string,
  author: string,
): boolean {
  const session = readVotingSession(doc);
  if (!session || session.status !== "active" || !elementId || !author) return false;
  const used = getVotesUsedByAuthor(doc, session.id, author);
  if (used >= session.votesPerPerson) return false;

  const bm = ballotsMap(doc);
  const key = `${session.id}${SEP}${author}${SEP}${elementId}`;
  doc.transact(() => {
    const prev = bm.get(key);
    const next = (typeof prev === "number" && prev > 0 ? Math.floor(prev) : 0) + 1;
    bm.set(key, next);
  }, ORIGIN_LOCAL);
  return true;
}

export function retractVote(
  doc: Y.Doc,
  elementId: string,
  author: string,
): boolean {
  const session = readVotingSession(doc);
  if (!session || session.status !== "active" || !elementId || !author) return false;
  const bm = ballotsMap(doc);
  const key = `${session.id}${SEP}${author}${SEP}${elementId}`;
  const prev = bm.get(key);
  if (typeof prev !== "number" || prev <= 0) return false;
  doc.transact(() => {
    const next = Math.floor(prev) - 1;
    if (next <= 0) bm.delete(key);
    else bm.set(key, next);
  }, ORIGIN_LOCAL);
  return true;
}

/** Extracts human-readable text label for a sticky/shape (including bound text element). */
export function describeElement(el: ElementLike, allElements: ReadonlyArray<ElementLike>): string {
  if (el.type === "frame" && el.name) return `Frame: ${el.name}`;
  if (typeof el.text === "string" && el.text.trim()) {
    return singleLinePreview(el.text);
  }
  if (el.boundElements) {
    const textRef = el.boundElements.find((b) => b.type === "text");
    if (textRef) {
      const bound = allElements.find((other) => other.id === textRef.id && !other.isDeleted);
      if (bound && typeof bound.text === "string" && bound.text.trim()) {
        return singleLinePreview(bound.text);
      }
    }
  }
  return `${el.type.charAt(0).toUpperCase()}${el.type.slice(1)} (${el.id.slice(0, 6)})`;
}

function singleLinePreview(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 64 ? `${clean.slice(0, 63)}…` : clean;
}

export function summarizeVotingResults(
  snapshot: VotingSnapshot,
  elements: ReadonlyArray<ElementLike>,
): VotingResultRow[] {
  const { session, ballots } = snapshot;
  if (!session) return [];

  const byElement = new Map<string, { total: number; voters: Map<string, number> }>();
  for (const b of ballots) {
    let entry = byElement.get(b.elementId);
    if (!entry) {
      entry = { total: 0, voters: new Map() };
      byElement.set(b.elementId, entry);
    }
    entry.total += b.count;
    entry.voters.set(b.author, (entry.voters.get(b.author) ?? 0) + b.count);
  }

  const rows: VotingResultRow[] = [];
  for (const [elementId, entry] of byElement.entries()) {
    const el = elements.find((item) => item.id === elementId);
    const label = el && !el.isDeleted ? describeElement(el, elements) : `(removed item ${elementId.slice(0, 6)})`;
    const voters = session.anonymous
      ? []
      : Array.from(entry.voters.entries())
          .map(([author, count]) => ({ author, count }))
          .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
    rows.push({
      elementId,
      label,
      totalVotes: entry.total,
      voters,
    });
  }

  rows.sort((a, b) => b.totalVotes - a.totalVotes || a.label.localeCompare(b.label));
  return rows;
}

export function formatVotingResultsMarkdown(
  rows: VotingResultRow[],
  session: VotingSession | null,
): string {
  if (!session) return "";
  const lines: string[] = [
    `# Voting Results`,
    `- Started by: ${session.startedBy}`,
    `- Votes per person: ${session.votesPerPerson}`,
    `- Mode: ${session.anonymous ? "Anonymous" : "Open"}`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("_No votes were cast._");
    return lines.join("\n");
  }
  rows.forEach((row, idx) => {
    const rank = idx + 1;
    const medal = rank === 1 ? "🏆 " : rank === 2 ? "🥈 " : rank === 3 ? "🥉 " : "";
    const voterNote =
      !session.anonymous && row.voters.length > 0
        ? ` (${row.voters.map((v) => `${v.author} ×${v.count}`).join(", ")})`
        : "";
    lines.push(`${rank}. ${medal}**${row.label}** — **${row.totalVotes}** vote${row.totalVotes === 1 ? "" : "s"}${voterNote}`);
  });
  return lines.join("\n");
}
