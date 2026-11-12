/**
 * Yjs-backed comment threads anchored to canvas points or Excalidraw elements.
 *
 * Layout inside Y.Doc:
 *   comments: Y.Map<threadId, Y.Map>
 *     - id: string
 *     - elementId: string | null
 *     - x, y: number (scene coordinates or last-known anchor)
 *     - offsetX, offsetY: number | null (relative to element.x / element.y when attached)
 *     - resolved: boolean
 *     - createdAt: number
 *     - author: string
 *     - messages: Y.Array<CommentMessage> (concurrent replies merge automatically)
 */

import * as Y from "yjs";

const ORIGIN_LOCAL = "local";
const COMMENTS_KEY = "comments";

export const COMMENT_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀"] as const;

export type CommentMessage = {
  id: string;
  author: string;
  text: string;
  at: number;
  reactions: Record<string, string[]>;
};

export type CommentThread = {
  id: string;
  elementId: string | null;
  x: number;
  y: number;
  offsetX: number | null;
  offsetY: number | null;
  resolved: boolean;
  createdAt: number;
  author: string;
  messages: CommentMessage[];
};

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeReactions(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [emoji, list] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(list)) {
      const names = list.filter((x): x is string => typeof x === "string" && x.length > 0);
      if (names.length > 0) out[emoji] = [...new Set(names)];
    }
  }
  return out;
}

function normalizeMessage(raw: unknown): CommentMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.text !== "string") return null;
  return {
    id: r.id,
    author: typeof r.author === "string" && r.author ? r.author : "Anonymous",
    text: r.text,
    at: typeof r.at === "number" ? r.at : 0,
    reactions: normalizeReactions(r.reactions),
  };
}

function readThreadMap(raw: unknown): CommentThread | null {
  if (!(raw instanceof Y.Map)) return null;
  const id = raw.get("id");
  const x = raw.get("x");
  const y = raw.get("y");
  if (typeof id !== "string" || typeof x !== "number" || typeof y !== "number") return null;

  const elementId = raw.get("elementId");
  const offsetX = raw.get("offsetX");
  const offsetY = raw.get("offsetY");
  const messagesVal = raw.get("messages");
  const messages: CommentMessage[] = [];
  if (messagesVal instanceof Y.Array) {
    for (const item of messagesVal.toArray()) {
      const msg = normalizeMessage(item);
      if (msg) messages.push(msg);
    }
  }

  return {
    id,
    elementId: typeof elementId === "string" && elementId ? elementId : null,
    x,
    y,
    offsetX: typeof offsetX === "number" ? offsetX : null,
    offsetY: typeof offsetY === "number" ? offsetY : null,
    resolved: Boolean(raw.get("resolved")),
    createdAt: typeof raw.get("createdAt") === "number" ? (raw.get("createdAt") as number) : 0,
    author: typeof raw.get("author") === "string" ? (raw.get("author") as string) : "Anonymous",
    messages,
  };
}

function commentsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(COMMENTS_KEY);
}

/** Reads and chronologically sorts every comment thread on the board. */
export function listCommentThreads(doc: Y.Doc): CommentThread[] {
  const map = commentsMap(doc);
  const threads: CommentThread[] = [];
  for (const val of map.values()) {
    const t = readThreadMap(val);
    if (t) threads.push(t);
  }
  threads.sort((a, b) => a.createdAt - b.createdAt);
  return threads;
}

/** Subscribes to any comment additions, replies, reactions, or resolutions. */
export function observeComments(doc: Y.Doc, cb: (threads: CommentThread[]) => void): () => void {
  const map = commentsMap(doc);
  const handler = () => {
    cb(listCommentThreads(doc));
  };
  map.observeDeep(handler);
  cb(listCommentThreads(doc));
  return () => {
    map.unobserveDeep(handler);
  };
}

/** Drops a new comment pin + initial message into the board doc. */
export function createCommentThread(
  doc: Y.Doc,
  input: {
    id?: string;
    elementId?: string | null;
    x: number;
    y: number;
    offsetX?: number | null;
    offsetY?: number | null;
    author: string;
    text: string;
    at?: number;
  },
): string {
  const text = input.text.trim();
  if (!text) return "";
  const id = input.id ?? makeId("cmt");
  const now = input.at ?? Date.now();
  const map = commentsMap(doc);

  doc.transact(() => {
    const thread = new Y.Map<unknown>();
    thread.set("id", id);
    thread.set("elementId", input.elementId ?? null);
    thread.set("x", input.x);
    thread.set("y", input.y);
    thread.set("offsetX", input.offsetX ?? null);
    thread.set("offsetY", input.offsetY ?? null);
    thread.set("resolved", false);
    thread.set("createdAt", now);
    thread.set("author", input.author);

    const messages = new Y.Array<CommentMessage>();
    messages.push([
      {
        id: makeId("msg"),
        author: input.author,
        text,
        at: now,
        reactions: {},
      },
    ]);
    thread.set("messages", messages);
    map.set(id, thread);
  }, ORIGIN_LOCAL);

  return id;
}

