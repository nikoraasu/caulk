import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  Sidebar,
  convertToExcalidrawElements,
  reconcileElements,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import {
  boardKey,
  boardLabel,
  getLastSeen,
  historyDirFor,
  setLastSeen,
  type Session,
} from "../config";
import { getFreshToken } from "../auth/token";
import { SceneBridge, sanitizeElement, type Digest, type TimerState } from "../crdt/scene";
import { SnapshotStore, type SnapshotInfo } from "../history/snapshots";
import { AssetStore, assetObjectUrl, parseAssetRef } from "../storage/assets";
import { EncryptedStore } from "../storage/encrypted";
import { GitHubAdapter } from "../storage/github";
import { createGitHubIssue } from "../storage/issues";
import { playMeetingChime } from "../lib/chime";
import { SyncEngine, type SyncStatus } from "../sync/engine";
import { getLiveRoomName, LiveSession, type LiveStatus } from "../sync/live";
import { DigestBanner } from "./DigestBanner";
import { HistoryPanel } from "./HistoryPanel";
import { StatusBar } from "./StatusBar";
import { AIAssistantDrawer } from "./AIAssistantDrawer";
import { VideoModal } from "./VideoModal";
import type { RateLimit } from "../storage/types";

const STICKY_COLORS = [
  { name: "Yellow", value: "#FEF08A" },
  { name: "Orange", value: "#FED7AA" },
  { name: "Green", value: "#BBF7D0" },
  { name: "Blue", value: "#BAE6FD" },
  { name: "Purple", value: "#DDD6FE" },
  { name: "Pink", value: "#FECDD3" },
];

/** How often an active board leaves a restore point behind. */
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

type RemoteElements = Parameters<typeof reconcileElements>[1];

/** Identity of the peer set (socket ids and names). Changes only when peers join, leave or rename. */
function peerSetKey(map: Map<SocketId, Collaborator>): string {
  const parts: string[] = [];
  map.forEach((c, id) => parts.push(`${id}\u0000${c.username ?? ""}`));
  return parts.sort().join("\n");
}

function sameSelection(a: Record<string, true> | null, b: Readonly<Record<string, true>>): boolean {
  if (!a) return false;
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === true);
}

type Props = {
  session: Session;
  onClose: () => void;
};

