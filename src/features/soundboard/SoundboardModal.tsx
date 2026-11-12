import { useState, useEffect, useCallback } from "react";
import type { SoundboardClip } from "./types";
import { AudioClipper } from "./AudioClipper";
import { playSoundboardClip } from "./store";
import { soundEngine } from "../../audio/soundEngine";
import "./soundboard.css";

type Props = {
  clips: SoundboardClip[];
  currentUserName: string;
  onClose: () => void;
  onAddClip: (clip: Omit<SoundboardClip, "id" | "createdAt">) => void;
  onUpdateClip: (id: string, updates: Partial<SoundboardClip>) => void;
  onDeleteClip: (id: string) => void;
  onTriggerClip: (clip: SoundboardClip) => void;
};

export function SoundboardModal({
  clips,
  currentUserName: _currentUserName,
  onClose,
  onAddClip,
  onUpdateClip,
  onDeleteClip,
  onTriggerClip,
}: Props) {
  const [showClipper, setShowClipper] = useState(false);
  const [editingClip, setEditingClip] = useState<SoundboardClip | null>(null);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem("caulk.soundboard_volume.v1");
    return saved !== null ? Number(saved) : 0.85;
  });
  const [broadcast, setBroadcast] = useState<boolean>(true);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try {
      localStorage.setItem("caulk.soundboard_volume.v1", String(newVol));
    } catch {}
  };

  // Play clip
  const handlePlayClip = useCallback(
    (clip: SoundboardClip) => {
      setActiveClipId(clip.id);
      setTimeout(() => setActiveClipId(null), 300);

      // Play local audio
      void playSoundboardClip(clip, volume);

      // Broadcast to other whiteboard collaborators
      if (broadcast) {
        onTriggerClip(clip);
      }
    },
    [volume, broadcast, onTriggerClip],
  );

  // Keyboard shortcut listener for hotkeys 1-9
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (e.key >= "1" && e.key <= "9") {
        const matching = clips.find((c) => c.hotkey === e.key);
        if (matching) {
          e.preventDefault();
          handlePlayClip(matching);
        }
      } else if (e.key === "Escape") {
        if (showClipper) {
          setShowClipper(false);
          setEditingClip(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clips, handlePlayClip, showClipper, onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="window-frame modal-window soundboard-window"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Soundboard"
      >
        {/* Authentic VGUI Titlebar */}
        <div className="window-titlebar">
          <div className="window-title">
            <span className="window-lambda">λ</span>
            <span>Caulk Soundboard</span>
            <span className="task-count-pill" style={{ marginLeft: 6 }}>
              {clips.length} {clips.length === 1 ? "Sound" : "Sounds"}
            </span>
          </div>
          <div className="window-controls">
            <button
              type="button"
              className="window-btn close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Soundboard Body */}
        <div className="soundboard-body">
          {/* Top Control Bar */}
          <div className="soundboard-toolbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Volume Slider */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }} title="Volume">
                  {volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  style={{ width: 80, accentColor: "var(--vgui-accent)" }}
                  title={`Volume: ${Math.round(volume * 100)}%`}
                />
                <span style={{ fontSize: 11, color: "var(--vgui-muted)", width: 28, textAlign: "right" }}>
                  {Math.round(volume * 100)}%
                </span>
              </div>

              {/* Broadcast Toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  userSelect: "none",
                }}
                title="When enabled, triggering a sound plays it for everyone connected to this board!"
              >
                <input
                  type="checkbox"
                  checked={broadcast}
                  onChange={(e) => setBroadcast(e.target.checked)}
                />
                <span style={{ color: broadcast ? "var(--vgui-accent)" : "var(--vgui-muted)" }}>
                  📡 Broadcast to Board
                </span>
              </label>
            </div>

            {/* Add Sound Button */}
            <button
              type="button"
              className={`btn ${showClipper ? "ghost" : "primary"}`}
              style={{ fontSize: 11, padding: "3px 10px" }}
              onClick={() => {
                setShowClipper(!showClipper);
                setEditingClip(null);
                soundEngine.play("click");
              }}
            >
              {showClipper ? "✕ Cancel Clipper" : "✂️ + Add Custom Sound"}
            </button>
          </div>

          {/* Audio Clipper Panel (Collapsible) */}
          {showClipper && (
            <AudioClipper
              initialClip={editingClip || undefined}
              onSave={(newClip) => {
                if (editingClip) {
                  onUpdateClip(editingClip.id, newClip);
                } else {
                  onAddClip(newClip);
                }
                setShowClipper(false);
                setEditingClip(null);
                soundEngine.play("create");
              }}
              onCancel={() => {
                setShowClipper(false);
                setEditingClip(null);
              }}
            />
          )}

          {/* Sound Buttons Grid */}
          <div className="soundboard-grid">
            {clips.map((clip) => {
              const isActive = activeClipId === clip.id;
              const buttonColor = clip.color || "var(--vgui-base, #1b2219)";

              return (
                <div
                  key={clip.id}
                  className={`soundboard-card ${isActive ? "active-bounce" : ""}`}
                  style={{
                    "--clip-accent": buttonColor,
                  } as React.CSSProperties}
                  onClick={() => handlePlayClip(clip)}
                  title={`Play "${clip.name}" (${clip.duration.toFixed(1)}s)`}
                >
                  <div className="soundboard-card-icon">{clip.icon || "📢"}</div>
                  <div className="soundboard-card-info">
                    <div className="soundboard-card-name">{clip.name}</div>
                    <div className="soundboard-card-meta">
                      <span className="soundboard-card-duration">
                        {clip.duration ? `${clip.duration.toFixed(1)}s` : "0.5s"}
                      </span>
                      {clip.hotkey && (
                        <span className="soundboard-hotkey-badge">[{clip.hotkey}]</span>
                      )}
                    </div>
                  </div>

                  {/* Edit/Delete Actions */}
                  {!clip.isPreset && (
                    <div
                      className="soundboard-card-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="soundboard-mini-btn"
                        title="Edit / Trim Sound"
                        onClick={() => {
                          setEditingClip(clip);
                          setShowClipper(true);
                          soundEngine.play("click");
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="soundboard-mini-btn danger"
                        title="Delete Sound"
                        onClick={() => {
                          onDeleteClip(clip.id);
                          soundEngine.play("delete");
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hotkey Tip Footer */}
          <div className="soundboard-footer">
            <span>💡 Tip: Press number keys <b>[1]</b>–<b>[9]</b> on your keyboard to instantly play sounds!</span>
            {broadcast && (
              <span style={{ color: "var(--ok, #48bb78)" }}>
                🟢 Board broadcast active: all peers hear soundboard triggers live.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
