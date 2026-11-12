import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { LiveSession, PeerUser } from "../../sync/live";
import "./presence.css";

export type ActivePing = {
  id: string;
  x: number;
  y: number;
  at: number;
  author: string;
  color: string;
};

const PING_TTL_MS = 3500;
export const PING_COOLDOWN_MS = 2000;

type Props = {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  apiReady: boolean;
  liveSessionRef: MutableRefObject<LiveSession | null>;
  peers: PeerUser[];
  currentAuthor: string;
  myColor: string;
  followingPeerId: number | null;
  presenting: boolean;
  pingMode: boolean;
  onCancelPingMode: () => void;
  onFollowPeer: (clientId: number | null, broughtBy?: string | null) => void;
  broughtByBanner: string | null;
  onStopPresenting: () => void;
  onRateLimitToast: (msg: string) => void;
};

export function PresenceOverlay({
  apiRef,
  apiReady,
  liveSessionRef,
  peers,
  currentAuthor,
  myColor,
  followingPeerId,
  presenting,
  pingMode,
  onCancelPingMode,
  onFollowPeer,
  broughtByBanner,
  onStopPresenting,
  onRateLimitToast,
}: Props) {
  const [, setTick] = useState(0);
  const [localPings, setLocalPings] = useState<ActivePing[]>([]);
  const lastPingSentAtRef = useRef(0);
  const seenSummonIdsRef = useRef<Set<string>>(new Set());
  const prevPresentingIdsRef = useRef<Set<number>>(new Set());

  // Recompute ping coordinates when scrolling or resizing.
  useEffect(() => {
    const api = apiRef.current;
    if (!apiReady || !api) return;
    let raf = 0;
    const bump = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    };
    const u1 = api.onScrollChange(() => bump());
    return () => {
      if (raf) cancelAnimationFrame(raf);
      u1();
    };
  }, [apiReady, apiRef]);

  // Periodically prune expired pings so rings fade cleanly after PING_TTL_MS.
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - PING_TTL_MS;
      setLocalPings((prev) => prev.filter((p) => p.at >= cutoff));
      setTick((t) => t + 1);
    }, 350);
    return () => clearInterval(id);
  }, []);

  // Watch peer summon bursts and presenter joins -> move/follow presenter cleanly.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const now = Date.now();
    const curPresenters = new Set<number>();

    for (const peer of peers) {
      if (peer.presenting) curPresenters.add(peer.clientId);

      // Explicit one-shot summon ("Bring everyone to me").
      const summon = peer.summon;
      if (
        summon &&
        !seenSummonIdsRef.current.has(summon.id) &&
        now - summon.at < 15_000
      ) {
        seenSummonIdsRef.current.add(summon.id);
        api.updateScene({
          appState: {
            scrollX: summon.viewport.scrollX,
            scrollY: summon.viewport.scrollY,
            zoom: { value: summon.viewport.zoom as ReturnType<typeof api.getAppState>["zoom"]["value"] },
          },
        });
        onFollowPeer(peer.clientId, peer.name);
        continue;
      }

      // Entering Presenter mode pulls unattached viewers into following.
      if (
        peer.presenting &&
        !prevPresentingIdsRef.current.has(peer.clientId) &&
        followingPeerId === null &&
        !presenting
      ) {
        onFollowPeer(peer.clientId, peer.name);
      }
    }

    prevPresentingIdsRef.current = curPresenters;
  }, [peers, apiRef, followingPeerId, presenting, onFollowPeer]);

  // Esc or wheel pan stops following.
  useEffect(() => {
    if (!followingPeerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFollowPeer(null, null);
    };
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest(".excalidraw")) {
        onFollowPeer(null, null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [followingPeerId, onFollowPeer]);

  const emitPingAtClient = useCallback(
    (clientX: number, clientY: number) => {
      const api = apiRef.current;
      if (!api) return;
      const now = Date.now();
      if (now - lastPingSentAtRef.current < PING_COOLDOWN_MS) {
        onRateLimitToast("Wait a moment before sending another ping.");
        return;
      }
      lastPingSentAtRef.current = now;
      const scenePt = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
      const id = `ping-${now}-${Math.random().toString(36).slice(2, 6)}`;
      liveSessionRef.current?.triggerPing({
        id,
        x: scenePt.x,
        y: scenePt.y,
        at: now,
      });
      setLocalPings((prev) => [
        ...prev.filter((p) => now - p.at < PING_TTL_MS),
        {
          id,
          x: scenePt.x,
          y: scenePt.y,
          at: now,
          author: currentAuthor,
          color: myColor,
        },
      ]);
    },
    [apiRef, liveSessionRef, currentAuthor, myColor, onRateLimitToast],
  );

  // Alt+click anywhere on the Excalidraw canvas triggers an attention ping.
  useEffect(() => {
    if (!apiReady) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!e.altKey || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".excalidraw")) return;
      e.preventDefault();
      e.stopPropagation();
      emitPingAtClient(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [apiReady, emitPingAtClient]);

  // Combine local pings and recent peer pings.
  const now = Date.now();
  const allPings: ActivePing[] = [
    ...localPings.filter((p) => now - p.at < PING_TTL_MS),
    ...peers
      .filter((peer) => peer.ping && now - peer.ping.at < PING_TTL_MS)
      .map((peer) => ({
        id: peer.ping!.id,
        x: peer.ping!.x,
        y: peer.ping!.y,
        at: peer.ping!.at,
        author: peer.name,
        color: peer.color.stroke,
      })),
  ];

  const api = apiRef.current;
  const appState = api?.getAppState();

  const jumpToPing = (ping: ActivePing) => {
    if (!api || !appState) return;
    const vw = (appState.width || window.innerWidth) / appState.zoom.value;
    const vh = (appState.height || window.innerHeight) / appState.zoom.value;
    api.updateScene({
      appState: {
        scrollX: -(ping.x - vw / 2),
        scrollY: -(ping.y - vh / 2),
      },
    });
  };

  return (
    <div
      className={`presence-overlay${pingMode ? " ping-mode" : ""}`}
      onClick={(e) => {
        if (!pingMode) return;
        e.stopPropagation();
        emitPingAtClient(e.clientX, e.clientY);
        onCancelPingMode();
      }}
    >
      {pingMode && (
        <div className="presence-banner">
          <span>Click anywhere to ping attention (or Alt+click anytime)</span>
          <button type="button" onClick={onCancelPingMode}>
            Cancel (Esc)
          </button>
        </div>
      )}

      {!pingMode && presenting && (
        <div className="presence-banner">
          <span className="summon-toast-dot" />
          <span>Presenting — peers follow your viewport</span>
          <button type="button" onClick={onStopPresenting}>
            Stop presenting
          </button>
        </div>
      )}

      {!pingMode && !presenting && followingPeerId && broughtByBanner && (
        <div className="presence-banner">
          <span>@{broughtByBanner} brought you here</span>
          <button type="button" onClick={() => onFollowPeer(null, null)}>
            Stop following (Esc)
          </button>
        </div>
      )}

      {api &&
        appState &&
        allPings.map((ping) => {
          const vp = sceneCoordsToViewportCoords(
            { sceneX: ping.x, sceneY: ping.y },
            appState,
          );
          const x = vp.x - (appState.offsetLeft || 0);
          const y = vp.y - (appState.offsetTop || 0);
          const w = appState.width || window.innerWidth;
          const h = appState.height || window.innerHeight;
          const margin = 36;
          const onScreen = x >= 0 && x <= w && y >= 0 && y <= h;

          if (onScreen) {
            return (
              <div
                key={ping.id}
                className="ping-beacon"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  ["--ping-color" as string]: ping.color,
                }}
              >
                <div className="ping-ring" />
                <div className="ping-core" />
                <div className="ping-author-tag">📍 {ping.author}</div>
              </div>
            );
          }

          // Off-screen edge arrow clamped inside viewport bounds.
          const cx = w / 2;
          const cy = h / 2;
          const angle = Math.atan2(y - cy, x - cx);
          const clampedX = Math.max(margin, Math.min(w - margin, x));
          const clampedY = Math.max(margin, Math.min(h - margin, y));
          const deg = Math.round((angle * 180) / Math.PI);

          return (
            <button
              key={`edge-${ping.id}`}
              type="button"
              className="ping-edge-indicator"
              style={{
                left: `${clampedX}px`,
                top: `${clampedY}px`,
                ["--ping-color" as string]: ping.color,
              }}
              title={`Click to jump to ${ping.author}'s ping`}
              onClick={() => jumpToPing(ping)}
            >
              <span
                className="ping-edge-arrow"
                style={{ transform: `rotate(${deg}deg)` }}
              >
                ➜
              </span>
              <span>{ping.author}</span>
            </button>
          );
        })}
    </div>
  );
}
