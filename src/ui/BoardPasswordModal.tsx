import { useState } from "react";
import { WrongPassphraseError } from "../crypto/envelope";

const MIN_PASSWORD_LENGTH = 4;

type UnlockProps = {
  onUnlock: (pass: string, remember: boolean) => Promise<void>;
  /** When given, shows a "Back to boards" link. */
  onBack?: () => void;
};

/** Shown instead of the board while our passphrase can't decrypt it. Not dismissable. */
export function UnlockBoardModal({ onUnlock, onBack }: UnlockProps) {
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setError(null);
    try {
      // On success onUnlock reloads the page, so busy stays set.
      await onUnlock(pass, remember);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof WrongPassphraseError
          ? "Wrong password."
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  return (
    <div className="modal-backdrop board-cover">
      <div className="window-frame modal-window">
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Board Locked</span>
          </div>
        </div>
        <div className="card modal-body">
          <div className="card-head">
            <h1>This board has a password</h1>
            <p>
              Enter the board password to open it. Until then, nothing on this board can be edited or saved
              from this device.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="field" style={{ marginTop: 4 }}>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={pass}
              disabled={busy}
              onChange={(e) => {
                setPass(e.target.value);
                setError(null);
              }}
            />
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={remember}
                disabled={busy}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember on this device</span>
            </label>
            {error && <p className="note error">{error}</p>}

            <div className="actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
              {onBack ? (
                <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
                  Back to boards
                </button>
              ) : (
                <span />
              )}
              <button type="submit" className="btn primary" disabled={!pass || busy}>
                {busy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

type ChangeProps = {
  hasPassword: boolean;
  /** newPass null removes the password. */
  onSubmit: (newPass: string | null, remember: boolean) => Promise<void>;
  onClose: () => void;
  /** Progress text shown while onSubmit runs. */
  progress?: string;
};

/** Sets, changes or removes the board password. Re-encrypts the whole board. */
export function ChangePasswordModal({ hasPassword, onSubmit, onClose, progress }: ChangeProps) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (newPass: string | null, rememberPass: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(newPass, rememberPass);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pass.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (pass !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    void run(pass, remember);
  };

  const close = busy ? undefined : onClose;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="window-frame modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Board Password</span>
          </div>
          <div className="window-controls">
            <button
              type="button"
              className="window-btn close"
              onClick={close}
              disabled={busy}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="card modal-body">
          <div className="card-head">
            <h1>{hasPassword ? "Change board password" : "Set board password"}</h1>
            <p>
              Re-encrypts this board, its images and its history in one commit. Everyone will need the new
              password. People with write access to the repo can still delete the file, but can't read it.
            </p>
          </div>

          <form onSubmit={handleSave} className="field" style={{ marginTop: 4 }}>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pass}
                disabled={busy}
                onChange={(e) => {
                  setPass(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className="field" style={{ marginTop: 8 }}>
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                disabled={busy}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={remember}
                disabled={busy}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember on this device</span>
            </label>
            {progress && busy && <p className="muted small" style={{ margin: "8px 0 0" }}>{progress}</p>}
            {error && <p className="note error">{error}</p>}

            <div className="actions" style={{ marginTop: 14, justifyContent: "space-between" }}>
              {hasPassword ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void run(null, false)}
                >
                  Remove password
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={busy || !pass || !confirm}>
                  {busy ? "Working…" : hasPassword ? "Change password" : "Set password"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
