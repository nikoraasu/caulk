import React, { useEffect } from "react";
import type { PeerUser } from "../sync/live";
import "./playerList.css";

type Props = {
  currentUserName: string;
  myColor: string;
  isLeader: boolean;
  peers: PeerUser[];
  followingPeerId: number | null;
  onFollowPeer: (clientId: number | null) => void;
  onJumpToPeer: (peer: PeerUser) => void;
  boardName: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  localViewport?: { scrollX: number; scrollY: number; zoom: number } | null;
};

export const PlayerListModal: React.FC<Props> = ({
  currentUserName,
  myColor,
  isLeader,
  peers,
  followingPeerId,
  onFollowPeer,
  onJumpToPeer,
  boardName,
  roomName,
  isOpen,
  onClose,
  localViewport,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalUsers = peers.length + 1;
  const localX = localViewport ? Math.round(-localViewport.scrollX) : 0;
  const localY = localViewport ? Math.round(-localViewport.scrollY) : 0;
  const localZoom = localViewport ? Math.round(localViewport.zoom * 100) : 100;

  return (
    <div className="caulk-playerlist-overlay" onClick={onClose}>
      <div className="caulk-playerlist-window" onClick={(e) => e.stopPropagation()}>
        <div className="caulk-playerlist-titlebar">
          <div className="caulk-playerlist-title">
            <span>👥</span>
            <span>SERVER ROSTER // CONNECTED AGENTS & OPERATORS</span>
          </div>
          <button
            type="button"
            className="caulk-minimap-btn"
            style={{ padding: "1px 6px" }}
            onClick={onClose}
            title="Close scoreboard"
          >
            ✕
          </button>
        </div>

        <div className="caulk-playerlist-server-meta">
          <div>
            <span>BOARD: </span>
            <span className="board-name">{boardName}</span>
            <span style={{ margin: "0 8px", opacity: 0.4 }}>|</span>
            <span style={{ fontSize: 10, color: "var(--vgui-muted, #d0d8cc)" }}>{roomName}</span>
          </div>
          <span className="peer-count">
            {totalUsers} {totalUsers === 1 ? "OPERATOR ONLINE" : "OPERATORS ONLINE"}
          </span>
        </div>

        <div className="caulk-playerlist-table-wrapper">
          <table className="caulk-playerlist-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>AVATAR</th>
                <th>OPERATOR ALIAS</th>
                <th>STATUS</th>
                <th>COORDINATES</th>
                <th>ZOOM</th>
                <th style={{ textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {/* Local User Row */}
              <tr className="caulk-playerlist-row is-self">
                <td>
                  <span
                    className="caulk-playerlist-avatar"
                    style={{ background: myColor, borderColor: "#ffffff" }}
                  >
                    {currentUserName.slice(0, 2).toUpperCase()}
                  </span>
                </td>
                <td>
                  <div className="caulk-playerlist-name">
                    <span>@{currentUserName}</span>
                    <span className="caulk-playerlist-badge-self">YOU</span>
                    {isLeader && <span className="caulk-playerlist-badge-leader">SYNC LEADER</span>}
                  </div>
                </td>
                <td>
                  <span className="caulk-playerlist-status-pill live">
                    <span style={{ color: "#55ff55" }}>●</span> ACTIVE
                  </span>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                  X:{localX} Y:{localY}
                </td>
                <td style={{ fontSize: 10 }}>{localZoom}%</td>
                <td style={{ textAlign: "right", color: "var(--vgui-muted, #d0d8cc)", fontSize: 10 }}>
                  Local View
                </td>
              </tr>

              {/* Connected Remote Peers */}
              {peers.map((peer) => {
                const peerX = peer.pointer
                  ? Math.round(peer.pointer.x)
                  : peer.viewport
                    ? Math.round(-peer.viewport.scrollX)
                    : 0;
                const peerY = peer.pointer
                  ? Math.round(peer.pointer.y)
                  : peer.viewport
                    ? Math.round(-peer.viewport.scrollY)
                    : 0;
                const peerZoom = peer.viewport ? Math.round(peer.viewport.zoom * 100) : 100;
                const isFollowing = followingPeerId === peer.clientId;

                return (
                  <tr key={peer.clientId} className="caulk-playerlist-row">
                    <td>
                      <span
                        className="caulk-playerlist-avatar"
                        style={{
                          background: peer.color.background,
                          borderColor: peer.color.stroke,
                          color: peer.color.stroke,
                        }}
                      >
                        {peer.name.slice(0, 2).toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="caulk-playerlist-name">
                        <span>@{peer.name}</span>
                        {peer.presenting && (
                          <span
                            className="caulk-playerlist-badge-leader"
                            style={{ background: "rgba(255, 184, 46, 0.2)", borderColor: "#ffb82e" }}
                          >
                            PRESENTER
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {peer.presenting ? (
                        <span className="caulk-playerlist-status-pill presenting">
                          <span>📡</span> PRESENTING
                        </span>
                      ) : peer.votingSessionId ? (
                        <span className="caulk-playerlist-status-pill live">
                          <span>🗳️</span> VOTING
                        </span>
                      ) : (
                        <span className="caulk-playerlist-status-pill live">
                          <span style={{ color: "#55ff55" }}>●</span> CONNECTED
                        </span>
                      )}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                      X:{peerX} Y:{peerY}
                    </td>
                    <td style={{ fontSize: 10 }}>{peerZoom}%</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 4 }}>
                        <button
                          type="button"
                          className="caulk-playerlist-action-btn"
                          title="Fly camera to peer location"
                          onClick={() => {
                            onJumpToPeer(peer);
                            onClose();
                          }}
                        >
                          📍 Jump
                        </button>
                        <button
                          type="button"
                          className={`caulk-playerlist-action-btn${isFollowing ? " active" : ""}`}
                          title={isFollowing ? "Stop following peer" : "Follow peer's viewport camera live"}
                          onClick={() => {
                            onFollowPeer(isFollowing ? null : peer.clientId);
                            onClose();
                          }}
                        >
                          {isFollowing ? "✓ Following" : "👁️ Follow"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="caulk-playerlist-footer">
          <span>[HOLD TAB TO VIEW // RELEASE TO CLOSE]</span>
          <span style={{ opacity: 0.7 }}>E2E ENCRYPTED // P2P COLLABORATION ENGINE</span>
        </div>
      </div>
    </div>
  );
};
