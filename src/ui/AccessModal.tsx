import { useState } from "react";

type ChallengeProps = {
  mode: "challenge";
  currentName: string;
  allowedNicknames: string[];
  hasRequested?: boolean;
  onRequestAccess: (name: string) => void;
  onClaimNickname: (newName: string) => void;
  onExit: () => void;
};

type ManageProps = {
  mode: "manage";
  currentName: string;
  allowedNicknames: string[];
  accessRequests: Array<{ name: string; at: number }>;
  onSaveAllowed: (list: string[]) => void;
  onApproveRequest: (name: string) => void;
  onDenyRequest: (name: string) => void;
  onClose: () => void;
};

type Props = ChallengeProps | ManageProps;

export function AccessModal(props: Props) {
  const [typedName, setTypedName] = useState("");
  const [newNick, setNewNick] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (props.mode === "challenge") {
    const handleClaim = (e: React.FormEvent) => {
      e.preventDefault();
      const target = typedName.trim();
      if (!target) {
        setError("Please enter a nickname.");
        return;
      }
      const isAllowed = props.allowedNicknames.some(
        (n) => n.trim().toLowerCase() === target.toLowerCase(),
      );
      if (!isAllowed) {
        setError(
          `'${target}' is not in the allowed list. Choose an allowed nickname or click 'Request Access'.`,
        );
        return;
      }
      props.onClaimNickname(target);
    };

    return (
      <div className="modal-backdrop">
        <div className="window-frame modal-window">
          <div className="window-titlebar">
            <div className="window-title">
              <span className="window-lambda">λ</span>
              <span>Access Control - Identification Required</span>
            </div>
          </div>
          <div className="card modal-body">
            <div className="card-head">
              <h1 style={{ color: "#E2B038" }}>Restricted Board</h1>
              <p>
                This board requires an authorized nickname to edit and record history.
                Your current name (<code>{props.currentName}</code>) is not on the whitelist.
              </p>
            </div>

            {props.hasRequested ? (
              <div className="note warn" style={{ padding: "10px 12px", lineHeight: 1.5 }}>
                <strong>🔔 Access Request Sent</strong>
                <p style={{ margin: "4px 0 0" }}>
                  Waiting for an authorized board member to approve <code>{props.currentName}</code>.
                  Once approved, your screen will unlock automatically!
                </p>
              </div>
            ) : (
              <div
                style={{
                  background: "var(--vgui-base)",
                  border: "1px solid var(--vgui-dark)",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
                    Ask a board member for access
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    Send an instant notification to connected peers.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => props.onRequestAccess(props.currentName)}
                  style={{ background: "var(--vgui-selected-bg)", color: "#FFFFFF" }}
                >
                  🔔 Request Access
                </button>
              </div>
            )}

            <form onSubmit={handleClaim} className="field" style={{ marginTop: 12 }}>
              <span>Enter authorized nickname:</span>
              <input
                value={typedName}
                onChange={(e) => {
                  setTypedName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. gordon_freeman"
              />
              {error && <p className="note error">{error}</p>}

              <div className="actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={props.onExit}>
                  Exit to Setup
                </button>
                <button type="submit" className="btn primary" disabled={!typedName.trim()}>
                  Unlock with Nickname
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // mode === "manage"
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const candidate = newNick.trim();
    if (!candidate) return;
    if (props.allowedNicknames.some((n) => n.toLowerCase() === candidate.toLowerCase())) {
      setError(`'${candidate}' is already in the list.`);
      return;
    }
    setError(null);
    props.onSaveAllowed([...props.allowedNicknames, candidate]);
    setNewNick("");
  };

  const handleRemove = (nickToRemove: string) => {
    props.onSaveAllowed(props.allowedNicknames.filter((n) => n !== nickToRemove));
  };

  const handleClear = () => {
    if (window.confirm("Clear whitelist? Anyone with the passphrase will be able to join and edit.")) {
      props.onSaveAllowed([]);
    }
  };

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="window-frame modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Board Access & Nickname Whitelist</span>
          </div>
          <div className="window-controls">
            <button
              type="button"
              className="window-btn close"
              onClick={props.onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="card modal-body">
          <div className="card-head">
            <h1>Board Access Control</h1>
            <p>
              When active, only peers with these nicknames can edit the board and record history.
              New users can request access live while you are connected.
            </p>
          </div>

          {props.accessRequests.length > 0 && (
            <div
              className="field"
              style={{
                background: "var(--vgui-base)",
                border: "1px solid var(--vgui-accent)",
                padding: "8px 10px",
              }}
            >
              <span style={{ color: "var(--vgui-accent)" }}>
                🔔 Pending Access Requests ({props.accessRequests.length})
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {props.accessRequests.map((req) => (
                  <div
                    key={req.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "4px 8px",
                      background: "var(--vgui-bg)",
                      border: "1px solid var(--vgui-border)",
                    }}
                  >
                    <div>
                      <strong>{req.name}</strong>
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        (requested just now)
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn primary"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        onClick={() => props.onApproveRequest(req.name)}
                      >
                        ✓ Approve
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        onClick={() => props.onDenyRequest(req.name)}
                      >
                        ✕ Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <span>
              Status:{" "}
              {props.allowedNicknames.length === 0 ? (
                <span className="note ok" style={{ display: "inline-block", padding: "2px 6px" }}>
                  Open (Anyone with passphrase can join)
                </span>
              ) : (
                <span className="note warn" style={{ display: "inline-block", padding: "2px 6px" }}>
                  Whitelist Active ({props.allowedNicknames.length} allowed)
                </span>
              )}
            </span>
          </div>

          <form onSubmit={handleAdd} className="row" style={{ alignItems: "flex-end", marginTop: 4 }}>
            <label className="field grow">
              <span>Add Nickname</span>
              <input
                value={newNick}
                onChange={(e) => {
                  setNewNick(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. alyx_vance"
              />
            </label>
            <button type="submit" className="btn primary" disabled={!newNick.trim()}>
              + Add
            </button>
          </form>
          {error && <p className="note error">{error}</p>}

          <div className="field" style={{ marginTop: 8 }}>
            <span>Current Whitelist ({props.allowedNicknames.length})</span>
            {props.allowedNicknames.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                No restrictions. Anyone with the repo token and passphrase can edit.
              </p>
            ) : (
              <div className="nick-list">
                {props.allowedNicknames.map((nick) => {
                  const isMe = nick.toLowerCase() === props.currentName.toLowerCase();
                  return (
                    <div key={nick} className="nick-row">
                      <span className="nick-name">
                        <strong>{nick}</strong>
                        {isMe && <span className="nick-badge">You</span>}
                      </span>
                      <button
                        type="button"
                        className="window-btn close"
                        onClick={() => handleRemove(nick)}
                        title={`Remove ${nick}`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="actions" style={{ justifyContent: "space-between", marginTop: 14 }}>
            {props.allowedNicknames.length > 0 ? (
              <button type="button" className="btn ghost" onClick={handleClear}>
                Clear All (Allow Anyone)
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn primary" onClick={props.onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