function AssetVideo({ store, reference }: { store: AssetStore; reference: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    assetObjectUrl(store, reference).then(
      (url) => {
        if (!cancelled) setSrc(url);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, reference]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {failed ? (
        <span style={{ color: "#E6D6AC", fontSize: 12 }}>Video unavailable</span>
      ) : src ? (
        <video
          src={src}
          controls
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <span style={{ color: "#E6D6AC", fontSize: 12 }}>Loading video…</span>
      )}
    </div>
  );
}

export function BoardScreen({ session, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const bridgeRef = useRef<SceneBridge | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const snapshotsRef = useRef<SnapshotStore | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const lastRemoteEditAtRef = useRef(0);

  const assetStore = useMemo(
    () =>
      new AssetStore(
        new GitHubAdapter({
          token: getFreshToken,
          owner: session.owner,
          repo: session.repo,
          branch: session.branch,
          path: session.path,
        }),
        session.passphrase,
        session.path,
      ),
    [session.owner, session.repo, session.branch, session.path, session.passphrase],
  );
  const uploadVideoAsset = useCallback(
    (bytes: Uint8Array, mime: string) => assetStore.put(bytes, mime),
    [assetStore],
  );

  const hydratedRef = useRef(false);
  const hydratingRef = useRef(false);
  const localLoadedRef = useRef(false);
  const pointerDownRef = useRef(false);
  const deferredRef = useRef<ExcalidrawElement[] | null>(null);
  const cascadeRef = useRef(0);
  const lastStickyColorRef = useRef(STICKY_COLORS[0].value);
  // Last canvas pointer, kept with the scroll/zoom it was taken at so N can re-project it.
  const lastPointerRef = useRef<{
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    zoom: number;
  } | null>(null);
  const bootRef = useRef({ hydrationDone: false, remoteLoaded: false, digested: false });
  const snapshottingRef = useRef(false);
  const lastSnapshotAtRef = useRef(0);
  const historyOpenRef = useRef(false);
  /** Ids of every element handed to applyLocal last time; used to tell peer deletions from local creations. */
  const appliedIdsRef = useRef<Set<string>>(new Set());
  const latestCollaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());
  const collaboratorsKeyRef = useRef("");
  const selectionRef = useRef<Record<string, true> | null>(null);
  const viewportRef = useRef<{ scrollX: number; scrollY: number; zoom: number } | null>(null);
  const lastSceneRef = useRef<{ sig: string; files: BinaryFiles | undefined } | null>(null);

  const [apiReady, setApiReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ kind: "loading" });
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({
    connected: false,
    peersCount: 0,
    webrtcPeersCount: 0,
    bcPeersCount: 0,
    peers: [],
  });
  const [collaborators, setCollaborators] = useState<Map<SocketId, Collaborator>>(new Map());
  const [remoteEdits, setRemoteEdits] = useState(0);
  const [rateLimit, setRateLimit] = useState<RateLimit>(null);

  const [digest, setDigest] = useState<Digest | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Desktop: the swatch strip beside Excalidraw's shape toolbar, shown unless toggled off.
  const [stickyPanelOpen, setStickyPanelOpen] = useState(false);
  const stickyAnchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!stickyPanelOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!stickyAnchorRef.current?.contains(e.target as Node)) setStickyPanelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStickyPanelOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [stickyPanelOpen]);
  // Narrow layouts: a single "Sticky" button that opens the swatches.
  const [stickyMobileOpen, setStickyMobileOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [stickyToolbarHost, setStickyToolbarHost] = useState<HTMLElement | null>(null);
  const [customColor, setCustomColor] = useState("#FFD166");
  const [currentIdentity] = useState(session.identity);
  const isAllowed = true;

  // Miro Boost Features State
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const timerChimedRef = useRef(false);

  const [followingPeerId, setFollowingPeerId] = useState<number | null>(null);

  const [isPresenting, setIsPresenting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [presentationFrames, setPresentationFrames] = useState<ExcalidrawElement[]>([]);

  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  // AI sidebar docked state, persisted per browser. Defaults to docked.
  const [aiDocked, setAiDocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem("caulk.ai_docked.v1") !== "0";
    } catch {
      return true;
    }
  });
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [creatingIssue, setCreatingIssue] = useState(false);

  const currentIdentityRef = useRef(currentIdentity);
  currentIdentityRef.current = currentIdentity;

  const key = boardKey(session);
  const label = useMemo(() => boardLabel(session), [session]);
  const storageLabel = useMemo(
    () => `${session.owner}/${session.repo}:${session.path}`,
    [session],
  );

  const pushToCanvas = useCallback((elements: ExcalidrawElement[]) => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const local = api.getSceneElementsIncludingDeleted();
    const remote = restoreElements(elements.map(sanitizeElement), null) as unknown as RemoteElements;
    // Reconcile keeps local copies of elements being edited/resized/created and keeps local-only elements.
    const reconciled = reconcileElements(local, remote, appState);

    // Elements the local user is manipulating always keep their local copy. Drags are not tracked
    // in AppState here; remote pushes are already deferred while the pointer is down.
    const active = new Set<string>();
    for (const el of [appState.editingTextElement, appState.resizingElement, appState.newElement]) {
      if (el) active.add(el.id);
    }
    const localById = new Map(local.map((el) => [el.id, el] as const));
    const remoteIds = new Set(remote.map((el) => el.id));
    const appliedIds = appliedIdsRef.current;

    // reconcile never drops local-only elements, so remote deletions are removed here: an element
    // that was applied before and is absent from the remote doc was deleted by a peer. Elements
    // absent from both but not applied yet were created locally and must survive.
    const next: OrderedExcalidrawElement[] = [];
    for (const el of reconciled) {
      if (active.has(el.id)) {
        next.push(localById.get(el.id) ?? el);
      } else if (remoteIds.has(el.id) || !appliedIds.has(el.id)) {
        next.push(el);
      }
    }
    api.updateScene({
      elements: next,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    const store = snapshotsRef.current;
    if (!store) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setSnapshots(await store.list());
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const maybeSnapshot = useCallback(() => {
    const now = Date.now();
    const store = snapshotsRef.current;
    const doc = docRef.current;
    if (!store || !doc || snapshottingRef.current || !isAllowed) return;
    if (now - lastSnapshotAtRef.current < SNAPSHOT_EVERY_MS) return;

    lastSnapshotAtRef.current = now;
    snapshottingRef.current = true;
    void store
      .create(doc, currentIdentity.name)
      .then(() => {
        void store.prune();
        if (historyOpenRef.current) void refreshHistory();
      })
      .catch(() => {
        lastSnapshotAtRef.current = 0; // try again after the next commit
      })
      .finally(() => {
        snapshottingRef.current = false;
      });
  }, [refreshHistory, currentIdentity.name, isAllowed]);

  const maybeDigest = useCallback(() => {
    const boot = bootRef.current;
    if (!boot.hydrationDone || !boot.remoteLoaded || boot.digested) return;
    boot.digested = true;

    const bridge = bridgeRef.current;
    const since = getLastSeen(key);
    if (since && bridge) {
      const result = bridge.digestSince(since);
      if (result.total > 0) setDigest(result);
    }
    setLastSeen(key, Date.now());
  }, [key]);

  const hydrate = useCallback(() => {
    const api = apiRef.current;
    const bridge = bridgeRef.current;
    if (!api || !bridge || hydratedRef.current || !localLoadedRef.current) return;

    hydratedRef.current = true;
    deferredRef.current = null;
    hydratingRef.current = true;
    try {
      bridge.hydrate(
        api.getSceneElements() as unknown as ExcalidrawElement[],
        session.initialAllowedNicknames,
      );
      const storedFiles = bridge.getFiles();
      const fileList = Object.values(storedFiles);
      if (fileList.length > 0) {
        api.addFiles(fileList);
      }
    } finally {
      hydratingRef.current = false;
    }
    bootRef.current.hydrationDone = true;
    maybeDigest();
  }, [maybeDigest]);

  const maybeSnapshotRef = useRef(maybeSnapshot);
  maybeSnapshotRef.current = maybeSnapshot;

  const maybeDigestRef = useRef(maybeDigest);
  maybeDigestRef.current = maybeDigest;

  const hydrateRef = useRef(hydrate);
  hydrateRef.current = hydrate;

  const pushToCanvasRef = useRef(pushToCanvas);
  pushToCanvasRef.current = pushToCanvas;

  useEffect(() => {
    const doc = new Y.Doc();
    docRef.current = doc;

    const persistence = new IndexeddbPersistence(`slate:${key}`, doc);
    const adapter = new GitHubAdapter({
      token: getFreshToken,
      owner: session.owner,
      repo: session.repo,
      branch: session.branch,
      path: session.path,
    });
    const store = new EncryptedStore(adapter, session.passphrase);
    const snapshots = new SnapshotStore(adapter, session.passphrase, historyDirFor(session.path));
    snapshotsRef.current = snapshots;

    const bridge = new SceneBridge(
      doc,
      currentIdentityRef.current,
      (elements) => {
        if (!hydratedRef.current || !apiRef.current) {
          deferredRef.current = elements;
          return;
        }
        if (hydratingRef.current) {
          pushToCanvasRef.current(elements);
          return;
        }
        if (pointerDownRef.current) {
          deferredRef.current = elements;
          return;
        }
        pushToCanvasRef.current(elements);
        const now = Date.now();
        if (now - lastRemoteEditAtRef.current > 1500) {
          lastRemoteEditAtRef.current = now;
          setRemoteEdits((n) => n + 1);
        }
      },
      (remoteFiles) => {
        const fileList = Object.values(remoteFiles);
        if (fileList.length > 0 && apiRef.current) {
          apiRef.current.addFiles(fileList);
        }
      },
    );

    const unobserveAllowed = bridge.observeAllowedNicknames(() => {});
    const unobserveRequests = bridge.observeAccessRequests(() => {});
    const unobserveTimer = bridge.observeTimer((t) => {
      setTimer(t);
    });

    const engine = new SyncEngine({
      doc,
      store,
      debounceMs: 2000,
      pollMs: 2500,
      onStatus: setStatus,
      onRemoteApplied: () => setRateLimit(adapter.rateLimit()),
      onCommitted: () => maybeSnapshotRef.current(),
    });

    bridgeRef.current = bridge;
    engineRef.current = engine;

    let activeLiveSession: LiveSession | null = null;
    void getLiveRoomName(session).then((roomName) => {
      if (!docRef.current) return;
      activeLiveSession = new LiveSession(roomName, {
        doc,
        target: session,
        passphrase: session.passphrase,
        identity: currentIdentityRef.current,
        isAllowed: () => true,
        onStatusChange: setLiveStatus,
        onCollaboratorsChange: (nextCollaborators) => {
          // Pointer frames can arrive up to 60x/s: the scene gets every update, React state only peer changes.
          latestCollaboratorsRef.current = nextCollaborators;
          apiRef.current?.updateScene({
            collaborators: nextCollaborators,
          });
          const peerKey = peerSetKey(nextCollaborators);
          if (peerKey !== collaboratorsKeyRef.current) {
            collaboratorsKeyRef.current = peerKey;
            setCollaborators(nextCollaborators);
          }
        },
      });
      liveSessionRef.current = activeLiveSession;
      // A new live session has not seen our selection or viewport yet, so force the next send.
      selectionRef.current = null;
      viewportRef.current = null;
    });

    persistence.on("synced", () => {
      localLoadedRef.current = true;
      hydrateRef.current();
    });

    void engine.start().then((ok) => {
      if (!ok) return;
      bootRef.current.remoteLoaded = true;
      maybeDigestRef.current();
    });

    const rateTimer = setInterval(() => setRateLimit(adapter.rateLimit()), 5000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") void engine.saveNow();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      clearInterval(rateTimer);
      unobserveAllowed();
      unobserveRequests();
      unobserveTimer();
      activeLiveSession?.destroy();
      liveSessionRef.current = null;
      engine.stop();
      bridge.dispose();
      void persistence.destroy();
      doc.destroy();
      bridgeRef.current = null;
      engineRef.current = null;
      docRef.current = null;
      snapshotsRef.current = null;
    };
  }, [
    key,
    session.owner,
    session.repo,
    session.branch,
    session.path,
    session.passphrase,
  ]);

  useEffect(() => {
    if (apiReady) hydrate();
  }, [apiReady, hydrate]);

  // Push the current peers to the scene once the api is ready; later changes go straight to the scene.
  useEffect(() => {
    if (!apiReady) return;
    const latest = latestCollaboratorsRef.current;
    if (latest.size > 0) apiRef.current?.updateScene({ collaborators: latest });
  }, [apiReady]);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (pointerDownRef.current) {
        pointerDownRef.current = false;
        if (deferredRef.current && hydratedRef.current) {
          pushToCanvas(deferredRef.current);
          deferredRef.current = null;
          setRemoteEdits((n) => n + 1);
        }
      }
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, [pushToCanvas]);

  const onPointerDown = useCallback(() => {
    pointerDownRef.current = true;
  }, []);

  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
    if (deferredRef.current && hydratedRef.current) {
      pushToCanvas(deferredRef.current);
      deferredRef.current = null;
      setRemoteEdits((n) => n + 1);
    }
  }, [pushToCanvas]);

  const onPointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const appState = apiRef.current?.getAppState();
      if (appState) {
        lastPointerRef.current = {
          x: payload.pointer.x,
          y: payload.pointer.y,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom.value,
        };
      }
      if (!isAllowed) return;
      liveSessionRef.current?.updatePointer(payload.pointer, payload.button);
    },
    [isAllowed],
  );

  const onPointerLeave = useCallback(() => {
    liveSessionRef.current?.updatePointer(null);
  }, []);

  // Selection and viewport go to the live session only when they changed.
  const syncLiveView = useCallback((appState: AppState) => {
    const live = liveSessionRef.current;
    if (live && appState.selectedElementIds) {
      if (!sameSelection(selectionRef.current, appState.selectedElementIds)) {
        selectionRef.current = { ...appState.selectedElementIds };
        live.updateSelection(appState.selectedElementIds);
      }
    }

    if (live && appState.scrollX !== undefined && appState.scrollY !== undefined && appState.zoom) {
      const viewport = {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom.value,
      };
      const last = viewportRef.current;
      if (
        !last ||
        last.scrollX !== viewport.scrollX ||
        last.scrollY !== viewport.scrollY ||
        last.zoom !== viewport.zoom
      ) {
        viewportRef.current = viewport;
        live.updateViewport(viewport);
      }
    }
  }, []);

  const onChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files?: BinaryFiles,
    ) => {
      if (!hydratedRef.current || !isAllowed) return;

      // Collaborator-only updates re-emit the same scene. Skip the per-element work when nothing
      // changed: element count, sum of versions and the files object are a cheap fingerprint.
      let versionSum = 0;
      for (const el of elements) versionSum += el.version;
      const sceneSig = `${elements.length}:${versionSum}`;
      const last = lastSceneRef.current;
      if (last && last.sig === sceneSig && last.files === files) {
        syncLiveView(appState);
        return;
      }
      lastSceneRef.current = { sig: sceneSig, files };

      // Preserve font color inside container/sticky notes when stroke/border color is changed
      let hasFontCorrection = false;
      const normalizedElements = elements.map((rawEl) => {
        const el = sanitizeElement(rawEl);
        if (el.type === "text" && el.containerId) {
          const isDirectlyEditing = appState.editingTextElement?.id === el.id;
          const savedFontColor = (el.customData as Record<string, unknown> | undefined)?.fontColor as
            | string
            | undefined || "#1e1e1e";

          if (isDirectlyEditing) {
            // User intentionally picked a font color while editing text directly
            if (el.strokeColor && el.strokeColor !== savedFontColor) {
              return {
                ...el,
                customData: { ...el.customData, fontColor: el.strokeColor },
              };
            }
            return el;
          }

          // User changed container stroke color: Excalidraw auto-applied it to bound text.
          // Restore the intended font color!
          if (el.strokeColor !== savedFontColor) {
            hasFontCorrection = true;
            return {
              ...el,
              strokeColor: savedFontColor,
              customData: { ...el.customData, fontColor: savedFontColor },
            };
          }
        }
        return el;
      });

      if (hasFontCorrection && apiRef.current) {
        const restored = restoreElements(normalizedElements, null);
        apiRef.current.updateScene({
          elements: restored as unknown as OrderedExcalidrawElement[],
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }

      bridgeRef.current?.applyLocal(normalizedElements as readonly ExcalidrawElement[], files);
      appliedIdsRef.current = new Set(normalizedElements.map((el) => el.id));

      syncLiveView(appState);
    },
    [isAllowed, syncLiveView],
  );

  const addSticky = useCallback((color: string, at?: { x: number; y: number }) => {
    if (!isAllowed) return;
    const api = apiRef.current;
    if (!api) return;
    lastStickyColorRef.current = color;
    const appState = api.getAppState();
    const rect = containerRef.current?.getBoundingClientRect();
    const center =
      at ??
      (rect
        ? viewportCoordsToSceneCoords(
            { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
            appState,
          )
        : { x: 0, y: 0 });

    // Cascade new notes so rapid clicks do not stack into one invisible pile.
    const step = cascadeRef.current % 6;
    cascadeRef.current += 1;

    const created = convertToExcalidrawElements(
      [
        {
          type: "rectangle",
          x: center.x - 110 + step * 26,
          y: center.y - 80 + step * 26,
          width: 220,
          height: 160,
          backgroundColor: color,
          fillStyle: "solid",
          strokeColor: "transparent",
          customData: { isSticky: true },
          label: {
            text: "New note",
            fontSize: 20,
            fontFamily: 2,
            textAlign: "center",
            verticalAlign: "middle",
            strokeColor: "#1e1e1e",
          },
        },
      ],
      { regenerateIds: true },
    );

    // Explicitly tag fontColor on the bound text element
    const updatedCreated = created.map((el) => {
      if (el.type === "text" && el.containerId) {
        return {
          ...el,
          customData: { ...el.customData, fontColor: el.strokeColor || "#1e1e1e" },
        };
      }
      return el;
    });

    const current = (api.getSceneElements() || []).map(sanitizeElement);
    const restored = restoreElements([...current, ...updatedCreated.map(sanitizeElement)], null);

    api.updateScene({
      elements: restored as unknown as OrderedExcalidrawElement[],
      appState: {
        selectedElementIds: Object.fromEntries(updatedCreated.map((el) => [el.id, true])),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [isAllowed]);

  // Narrow (mobile) layout check, matching Excalidraw's bottom-toolbar breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 730px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Find Excalidraw's desktop shape toolbar container; re-attach if Excalidraw re-renders it.
  useEffect(() => {
    if (!apiReady) return;
    const root = containerRef.current;
    if (!root) return;
    const find = () =>
      setStickyToolbarHost(root.querySelector<HTMLElement>(".App-menu_top .App-toolbar-container"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [apiReady]);

  // N drops a sticky (last-used colour) at the last canvas pointer position, in scene coords.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.repeat) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
      ) {
        return;
      }
      const api = apiRef.current;
      if (!api) return;
      const s = api.getAppState();
      if (s.editingTextElement) return;
      e.preventDefault();
      let at: { x: number; y: number } | undefined;
      const p = lastPointerRef.current;
      if (p) {
        // Re-project the stored pointer through the current scroll/zoom (sceneX = viewportX / zoom - scrollX).
        const viewportX = (p.x + p.scrollX) * p.zoom;
        const viewportY = (p.y + p.scrollY) * p.zoom;
        at = { x: viewportX / s.zoom.value - s.scrollX, y: viewportY / s.zoom.value - s.scrollY };
      }
      addSticky(lastStickyColorRef.current, at);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addSticky]);

  const openMermaid = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.updateScene({
      appState: {
        openDialog: { name: "ttd", tab: "mermaid" },
      },
    });
  }, []);

  const handleInsertVideo = useCallback(
    (url: string, width: number, height: number) => {
      const api = apiRef.current;
      if (!api) return;

      const appState = api.getAppState();
      const rect = containerRef.current?.getBoundingClientRect();
      const center = rect
        ? viewportCoordsToSceneCoords(
            { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
            appState,
          )
        : { x: 0, y: 0 };

      const x = Math.round(center.x - width / 2);
      const y = Math.round(center.y - height / 2);

      const elementId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const embedEl: ExcalidrawElement = sanitizeElement({
        id: elementId,
        type: "embeddable",
        x,
        y,
        width,
        height,
        angle: 0,
        strokeColor: "#3B4438",
        backgroundColor: "#1B221B",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 2147483647),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: url,
        locked: false,
        customData: { isVideo: true },
      });

      const current = (api.getSceneElements() || []).map(sanitizeElement);
      const nextElements = restoreElements([...current, embedEl], null);
      api.updateScene({
        elements: nextElements as unknown as OrderedExcalidrawElement[],
        appState: {
          selectedElementIds: { [embedEl.id]: true },
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      bridgeRef.current?.applyLocal(nextElements as readonly ExcalidrawElement[]);
      setToastMessage("Video added to board!");
    },
    [],
  );

  const renderEmbeddable = useCallback((element: any) => {
    try {
      const link = element.link?.trim() || "";
      if (!link) return null;
      if (parseAssetRef(link)) return <AssetVideo store={assetStore} reference={link} />;

      // YouTube (standard, shorts, embed, youtu.be)
      const ytMatch = link.match(
        /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
      );
      if (ytMatch?.[1]) {
        return (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytMatch[1]}`}
            style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube Video"
          />
        );
      }

      // Vimeo
      const vimeoMatch = link.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      if (vimeoMatch?.[1]) {
        return (
          <iframe
            src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
            style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Vimeo Video"
          />
        );
      }

      // Loom
      const loomMatch = link.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
      if (loomMatch?.[1]) {
        return (
          <iframe
            src={`https://www.loom.com/embed/${loomMatch[1]}`}
            style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
            allowFullScreen
            title="Loom Video"
          />
        );
      }

      // Google Drive
      const gdriveMatch = link.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      if (gdriveMatch?.[1]) {
        return (
          <iframe
            src={`https://drive.google.com/file/d/${gdriveMatch[1]}/preview`}
            style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
            allowFullScreen
            title="Google Drive Video"
          />
        );
      }

      // Direct Video file or Data URL (mp4, webm, ogg, mov, data:video)
      if (
        link.startsWith("data:video/") ||
        /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(link)
      ) {
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <video
              src={link}
              controls
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        );
      }

      // Generic fallback web embed
      return (
        <iframe
          src={link}
          style={{ width: "100%", height: "100%", border: 0, borderRadius: 8 }}
          allowFullScreen
          title="Embedded Content"
        />
      );
    } catch (err) {
      console.error("renderEmbeddable error:", err);
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#1B221B",
            color: "#E6D6AC",
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          Unable to preview video
        </div>
      );
    }
  }, [assetStore]);

  // Auto-dismiss toast notifications
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Synchronized countdown timer loop
  useEffect(() => {
    if (!timer || !timer.running) {
      setTimerSecondsLeft(null);
      timerChimedRef.current = false;
      return;
    }
    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
      const left = Math.max(0, timer.durationSeconds - elapsed);
      setTimerSecondsLeft(left);
      if (left === 0 && !timerChimedRef.current) {
        timerChimedRef.current = true;
        playMeetingChime();
        setToastMessage(
          `⏱️ Meeting timer finished! (${Math.round(timer.durationSeconds / 60)} min)`,
        );
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [timer]);

  const startMeetingTimer = useCallback(
    (minutes: number) => {
      const durationSeconds = Math.round(minutes * 60);
      bridgeRef.current?.setTimer({
        running: true,
        durationSeconds,
        startedAt: Date.now(),
        startedBy: currentIdentity.name,
      });
      timerChimedRef.current = false;
      setTimerPickerOpen(false);
      setToastMessage(`⏱️ Started ${minutes}m timer for all collaborators.`);
    },
    [currentIdentity.name],
  );

  const stopMeetingTimer = useCallback(() => {
    bridgeRef.current?.setTimer(null);
    setTimerPickerOpen(false);
    setToastMessage("⏱️ Timer stopped.");
  }, []);

  // Follow Collaborator Viewport Mode: the peer's viewport arrives in network-sized
  // steps, so the camera eases toward the latest one every frame instead of jumping.
  const followTargetRef = useRef<{ scrollX: number; scrollY: number; zoom: number } | null>(null);
  useEffect(() => {
    if (!followingPeerId) {
      followTargetRef.current = null;
      return;
    }
    const targetPeer = liveStatus.peers.find((p) => p.clientId === followingPeerId);
    if (!targetPeer) {
      setFollowingPeerId(null);
      return;
    }
    if (targetPeer.viewport) followTargetRef.current = targetPeer.viewport;
  }, [followingPeerId, liveStatus.peers]);

  useEffect(() => {
    if (!followingPeerId) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const api = apiRef.current;
      const target = followTargetRef.current;
      const dt = Math.min(100, now - last);
      last = now;
      if (!api || !target) return;
      const cur = api.getAppState();
      const k = 1 - Math.exp(-dt / 90);
      const dx = target.scrollX - cur.scrollX;
      const dy = target.scrollY - cur.scrollY;
      const dz = target.zoom - cur.zoom.value;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(dz) < 0.001) return;
      api.updateScene({
        appState: {
          scrollX: cur.scrollX + dx * k,
          scrollY: cur.scrollY + dy * k,
          zoom: { value: (cur.zoom.value + dz * k) as typeof cur.zoom.value },
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [followingPeerId]);

  // Frame Creation
  const addFrame = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = elements.filter((el) => appState.selectedElementIds[el.id]);

    let x = 0;
    let y = 0;
    let width = 960;
    let height = 600;

    if (selected.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const el of selected) {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }
      x = minX - 40;
      y = minY - 50;
      width = Math.max(400, maxX - minX + 80);
      height = Math.max(300, maxY - minY + 90);
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      const center = rect
        ? viewportCoordsToSceneCoords(
            { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
            appState,
          )
        : { x: 0, y: 0 };
      x = center.x - 480;
      y = center.y - 300;
    }

    const frameCount = elements.filter(
      (el) => (el.customData as Record<string, unknown> | undefined)?.isFrame,
    ).length;
    const frameTitle = `Frame ${frameCount + 1}`;

    const created = convertToExcalidrawElements([
      {
        type: "rectangle",
        x,
        y,
        width,
        height,
        backgroundColor: "transparent",
        strokeColor: "#C59C3A",
        strokeStyle: "dashed",
        strokeWidth: 2,
        roughness: 0,
        customData: { isFrame: true, frameTitle },
        label: {
          text: frameTitle,
          fontSize: 20,
          fontFamily: 2,
          textAlign: "left",
          verticalAlign: "top",
          strokeColor: "#E6D6AC",
        },
      },
    ]);

    api.updateScene({
      elements: [...elements, ...created] as unknown as OrderedExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setToastMessage(`🖼️ Added "${frameTitle}"`);
  }, []);

  // Presentation Mode
  const startPresentation = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const frames = elements
      .filter((el) => (el.customData as Record<string, unknown> | undefined)?.isFrame)
      .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

    if (frames.length === 0) {
      setToastMessage("No frames on canvas. Click 'Frame' to create slide frames first!");
      return;
    }

    setPresentationFrames(frames);
    setSlideIndex(0);
    setIsPresenting(true);
    api.scrollToContent([frames[0]], { fitToViewport: true, animate: true });
  }, []);

  const goToSlide = useCallback(
    (nextIndex: number) => {
      const api = apiRef.current;
      if (!api || presentationFrames.length === 0) return;
      const bounded = Math.max(0, Math.min(presentationFrames.length - 1, nextIndex));
      setSlideIndex(bounded);
      api.scrollToContent([presentationFrames[bounded]], { fitToViewport: true, animate: true });
    },
    [presentationFrames],
  );

  useEffect(() => {
    if (!isPresenting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goToSlide(slideIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToSlide(slideIndex - 1);
      } else if (e.key === "Escape") {
        setIsPresenting(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresenting, slideIndex, goToSlide]);

  // GitHub Issues Integration
  const convertSelectedToIssue = useCallback(async () => {
    const api = apiRef.current;
    if (!api || creatingIssue) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = elements.filter((el) => appState.selectedElementIds[el.id]);

    if (selected.length === 0) {
      setToastMessage("Select a sticky note or text element first to create an issue.");
      return;
    }

    let targetText = "";
    let targetElement: ExcalidrawElement | null = null;

    for (const el of selected) {
      if (el.type === "text" && (el as unknown as { text?: string }).text) {
        targetText = (el as unknown as { text: string }).text;
        targetElement = el;
        break;
      }
      if (el.type === "rectangle" && (el.customData as Record<string, unknown> | undefined)?.isSticky) {
        const bound = elements.find((b) => b.type === "text" && b.containerId === el.id);
        if (bound && (bound as unknown as { text?: string }).text) {
          targetText = (bound as unknown as { text: string }).text;
          targetElement = bound;
          break;
        }
      }
    }

    if (!targetText.trim()) {
      setToastMessage("Please select a note with text to create an issue.");
      return;
    }

    setCreatingIssue(true);
    const lines = targetText.trim().split("\n");
    const issueTitle = lines[0].replace(/^#+\s*/, "");
    const issueBody =
      lines.slice(1).join("\n").trim() || `Created from Caulk board: ${storageLabel}`;

    try {
      const issue = await createGitHubIssue(
        getFreshToken,
        session.owner,
        session.repo,
        issueTitle,
        issueBody,
      );
      setToastMessage(`✓ Created Issue #${issue.number}: "${issue.title}" in GitHub!`);

      if (targetElement) {
        const updatedText = `${targetText}\n\n#${issue.number} ${issue.htmlUrl}`;
        const updatedElements = elements.map((el) => {
          if (el.id === targetElement?.id) {
            return {
              ...el,
              text: updatedText,
              originalText: updatedText,
            };
          }
          return el;
        });
        api.updateScene({
          elements: updatedElements as unknown as OrderedExcalidrawElement[],
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      }
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : "Failed to create issue.");
    } finally {
      setCreatingIssue(false);
    }
  }, [creatingIssue, session, storageLabel]);

  // Stamp / Reaction
  const stampReaction = useCallback(
    (emoji: string) => {
      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const selected = elements.filter((el) => appState.selectedElementIds[el.id]);

      let x = 0;
      let y = 0;

      if (selected.length > 0) {
        const el = selected[0];
        x = el.x + el.width - 24;
        y = el.y - 12;
      } else {
        const rect = containerRef.current?.getBoundingClientRect();
        const center = rect
          ? viewportCoordsToSceneCoords(
              { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
              appState,
            )
          : { x: 0, y: 0 };
        x = center.x;
        y = center.y;
      }

      const stampElement = convertToExcalidrawElements([
        {
          type: "text",
          x,
          y,
          text: `${emoji} ${currentIdentity.name}`,
          fontSize: 16,
          fontFamily: 2,
          strokeColor: "#E6D6AC",
          backgroundColor: "transparent",
        },
      ]);

      api.updateScene({
        elements: [...elements, ...stampElement] as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      setReactionPickerOpen(false);
    },
    [currentIdentity.name],
  );

  const setHistory = useCallback(
    (open: boolean) => {
      historyOpenRef.current = open;
      setHistoryOpen(open);
      if (open) void refreshHistory();
    },
    [refreshHistory],
  );

  const snapshotNow = useCallback(async () => {
    const store = snapshotsRef.current;
    const doc = docRef.current;
    if (!store || !doc || !isAllowed) return;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      await store.create(doc, currentIdentity.name);
      await refreshHistory();
      void store.prune();
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryBusy(false);
    }
  }, [refreshHistory, currentIdentity.name, isAllowed]);

  const restoreSnapshot = useCallback(async (snapshot: SnapshotInfo) => {
    const store = snapshotsRef.current;
    const bridge = bridgeRef.current;
    if (!store || !bridge) return;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const restored = await store.read(snapshot.path);
      bridge.replaceAll(restored.elements, restored.meta);
      historyOpenRef.current = false;
      setHistoryOpen(false);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  const copyShareLink = useCallback(() => {
    const origin = window.location.origin + window.location.pathname;
    const repoSlug = `${session.owner}/${session.repo}`;
    const boardSlug = boardLabel(session);
    const shareUrl = `${origin}#repo=${encodeURIComponent(repoSlug)}&board=${encodeURIComponent(boardSlug)}`;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          setToastMessage("Board invite link copied! Send it to your collaborator.");
        })
        .catch(() => {
          setToastMessage(`Share URL: ${shareUrl}`);
        });
    } else {
      setToastMessage(`Share URL: ${shareUrl}`);
    }
  }, [session]);

  const busy = status.kind === "loading" || status.kind === "saving";

  const stickySwatches = (
    <div className="sticky-swatches">
      {STICKY_COLORS.map((c) => (
        <button
          key={c.value}
          className="swatch"
          style={{ background: c.value }}
          title={`Add ${c.name.toLowerCase()} sticky note`}
          aria-label={`Add ${c.name.toLowerCase()} sticky note`}
          onClick={() => addSticky(c.value)}
        />
      ))}
      <div className="swatch-wheel-wrapper" title="Pick any custom color via hex wheel">
        <div
          className="swatch-wheel"
          style={{
            background: "conic-gradient(from 90deg, red, yellow, lime, aqua, blue, magenta, red)",
          }}
        >
          <input
            type="color"
            value={customColor}
            onChange={(e) => {
              const chosen = e.target.value;
              setCustomColor(chosen);
              addSticky(chosen);
            }}
            title="Color wheel: pick custom hex color"
          />
        </div>
      </div>
    </div>
  );

  const syncDot =
    status.kind === "error"
      ? "err"
      : status.kind === "pending" || status.kind === "loading"
        ? "warn"
        : status.kind === "saving"
          ? "busy"
          : "ok";
  const syncLabel =
    status.kind === "error"
      ? "Sync error"
      : status.kind === "pending"
        ? "Unsaved"
        : status.kind === "saving"
          ? "Saving…"
          : status.kind === "loading"
            ? "Unlocking…"
            : "Saved";

  return (
    <div
      className="board-layout"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <header className="vgui-topbar">
        <div className="topbar-left">
          <span className="vgui-lambda">λ</span>
          <span className="topbar-title" title={storageLabel}>
            {label}
          </span>
          <span
            className="topbar-sync"
            title={status.kind === "error" ? status.message : storageLabel}
          >
            <span className={`dot ${syncDot}`} />
            <span>{syncLabel}</span>
          </span>
          {timer?.running && timerSecondsLeft !== null && (
            <button
              type="button"
              className="topbar-btn active"
              onClick={() => setTimerPickerOpen(!timerPickerOpen)}
              title={`Meeting timer running: ${timerSecondsLeft}s left. Click for timer controls.`}
            >
              <span>⏱️</span>
              <span>
                {`${Math.floor(timerSecondsLeft / 60)
                  .toString()
                  .padStart(2, "0")}:${(timerSecondsLeft % 60).toString().padStart(2, "0")}`}
              </span>
            </button>
          )}
        </div>

        <div className="topbar-center">
          {followingPeerId && (
            <button
              type="button"
              className="following-indicator"
              onClick={() => setFollowingPeerId(null)}
              title="Click to stop following"
            >
              <span>
                👁️ Following @{liveStatus.peers.find((p) => p.clientId === followingPeerId)?.name || "peer"}
              </span>
              <span style={{ fontSize: 9 }}>✕</span>
            </button>
          )}
        </div>

        <div className="topbar-right">
          <div
            className="topbar-user-pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: "#FFFFFF",
              background: "var(--vgui-base)",
              padding: "3px 8px",
              border: "1px solid var(--vgui-dark)",
              borderRadius: 3,
            }}
            title={`Collaborating as @${currentIdentity.name}`}
          >
            <span style={{ color: "var(--vgui-accent)" }}>👤</span>
            <span>@{currentIdentity.name}</span>
          </div>

          <div
            className={`live-status-pill ${liveStatus.peersCount > 0 ? "live" : "solo"}`}
            title={
              liveStatus.peersCount > 0
                ? `${liveStatus.peersCount} peer(s) connected for real-time live preview.`
                : "No other peers connected right now. Syncing changes via GitHub."
            }
          >
            <span className="live-mini-dot" />
            <span className="live-label">
              {liveStatus.peersCount > 0
                ? `${liveStatus.peersCount} ${liveStatus.peersCount === 1 ? "peer" : "peers"}`
                : "Live ready"}
            </span>
          </div>

          <div className="collaborator-avatars">
            <span
              className="collaborator-avatar my-avatar"
              style={{
                borderColor: liveSessionRef.current?.userColor.stroke ?? "#4157ff",
                background: liveSessionRef.current?.userColor.background ?? "#e8ecff",
                color: liveSessionRef.current?.userColor.stroke ?? "#4157ff",
              }}
              title={`${currentIdentity.name} (You)`}
            >
              {currentIdentity.name.slice(0, 2).toUpperCase()}
            </span>

            {liveStatus.peers.map((peer) => (
              <span
                key={peer.clientId}
                className="collaborator-avatar"
                style={{
                  borderColor: peer.color.stroke,
                  background: peer.color.background,
                  color: peer.color.stroke,
                  cursor: "pointer",
                  outline: followingPeerId === peer.clientId ? "2px solid var(--vgui-accent)" : undefined,
                }}
                title={`Click to follow ${peer.name}'s view`}
                onClick={() => setFollowingPeerId(followingPeerId === peer.clientId ? null : peer.clientId)}
              >
                {peer.name.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Timer Picker Popover */}
      {timerPickerOpen && (
        <div className="topbar-popover">
          <div className="topbar-popover-title">Meeting Timer</div>
          <div className="topbar-popover-row">
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "4px 8px" }}
              onClick={() => startMeetingTimer(1)}
            >
              1m
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "4px 8px" }}
              onClick={() => startMeetingTimer(3)}
            >
              3m
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "4px 8px" }}
              onClick={() => startMeetingTimer(5)}
            >
              5m
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "4px 8px" }}
              onClick={() => startMeetingTimer(10)}
            >
              10m
            </button>
          </div>
          {timer?.running && (
            <button
              type="button"
              className="btn primary"
              style={{ width: "100%", marginTop: 4, background: "#883333" }}
              onClick={stopMeetingTimer}
            >
              Stop Timer
            </button>
          )}
        </div>
      )}

      {/* Emoji Reaction Stamp Popover */}
      {reactionPickerOpen && (
        <div className="topbar-popover">
          <div className="topbar-popover-title">Stamp Reaction</div>
          <div className="topbar-popover-row">
            {["👍", "🔥", "💡", "🚀", "❤️"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="btn ghost"
                style={{ padding: "4px 8px", fontSize: 18 }}
                onClick={() => stampReaction(emoji)}
                title={`Stamp ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Miro-Style Presentation Mode Bar */}
      {isPresenting && (
        <div className="presenter-bar">
          <button
            type="button"
            className="btn ghost"
            disabled={slideIndex <= 0}
            onClick={() => goToSlide(slideIndex - 1)}
          >
            ◀ Prev
          </button>
          <div className="presenter-title">
            Slide {slideIndex + 1} of {presentationFrames.length}
            <div style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 400 }}>
              {(presentationFrames[slideIndex]?.customData as Record<string, unknown> | undefined)
                ?.frameTitle as string || `Frame ${slideIndex + 1}`}
            </div>
          </div>
          <button
            type="button"
            className="btn ghost"
            disabled={slideIndex >= presentationFrames.length - 1}
            onClick={() => goToSlide(slideIndex + 1)}
          >
            Next ▶
          </button>
          <button
            type="button"
            className="btn primary"
            style={{ marginLeft: 8 }}
            onClick={() => setIsPresenting(false)}
          >
            ✕ Exit
          </button>
        </div>
      )}

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="toast-popup">
          <span>{toastMessage}</span>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "1px 6px", fontSize: 10 }}
            onClick={() => setToastMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {apiReady && !isNarrow && stickyToolbarHost
        ? createPortal(
            <div className="sticky-anchor" ref={stickyAnchorRef}>
              <button
                type="button"
                className={`Island sticky-trigger${stickyPanelOpen ? " active" : ""}`}
                onClick={() => setStickyPanelOpen((open) => !open)}
                title="Sticky note (N)"
                aria-label="Sticky note (N)"
                aria-expanded={stickyPanelOpen}
              >
                <span className="sticky-trigger-icon" style={{ background: lastStickyColorRef.current }} />
              </button>
              {stickyPanelOpen && (
                <div
                  className="Island sticky-popover"
                  role="toolbar"
                  aria-label="Sticky colours"
                  onClick={(e) => {
                    // Picking a colour closes the popover; the colour wheel input keeps it open.
                    if ((e.target as HTMLElement).closest("button")) setStickyPanelOpen(false);
                  }}
                >
                  {stickySwatches}
                </div>
              )}
            </div>,
            stickyToolbarHost,
          )
        : null}

      {apiReady && (isNarrow || !stickyToolbarHost) && (
        <div className="sticky-mobile">
          <button
            type="button"
            className={`sticky-mobile-btn${stickyMobileOpen ? " active" : ""}`}
            onClick={() => setStickyMobileOpen((open) => !open)}
            title="Sticky note (N)"
            aria-label="Sticky note (N)"
            aria-expanded={stickyMobileOpen}
          >
            📝 Sticky
          </button>
          {stickyMobileOpen && (
            <div className="Island sticky-mobile-popover" style={{ "--padding": 1 } as CSSProperties}>
              {stickySwatches}
            </div>
          )}
        </div>
      )}

      <div className="board">
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
            if (import.meta.env.DEV) {
              (window as unknown as Record<string, unknown>).__excalidrawAPI = api;
            }
            setApiReady(true);
          }}
          isCollaborating={true}
          viewModeEnabled={!isAllowed}
          onPointerUpdate={onPointerUpdate}
          onChange={onChange}
          theme="dark"
          initialData={{
            appState: {
              viewBackgroundColor: "#283125",
              currentItemRoughness: 0,
              currentItemFontFamily: 2,
              currentItemStrokeWidth: 2,
              collaborators,
            },
          }}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
          validateEmbeddable={true}
          renderEmbeddable={renderEmbeddable}
          renderTopRightUI={(_isMobile, appState) => (
            <>
              <button
                type="button"
                className={`sidebar-trigger${videoModalOpen ? " active" : ""}`}
                title="Embed YouTube, Vimeo, Loom, or local video file onto the board"
                onClick={() => setVideoModalOpen(true)}
              >
                <span>🎬</span>
                <span>Video</span>
              </button>
              <button
                type="button"
                className={`sidebar-trigger${appState.openSidebar?.name === "ai" ? " active" : ""}`}
                title="AI Assistant: draw diagrams, analyze board, brainstorm stickies, auto-cluster"
                onClick={() => apiRef.current?.toggleSidebar({ name: "ai" })}
              >
                <span>🤖</span>
                <span>AI</span>
              </button>
            </>
          )}
        >
          <MainMenu>
            <MainMenu.Group title="Caulk">
              <MainMenu.Item onSelect={() => setVideoModalOpen(true)}>Insert video</MainMenu.Item>
              <MainMenu.Item onSelect={() => setTimerPickerOpen(!timerPickerOpen)}>
                {timer?.running ? "Meeting timer (running)" : "Meeting timer"}
              </MainMenu.Item>
              <MainMenu.Item onSelect={() => setHistory(!historyOpen)}>Board history</MainMenu.Item>
              <MainMenu.Item onSelect={() => void engineRef.current?.saveNow()}>Save now</MainMenu.Item>
              <MainMenu.Item onSelect={() => void engineRef.current?.pullNow()}>Pull from GitHub</MainMenu.Item>
              <MainMenu.Item onSelect={addFrame}>Frame selection</MainMenu.Item>
              <MainMenu.Item onSelect={() => apiRef.current?.toggleSidebar({ name: "ai" })}>
                AI assistant
              </MainMenu.Item>
              <MainMenu.Item onSelect={openMermaid}>Mermaid diagram</MainMenu.Item>
              <MainMenu.Item onSelect={startPresentation}>Present frames</MainMenu.Item>
              <MainMenu.Item onSelect={() => setReactionPickerOpen(!reactionPickerOpen)}>
                Stamp reaction
              </MainMenu.Item>
              <MainMenu.Item onSelect={() => setStickyPanelOpen(!stickyPanelOpen)}>Sticky palette</MainMenu.Item>
              <MainMenu.Item onSelect={copyShareLink}>Copy invite link</MainMenu.Item>
              <MainMenu.Item
                onSelect={() => {
                  if (!creatingIssue) void convertSelectedToIssue();
                }}
              >
                Convert note to issue
              </MainMenu.Item>
              <MainMenu.Item onSelect={onClose}>Switch board / log out</MainMenu.Item>
            </MainMenu.Group>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
          <Sidebar
            name="ai"
            className="ai-sidebar"
            docked={aiDocked}
            onDock={(docked) => {
              setAiDocked(docked);
              try {
                localStorage.setItem("caulk.ai_docked.v1", docked ? "1" : "0");
              } catch {
                // Storage unavailable (private mode or blocked); docked state just won't persist.
              }
            }}
          >
            <Sidebar.Header>AI Assistant</Sidebar.Header>
            <AIAssistantDrawer
              onClose={() => apiRef.current?.toggleSidebar({ name: "ai", force: false })}
              apiRef={apiRef}
              onToast={(msg) => setToastMessage(msg)}
            />
          </Sidebar>
        </Excalidraw>
      </div>

      {digest && <DigestBanner digest={digest} onDismiss={() => setDigest(null)} />}

      <VideoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        onInsertVideo={handleInsertVideo}
        uploadAsset={uploadVideoAsset}
      />

      <HistoryPanel
        open={historyOpen}
        snapshots={snapshots}
        loading={historyLoading}
        busy={historyBusy}
        error={historyError}
        onClose={() => setHistory(false)}
        onRefresh={() => void refreshHistory()}
        onSnapshotNow={() => void snapshotNow()}
        onRestore={(snapshot) => void restoreSnapshot(snapshot)}
      />

      <StatusBar
        status={status}
        liveStatus={liveStatus}
        lastPollAt={engineRef.current?.lastPolledAt ?? 0}
        remoteEdits={remoteEdits}
        rateLimit={rateLimit}
        label={storageLabel}
        busy={busy}
        historyOpen={historyOpen}
        onHistory={() => setHistory(!historyOpen)}
        onSaveNow={() => void engineRef.current?.saveNow()}
        onPullNow={() => void engineRef.current?.pullNow()}
        onClose={onClose}
      />
    </div>
  );
}
