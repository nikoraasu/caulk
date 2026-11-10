import type { Digest } from "../crdt/scene";

export function DigestBanner({ digest, onDismiss }: { digest: Digest; onDismiss: () => void }) {
  const parts: string[] = [];
  if (digest.added) parts.push(`${digest.added} added`);
  if (digest.changed) parts.push(`${digest.changed} edited`);
  if (digest.removed) parts.push(`${digest.removed} removed`);

  const authors = digest.authors
    .slice(0, 3)
    .map((a) => `${a.name} (${a.count})`)
    .join(", ");

  return (
    <div className="digest">
      <span className="digest-dot" />
      <div className="digest-text">
        <strong>{parts.join(" · ")}</strong> since you were last here
        {authors && <span className="muted"> — {authors}</span>}
      </div>
      <button className="btn ghost" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