/** Appends a reply to an existing thread (merges concurrently via Y.Array). */
export function addCommentReply(
  doc: Y.Doc,
  threadId: string,
  input: { author: string; text: string; at?: number },
): string | null {
  const text = input.text.trim();
  if (!text) return null;
  const thread = commentsMap(doc).get(threadId);
  if (!(thread instanceof Y.Map)) return null;

  const msgId = makeId("msg");
  const now = input.at ?? Date.now();
  doc.transact(() => {
    let arr = thread.get("messages");
    if (!(arr instanceof Y.Array)) {
      arr = new Y.Array<CommentMessage>();
      thread.set("messages", arr);
    }
    (arr as Y.Array<CommentMessage>).push([
      {
        id: msgId,
        author: input.author,
        text,
        at: now,
        reactions: {},
      },
    ]);
  }, ORIGIN_LOCAL);

  return msgId;
}

/** Toggles an emoji reaction for `author` on a specific message in a thread. */
export function toggleCommentReaction(
  doc: Y.Doc,
  threadId: string,
  messageId: string,
  emoji: string,
  author: string,
): void {
  const thread = commentsMap(doc).get(threadId);
  if (!(thread instanceof Y.Map)) return;
  const arr = thread.get("messages");
  if (!(arr instanceof Y.Array)) return;

  doc.transact(() => {
    const items = arr.toArray();
    const idx = items.findIndex((m) => (m as CommentMessage | undefined)?.id === messageId);
    if (idx < 0) return;
    const msg = normalizeMessage(items[idx]);
    if (!msg) return;
    const current = msg.reactions[emoji] ?? [];
    const nextList = current.includes(author)
      ? current.filter((a) => a !== author)
      : [...current, author];
    const nextReactions = { ...msg.reactions };
    if (nextList.length === 0) delete nextReactions[emoji];
    else nextReactions[emoji] = nextList;

    arr.delete(idx, 1);
    arr.insert(idx, [{ ...msg, reactions: nextReactions }]);
  }, ORIGIN_LOCAL);
}

/** Deletes a message if authored by `author`; removes empty threads cleanly. */
export function deleteCommentMessage(
  doc: Y.Doc,
  threadId: string,
  messageId: string,
  author: string,
): void {
  const map = commentsMap(doc);
  const thread = map.get(threadId);
  if (!(thread instanceof Y.Map)) return;
  const arr = thread.get("messages");
  if (!(arr instanceof Y.Array)) return;

  doc.transact(() => {
    const items = arr.toArray();
    const idx = items.findIndex((m) => (m as CommentMessage | undefined)?.id === messageId);
    if (idx < 0) return;
    const msg = normalizeMessage(items[idx]);
    if (!msg || msg.author !== author) return;
    arr.delete(idx, 1);
    if (arr.length === 0) {
      map.delete(threadId);
    }
  }, ORIGIN_LOCAL);
}

/** Resolves or reopens a comment thread. */
export function setCommentResolved(doc: Y.Doc, threadId: string, resolved: boolean): void {
  const thread = commentsMap(doc).get(threadId);
  if (!(thread instanceof Y.Map)) return;
  doc.transact(() => {
    thread.set("resolved", resolved);
  }, ORIGIN_LOCAL);
}

/** Updates fallback scene coordinates (used so pins attached to deleted elements keep last pos). */
export function updateCommentAnchorPos(doc: Y.Doc, threadId: string, x: number, y: number): void {
  const thread = commentsMap(doc).get(threadId);
  if (!(thread instanceof Y.Map)) return;
  const curX = thread.get("x");
  const curY = thread.get("y");
  if (typeof curX === "number" && typeof curY === "number" && Math.abs(curX - x) < 1 && Math.abs(curY - y) < 1) {
    return;
  }
  doc.transact(() => {
    thread.set("x", x);
    thread.set("y", y);
  }, ORIGIN_LOCAL);
}

/** Extracts @mention tokens (e.g. `@alice`) in lowercase for filtering/highlighting. */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_.-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export function threadMentionsAuthor(thread: CommentThread, authorName: string): boolean {
  const target = authorName.trim().toLowerCase();
  if (!target) return false;
  return thread.messages.some((m) => extractMentions(m.text).includes(target));
}

export function isThreadUnread(
  thread: CommentThread,
  seenAt: number,
  currentAuthor: string,
): boolean {
  if (thread.resolved) return false;
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return false;
  return last.at > seenAt && last.author !== currentAuthor;
}
