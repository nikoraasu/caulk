import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  Sidebar,
  convertToExcalidrawElements,
  exportToSvg,
  reconcileElements,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
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
  defaultPassphrase,
  getLastSeen,
  historyDirFor,
  setBoardPassphrase,
  setLastSeen,
  type Session,
} from "../config";
import { getFreshToken } from "../auth/token";
import { SceneBridge, sanitizeElement, type CanvasBackgroundImage, type Digest, type TimerState, type Waypoint } from "../crdt/scene";
import { Minimap } from "./Minimap";
import { FrameNavigator } from "./FrameNavigator";
import { PlayerListModal } from "./PlayerListModal";
import { BranchingOverlay } from "../features/diagram/BranchingOverlay";
import { SelectionToolbar } from "../features/layout/SelectionToolbar";
import { SmartGuidesOverlay } from "../features/layout/SmartGuidesOverlay";
import { CodeSnippetCard } from "../features/embeds/CodeSnippetCard";
import { ChecklistCard } from "../features/embeds/ChecklistCard";
import { WebBookmarkCard } from "../features/embeds/WebBookmarkCard";
import { layoutHierarchy } from "../features/diagram/hierarchyLayout";
import { SnapshotStore, type SnapshotInfo } from "../history/snapshots";
import { AssetStore, assetObjectUrl } from "../storage/assets";
import { ImageAssetSync } from "../sync/imageAssets";
import { EncryptedStore } from "../storage/encrypted";
import { GitHubAdapter, fetchRepoCollaborators, type RepoCollaborator } from "../storage/github";
import {
  createGitHubIssue,
  fetchGitHubIssue,
  isGitHubIssueLink,
  type IssueDetail,
} from "../storage/issues";
import { GitHubIssueCard } from "../features/issues/GitHubIssueCard";
import { IssuesDrawer } from "../features/issues/IssuesDrawer";
import { rekeyBoard } from "../storage/rekey";
import { playMeetingChime } from "../lib/chime";
import { SyncEngine, type SyncStatus } from "../sync/engine";
import { getLiveRoomName, isElectedSaver, LiveSession, type LiveStatus, type PeerUser } from "../sync/live";
import { DigestBanner } from "./DigestBanner";
import { HistoryPanel } from "./HistoryPanel";
import { StatusBar } from "./StatusBar";
import { ChangePasswordModal, UnlockBoardModal } from "./BoardPasswordModal";
import { VideoModal } from "./VideoModal";
import { VideoEmbedFrame } from "./VideoEmbedFrame";
import { BackgroundPicker } from "./BackgroundPicker";
import { ThemePickerModal } from "./ThemePickerModal";
import { ElementRadiusControl } from "./ElementRadiusControl";
import {
  loadStickyDefaults,
  saveStickyDefaults,
  type StickyDefaults,
} from "../features/stickies/stickyDefaults";
import {
  DEFAULT_BOARD_THEME,
  applyBoardThemeToDom,
  resetBoardThemeOnDom,
  getThemePreset,
  type BoardThemeConfig,
} from "./boardTheme";
import { VGUI_STICKY_PICKS, vguiShade } from "./vguiColors";
import { CommentOverlay } from "../features/comments/CommentOverlay";
import { CommentsSidebar } from "../features/comments/CommentsSidebar";
import {
  isThreadUnread,
  observeComments,
  type CommentThread,
} from "../features/comments/store";
import { VotingOverlay } from "../features/voting/VotingOverlay";
import { StartVotingModal, VotingResultsModal } from "../features/voting/VotingModals";
import {
  observeElementReactions,
  observeVoting,
  type ElementReactionBucket,
  type VotingSnapshot,
} from "../features/voting/store";
import { PresenceOverlay } from "../features/presence/PresenceOverlay";
import { TemplateGalleryModal } from "../features/templates/TemplateGalleryModal";
import { instantiateTemplate } from "../features/templates/store";
import type { BoardTemplate, TemplateElement } from "../features/templates/types";
import { recordRecentBoard, saveBoardThumbnail } from "../features/home/store";
import { TagsOverlay } from "../features/tags/TagsOverlay";
import { TagSidebarSection } from "../features/tags/TagSidebarSection";
import { ClusterModal } from "../features/tags/ClusterModal";
import { addTagToElement, removeTagFromElement } from "../features/tags/store";
import { soundEngine } from "../audio/soundEngine";
import type { RateLimit } from "../storage/types";
import { WhiteboardTaskCard } from "../features/tasks/TaskCard";
import { TaskDetailsModal } from "../features/tasks/TaskDetailsModal";
import { TaskHubModal } from "../features/tasks/TaskHubModal";
import {
  subscribeToTasks,
  subscribeToSprints,
  subscribeToMilestones,
  subscribeToMembers,
  subscribeToCustomRoles,
  createTask,
  createSubtask,
  updateTask,
  deleteTask,
  createSprint,
  updateSprint,
  deleteSprint,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  convertElementToTask,
  setMemberRole,
  addMember,
  removeMember,
  syncRepoCollaborators,
  addCustomRole,
  deleteCustomRole,
  getTask,
} from "../features/tasks/store";
import type {
  TaskRecord,
  SprintRecord,
  MilestoneRecord,
  MemberRecord,
  CustomRoleRecord,
} from "../features/tasks/types";
import { SoundboardModal } from "../features/soundboard/SoundboardModal";
import type { SoundboardClip } from "../features/soundboard/types";
import {
  subscribeToSoundboardClips,
  subscribeToSoundboardTriggers,
  getSoundboardClip,
  addSoundboardClip,
  updateSoundboardClip,
  deleteSoundboardClip,
  triggerSoundboardClip,
  playSoundboardClip,
} from "../features/soundboard/store";
import "../features/soundboard/soundboard.css";
import {
  SemanticActivityRecorder,
  recordActivity,
  subscribeToActivityLog,
  type ActivityLogEntry,
} from "../history/activity";

// Muted sticky colours that fit the VGUI palette (see vguiColors.ts).
const STICKY_NAMES = ["Gold", "Sage", "Slate", "Clay", "Lilac", "Bone"];
const STICKY_COLORS = VGUI_STICKY_PICKS.map((value, i) => ({ name: STICKY_NAMES[i], value }));

/** How often an active board leaves a restore point behind. */
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;
// Board background for boards that have never stored one. Synced per board once set.
const DEFAULT_VIEW_BACKGROUND = "#283125";

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

  const imageSyncRef = useRef<ImageAssetSync | null>(null);
  const hydratedRef = useRef(false);
  // Last canvas background known to both the scene and the doc; onChange writes only real changes.
  const viewBackgroundRef = useRef(DEFAULT_VIEW_BACKGROUND);
  const [currentViewBackground, setCurrentViewBackground] = useState<string>(DEFAULT_VIEW_BACKGROUND);
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
    clientId: 0,
    peerClientIds: [],
  });
  const [liveRoomName, setLiveRoomName] = useState<string>("");
  const [collaborators, setCollaborators] = useState<Map<SocketId, Collaborator>>(new Map());
  const [remoteEdits, setRemoteEdits] = useState(0);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [rateLimit, setRateLimit] = useState<RateLimit>(null);
  // Only repo admins see the "Board password…" menu item.
  const [isRepoAdmin, setIsRepoAdmin] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordProgress, setPasswordProgress] = useState<string | undefined>(undefined);

  const [digest, setDigest] = useState<Digest | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [stickyDefaults, setStickyDefaults] = useState<StickyDefaults>(loadStickyDefaults);
  const stickyDefaultsRef = useRef<StickyDefaults>(stickyDefaults);
  stickyDefaultsRef.current = stickyDefaults;

  // Desktop: the swatch strip beside Excalidraw's shape toolbar, shown unless toggled off.
  const [stickyPanelOpen, setStickyPanelOpen] = useState(false);
  const [issuesDrawerOpen, setIssuesDrawerOpen] = useState(false);
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
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!toolsMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!toolsMenuRef.current?.contains(e.target as Node)) setToolsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [toolsMenuOpen]);
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
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [canvasBgConfig, setCanvasBgConfig] = useState<CanvasBackgroundImage | undefined>(undefined);
  const [canvasBgUrl, setCanvasBgUrl] = useState<string | null>(null);
  const canvasBgConfigRef = useRef<CanvasBackgroundImage | undefined>(undefined);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [boardTheme, setBoardTheme] = useState<BoardThemeConfig>(DEFAULT_BOARD_THEME);
  const [selectedRoundableElements, setSelectedRoundableElements] = useState<readonly ExcalidrawElement[]>([]);
  const lastRoundableSigRef = useRef<string>("");
  const [currentActiveTool, setCurrentActiveTool] = useState<string>("selection");
  const currentActiveToolRef = useRef<string>("selection");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showTags, setShowTags] = useState<boolean>(() => {
    try {
      return localStorage.getItem("caulk.show_tags") !== "0";
    } catch {
      return true;
    }
  });
  const toggleShowTags = useCallback(() => {
    setShowTags((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("caulk.show_tags", next ? "1" : "0");
      } catch {}
      setToastMessage(next ? "🏷️ Tags visible on stickies" : "🏷️ Tags hidden (hover/select to view)");
      return next;
    });
  }, []);
  const [clusterModalOpen, setClusterModalOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("caulk.minimap_open") !== "0";
    } catch {
      return true;
    }
  });
  const toggleMinimap = useCallback(() => {
    setMinimapOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("caulk.minimap_open", next ? "1" : "0");
      } catch {}
      setToastMessage(next ? "🛰️ Radar Minimap enabled [M]" : "🛰️ Radar Minimap hidden [M]");
      return next;
    });
  }, []);
  const [frameNavigatorOpen, setFrameNavigatorOpen] = useState(false);
  const [playerListOpen, setPlayerListOpen] = useState(false);
  const playerListOpenRef = useRef(false);
  playerListOpenRef.current = playerListOpen;
  const tabPressTimeRef = useRef<number>(0);
  const [waypoints, setWaypoints] = useState<Record<string, Waypoint>>({});
  const [allFrames, setAllFrames] = useState<ExcalidrawElement[]>([]);
  const lastFramesSigRef = useRef<string>("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [sprints, setSprints] = useState<SprintRecord[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([]);
  const [repoCollaborators, setRepoCollaborators] = useState<RepoCollaborator[]>([]);
  const [taskHubOpen, setTaskHubOpen] = useState(false);
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<TaskRecord | null>(null);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [soundboardClips, setSoundboardClips] = useState<SoundboardClip[]>([]);
  const [soundboardBroadcastToast, setSoundboardBroadcastToast] = useState<{
    id: string;
    user: string;
    name: string;
    icon: string;
  } | null>(null);
  const soundboardToastTimerRef = useRef<number | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const activityRecorderRef = useRef<SemanticActivityRecorder | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => soundEngine.getConfig().enabled);

  const toggleMuteSound = useCallback(() => {
    const next = !soundEngine.getConfig().enabled;
    soundEngine.setEnabled(next);
    setSoundEnabled(next);
    if (next) soundEngine.play("click");
    setToastMessage(next ? "🔊 Retro sound effects enabled" : "🔇 Sound effects muted");
  }, []);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [creatingIssue, setCreatingIssue] = useState(false);

  const currentIdentityRef = useRef(currentIdentity);
  currentIdentityRef.current = currentIdentity;

  const key = boardKey(session);
  const label = useMemo(() => boardLabel(session), [session]);

  // Task 8.1: Comments & threads state (persists seen timestamps per board in localStorage).
  const [commentThreads, setCommentThreads] = useState<CommentThread[]>([]);
  const [placingComment, setPlacingComment] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [seenCommentsMap, setSeenCommentsMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(`caulk:comments-seen:${key}`);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`caulk:comments-seen:${key}`);
      setSeenCommentsMap(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      setSeenCommentsMap({});
    }
  }, [key]);
  const markCommentSeen = useCallback(
    (threadId: string, at: number) => {
      setSeenCommentsMap((prev) => {
        if ((prev[threadId] ?? 0) >= at) return prev;
        const next = { ...prev, [threadId]: at };
        try {
          localStorage.setItem(`caulk:comments-seen:${key}`, JSON.stringify(next));
        } catch {
          // ignore storage quota
        }
        return next;
      });
    },
    [key],
  );
  const unreadCommentsCount = useMemo(
    () =>
      commentThreads.filter(
        (t) => !t.resolved && isThreadUnread(t, seenCommentsMap[t.id] ?? 0, currentIdentity.name),
      ).length,
    [commentThreads, seenCommentsMap, currentIdentity.name],
  );
  const commentPeerNames = useMemo(() => {
    const names = new Set<string>([currentIdentity.name]);
    for (const p of liveStatus.peers) {
      if (p.name) names.add(p.name);
    }
    for (const t of commentThreads) {
      for (const m of t.messages) {
        if (m.author) names.add(m.author);
      }
    }
    return Array.from(names);
  }, [currentIdentity.name, liveStatus.peers, commentThreads]);

  // Task 8.2: Reactions & dot voting state
  const [elementReactions, setElementReactions] = useState<Map<string, ElementReactionBucket[]>>(
    () => new Map(),
  );
  const [voting, setVoting] = useState<VotingSnapshot>({ session: null, ballots: [] });
  const [startVotingOpen, setStartVotingOpen] = useState(false);
  const [votingResultsOpen, setVotingResultsOpen] = useState(false);
  const prevVotingStatusRef = useRef<"active" | "ended" | null>(null);
  useEffect(() => {
    const status = voting.session?.status ?? null;
    if (prevVotingStatusRef.current === "active" && status === "ended") {
      setVotingResultsOpen(true);
    }
    prevVotingStatusRef.current = status;
    liveSessionRef.current?.updateVotingSession(
      status === "active" && voting.session ? voting.session.id : null,
    );
  }, [voting.session, liveStatus.connected]);
  const activeVoters = useMemo(() => {
    const sid = voting.session?.id;
    if (!sid || voting.session?.status !== "active") return [];
    const names = new Set<string>([currentIdentity.name]);
    for (const p of liveStatus.peers) {
      if (p.votingSessionId === sid && p.name) names.add(p.name);
    }
    return Array.from(names);
  }, [voting.session, liveStatus.peers, currentIdentity.name]);

  // Task 8.3: Presenter, Summon ("Bring everyone to me"), and Attention Pings state
  const [presenting, setPresenting] = useState(false);
  const [pingMode, setPingMode] = useState(false);
  const [broughtByBanner, setBroughtByBanner] = useState<string | null>(null);
  useEffect(() => {
    liveSessionRef.current?.updatePresenting(presenting);
    if (presenting) {
      setFollowingPeerId(null);
      setBroughtByBanner(null);
    }
  }, [presenting, liveStatus.connected]);
  const bringEveryoneToMe = useCallback(() => {
    soundEngine.play("ping");
    const api = apiRef.current;
    const ls = liveSessionRef.current;
    if (!api) return;
    const s = api.getAppState();
    const vp = { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value };
    if (ls) {
      ls.updateViewport(vp);
      ls.triggerSummon({
        id: `sum-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        at: Date.now(),
        viewport: vp,
      });
    }
    setToastMessage(
      liveStatus.peersCount > 0
        ? "📣 Brought peers to your view."
        : "📣 No other peers connected right now.",
    );
  }, [liveStatus.peersCount]);
  const handleFollowPeer = useCallback((clientId: number | null, broughtBy?: string | null) => {
    setFollowingPeerId(clientId);
    setBroughtByBanner(clientId && broughtBy ? broughtBy : null);
  }, []);

  // Task 8.5: Record board in recent list & cache encrypted preview SVG on save.
  useEffect(() => {
    recordRecentBoard(session);
  }, [session.owner, session.repo, session.branch, session.path]);
  const lastThumbSaveRef = useRef(0);
  const maybeSaveThumbRef = useRef<() => void>(() => {});
  maybeSaveThumbRef.current = () => {
    const api = apiRef.current;
    if (!api || Date.now() - lastThumbSaveRef.current < 60_000) return;
    const els = api.getSceneElements().filter((e) => !e.isDeleted);
    if (els.length === 0) return;
    lastThumbSaveRef.current = Date.now();
    void exportToSvg({
      elements: els.slice(0, 120),
      appState: {
        exportWithDarkMode: false,
        viewBackgroundColor: viewBackgroundRef.current,
      },
      files: null,
      exportPadding: 14,
    })
      .then((svg: SVGSVGElement) => {
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        return saveBoardThumbnail(
          {
            token: getFreshToken,
            owner: session.owner,
            repo: session.repo,
            branch: session.branch,
            boardPath: session.path,
            passphrase: session.passphrase,
          },
          svg.outerHTML,
        );
      })
      .catch(() => {
        // Best-effort cached thumbnail; never block or error main board sync.
      });
  };

  // Task 8.4: Templates gallery & repo templates
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const templateRepoConfig = useMemo(
    () => ({
      token: getFreshToken,
      owner: session.owner,
      repo: session.repo,
      branch: session.branch,
      passphrase: session.passphrase,
    }),
    [session.owner, session.repo, session.branch, session.passphrase],
  );
  const insertTemplateFromGallery = useCallback(
    (tpl: BoardTemplate | null) => {
      if (!tpl) {
        setTemplateGalleryOpen(false);
        return;
      }
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
      const rawInserted = instantiateTemplate(tpl, {
        centerX: center.x,
        centerY: center.y,
        wrapInFrame: true,
      });
      const restoredInserted = restoreElements(
        rawInserted as unknown as ExcalidrawElement[],
        null,
      );
      const selectedMap: Record<string, true> = {};
      for (const el of restoredInserted) selectedMap[el.id] = true;
      api.updateScene({
        elements: [
          ...api.getSceneElements(),
          ...restoredInserted,
        ] as unknown as OrderedExcalidrawElement[],
        appState: { selectedElementIds: selectedMap },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      setTemplateGalleryOpen(false);
      setToastMessage(`📐 Inserted template "${tpl.name}".`);
    },
    [],
  );
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
    activityRecorderRef.current?.seedInitialElements(next as unknown as ExcalidrawElement[]);
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
      const storedBackground = bridge.getViewBackground();
      if (storedBackground) {
        viewBackgroundRef.current = storedBackground;
        setCurrentViewBackground(storedBackground);
        api.updateScene({
          appState: { viewBackgroundColor: storedBackground },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      const storedBgImage = bridge.getCanvasBackgroundImage();
      if (storedBgImage) {
        canvasBgConfigRef.current = storedBgImage;
        setCanvasBgConfig(storedBgImage);
        if (storedBgImage.ref) {
          assetObjectUrl(assetStore, storedBgImage.ref)
            .then((url) => setCanvasBgUrl(url))
            .catch((err) => console.warn("[caulk] failed to load canvas background image", err));
          api.updateScene({
            appState: { viewBackgroundColor: "transparent" },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }
      const storedTheme = bridge.getBoardTheme();
      if (storedTheme) {
        setBoardTheme(storedTheme);
      }
      // Starts after the first local files reach Excalidraw: resolves image refs, migrates inline ones.
      imageSyncRef.current?.start();
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

  // Once on mount: whether we can administer the repo (and so change the board password).
  useEffect(() => {
    let cancelled = false;
    new GitHubAdapter({
      token: getFreshToken,
      owner: session.owner,
      repo: session.repo,
      branch: session.branch,
      path: session.path,
    })
      .repoPermissions()
      .then(
        (perms) => {
          if (!cancelled) setIsRepoAdmin(perms.admin);
        },
        () => {
          if (!cancelled) setIsRepoAdmin(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [session.owner, session.repo, session.branch, session.path]);

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

    const deliverFiles = (files: BinaryFileData[]) => {
      const api = apiRef.current;
      if (!api || files.length === 0) return;
      api.addFiles(files);
      const addedIds = new Set(files.map((f) => f.id));
      const sceneEls = api.getSceneElements();
      if (
        sceneEls.some(
          (el) => el.type === "image" && el.fileId && addedIds.has(el.fileId) && el.status !== "saved",
        )
      ) {
        const refreshed = sceneEls.map((el) =>
          el.type === "image" && el.fileId && addedIds.has(el.fileId) && el.status !== "saved"
            ? { ...el, status: "saved" as const }
            : el,
        );
        api.updateScene({
          elements: refreshed as unknown as OrderedExcalidrawElement[],
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    };

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
        deliverFiles(Object.values(remoteFiles));
        if (hydratedRef.current) {
          imageSyncRef.current?.resolveRefs();
          imageSyncRef.current?.migrateInline();
        }
      },
    );
    imageSyncRef.current = new ImageAssetSync({
      bridge,
      store: assetStore,
      boardKey: key,
      addFiles: deliverFiles,
      onError: setToastMessage,
      onPendingChange: setPendingUploads,
    });

    const unobserveAllowed = bridge.observeAllowedNicknames(() => {});
    const unobserveRequests = bridge.observeAccessRequests(() => {});
    const unobserveTimer = bridge.observeTimer((t) => {
      setTimer(t);
    });
    const unobserveBackground = bridge.observeViewBackground((color) => {
      if (!color || !apiRef.current) return;
      viewBackgroundRef.current = color;
      setCurrentViewBackground(color);
      if (!canvasBgConfigRef.current?.ref) {
        apiRef.current.updateScene({
          appState: { viewBackgroundColor: color },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    });
    const unobserveBgImage = bridge.observeCanvasBackgroundImage((remoteBg) => {
      canvasBgConfigRef.current = remoteBg;
      setCanvasBgConfig(remoteBg);
      if (remoteBg?.ref) {
        assetObjectUrl(assetStore, remoteBg.ref)
          .then((url) => setCanvasBgUrl(url))
          .catch((err) => console.warn("[caulk] failed to load canvas background image", err));
        apiRef.current?.updateScene({
          appState: { viewBackgroundColor: "transparent" },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } else {
        setCanvasBgUrl(null);
        apiRef.current?.updateScene({
          appState: { viewBackgroundColor: viewBackgroundRef.current },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    });
    const unobserveBoardTheme = bridge.observeBoardTheme((remoteTheme) => {
      setBoardTheme(remoteTheme ?? DEFAULT_BOARD_THEME);
    });
    const unobserveWaypoints = bridge.observeWaypoints((remoteWaypoints) => {
      setWaypoints(remoteWaypoints);
    });
    setWaypoints(bridge.getWaypoints());
    const unobserveComments = observeComments(doc, setCommentThreads);
    const unobserveReactions = observeElementReactions(doc, setElementReactions);
    const unobserveVoting = observeVoting(doc, setVoting);
    const unsubscribeTasks = subscribeToTasks(doc, setTasks);
    const unsubscribeSprints = subscribeToSprints(doc, setSprints);
    const unsubscribeMilestones = subscribeToMilestones(doc, setMilestones);
    const unsubscribeMembers = subscribeToMembers(doc, setMembers);
    const unsubscribeCustomRoles = subscribeToCustomRoles(doc, setCustomRoles);
    const unsubscribeSoundboard = subscribeToSoundboardClips(doc, setSoundboardClips);
    const unsubscribeActivity = subscribeToActivityLog(doc, setActivityEntries);
    const activityRecorder = new SemanticActivityRecorder(doc, currentIdentityRef.current.name);
    activityRecorderRef.current = activityRecorder;
    const unsubscribeSoundboardTriggers = subscribeToSoundboardTriggers(doc, (trigger) => {
      if (trigger.user !== currentIdentityRef.current.name) {
        if (soundEngine.getConfig().enabled) {
          const clip = getSoundboardClip(doc, trigger.clipId);
          if (clip) {
            void playSoundboardClip(clip, 0.85);
          }
        }
        if (soundboardToastTimerRef.current) {
          window.clearTimeout(soundboardToastTimerRef.current);
        }
        setSoundboardBroadcastToast({
          id: trigger.id,
          user: trigger.user,
          name: trigger.name,
          icon: trigger.icon,
        });
        soundboardToastTimerRef.current = window.setTimeout(() => {
          setSoundboardBroadcastToast(null);
        }, 3500);
      }
    });

    if (repoCollaborators.length > 0) {
      syncRepoCollaborators(doc, repoCollaborators);
    }

    let effectDisposed = false;

    const engine = new SyncEngine({
      doc,
      store,
      debounceMs: 10_000,
      maxWaitMs: 60_000,
      pollMs: 10_000,
      onStatus: setStatus,
      onRemoteApplied: () => setRateLimit(adapter.rateLimit()),
      onCommitted: () => {
        maybeSnapshotRef.current();
        maybeSaveThumbRef.current();
      },
    });

    bridgeRef.current = bridge;
    engineRef.current = engine;

    let activeLiveSession: LiveSession | null = null;
    void getLiveRoomName(session).then((roomName) => {
      if (effectDisposed || !docRef.current) return;
      setLiveRoomName(roomName);
      activeLiveSession = new LiveSession(roomName, {
        doc,
        target: session,
        passphrase: session.passphrase,
        identity: currentIdentityRef.current,
        isAllowed: () => true,
        onStatusChange: (nextStatus) => {
          setLiveStatus(nextStatus);
          engine.setPollMs(nextStatus.connected ? 30_000 : 10_000);
          engine.setSaver(
            isElectedSaver(nextStatus.connected, nextStatus.clientId, nextStatus.peerClientIds),
          );
        },
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
      engine.setLiveOrigin(activeLiveSession);
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
      if (document.visibilityState === "hidden") void engine.saveOnHide();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      effectDisposed = true;
      document.removeEventListener("visibilitychange", onHidden);
      clearInterval(rateTimer);
      unobserveAllowed();
      unobserveRequests();
      unobserveTimer();
      unobserveBackground();
      unobserveBgImage();
      unobserveBoardTheme();
      unobserveWaypoints();
      unobserveComments();
      unobserveReactions();
      unobserveVoting();
      unsubscribeTasks();
      unsubscribeSprints();
      unsubscribeMilestones();
      unsubscribeMembers();
      unsubscribeCustomRoles();
      unsubscribeSoundboard();
      unsubscribeSoundboardTriggers();
      unsubscribeActivity();
      activityRecorderRef.current?.dispose();
      activityRecorderRef.current = null;
      setCommentThreads([]);
      setElementReactions(new Map());
      setVoting({ session: null, ballots: [] });
      activeLiveSession?.destroy();
      liveSessionRef.current = null;
      engine.stop();
      imageSyncRef.current?.dispose();
      imageSyncRef.current = null;
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
    assetStore,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (session.owner && session.repo) {
      const tokenProvider = session.token ? () => Promise.resolve(session.token) : getFreshToken;
      fetchRepoCollaborators(tokenProvider, session.owner, session.repo)
        .then((collabs) => {
          if (!cancelled && collabs.length > 0) {
            setRepoCollaborators(collabs);
            if (docRef.current) {
              syncRepoCollaborators(docRef.current, collabs);
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [session.owner, session.repo, session.token, getFreshToken]);

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

  // Board background from the background picker. updateScene also fires Excalidraw's onChange,
  // which saves a real change. This saves it directly too; the ref check means only one write happens.
  const applyBoardBackground = useCallback((color: string) => {
    viewBackgroundRef.current = color;
    setCurrentViewBackground(color);
    bridgeRef.current?.setViewBackground(color);
    if (!canvasBgConfigRef.current?.ref) {
      apiRef.current?.updateScene({ appState: { viewBackgroundColor: color } });
    }
  }, []);

  const applyCanvasBackgroundImage = useCallback(
    (next: CanvasBackgroundImage | undefined) => {
      canvasBgConfigRef.current = next;
      setCanvasBgConfig(next);
      bridgeRef.current?.setCanvasBackgroundImage(next);
      if (next?.ref) {
        assetObjectUrl(assetStore, next.ref)
          .then((url) => setCanvasBgUrl(url))
          .catch((err) => console.warn("[caulk] failed to load canvas background image", err));
        apiRef.current?.updateScene({
          appState: { viewBackgroundColor: "transparent" },
        });
      } else {
        setCanvasBgUrl(null);
        apiRef.current?.updateScene({
          appState: { viewBackgroundColor: viewBackgroundRef.current },
        });
      }
    },
    [assetStore],
  );

  const applyBoardTheme = useCallback((next: BoardThemeConfig) => {
    setBoardTheme(next);
    bridgeRef.current?.setBoardTheme(next);
  }, []);

  const handleSetElementRadius = useCallback((radius: number) => {
    const api = apiRef.current;
    if (!api) return;
    const currentElements = api.getSceneElements();
    const appState = api.getAppState();
    const selectedIds = appState?.selectedElementIds ?? {};
    const newRoundness = radius > 0 ? { type: 3 as const, value: radius } : null;

    let changed = false;
    let modifiedSticky = false;
    const updated = currentElements.map((el) => {
      if (selectedIds[el.id] && !el.isDeleted && (el.type === "rectangle" || el.type === "diamond" || el.type === "frame")) {
        if (JSON.stringify(el.roundness) !== JSON.stringify(newRoundness)) {
          changed = true;
          if ((el.customData as Record<string, unknown> | undefined)?.isSticky) {
            modifiedSticky = true;
          }
          return {
            ...el,
            roundness: newRoundness,
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 2e9),
          };
        }
      }
      return el;
    });
    if (changed) {
      if (modifiedSticky) {
        setStickyDefaults(() => {
          const next = saveStickyDefaults({ radius });
          stickyDefaultsRef.current = next;
          return next;
        });
      }
      soundEngine.play("click");
      const restored = restoreElements(updated, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
    }
  }, []);

  const handleUpdateStickyDefault = useCallback((partial: Partial<StickyDefaults>) => {
    soundEngine.play("click");
    setStickyDefaults(() => {
      const next = saveStickyDefaults(partial);
      stickyDefaultsRef.current = next;
      return next;
    });

    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const selectedIds = appState?.selectedElementIds ?? {};
    if (!Object.values(selectedIds).some(Boolean)) return;

    const currentElements = api.getSceneElements();
    let changed = false;
    const updated = currentElements.map((el) => {
      if (
        selectedIds[el.id] &&
        !el.isDeleted &&
        (el.customData as Record<string, unknown> | undefined)?.isSticky
      ) {
        let elRoundness = el.roundness;
        let elRoughness = el.roughness;
        if (partial.radius !== undefined) {
          elRoundness = partial.radius > 0 ? { type: 3 as const, value: partial.radius } : null;
        }
        if (partial.roughness !== undefined) {
          elRoughness = partial.roughness;
        }
        if (
          JSON.stringify(elRoundness) !== JSON.stringify(el.roundness) ||
          elRoughness !== el.roughness
        ) {
          changed = true;
          return {
            ...el,
            roundness: elRoundness,
            roughness: elRoughness,
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 2e9),
          };
        }
      }
      return el;
    });

    if (changed) {
      const restored = restoreElements(updated, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
    }
  }, []);

  const handleAddTag = useCallback((elementIds: string[], tag: string) => {
    const api = apiRef.current;
    if (!api) return;
    const current = api.getSceneElements();
    const idSet = new Set(elementIds);
    let changed = false;
    const next = current.map((el) => {
      if (idSet.has(el.id)) {
        changed = true;
        const updatedEl = addTagToElement(el, tag);
        if ((el.customData as any)?.taskId && docRef.current) {
          const tId = (el.customData as any).taskId;
          const currentTask = getTask(docRef.current, tId);
          if (currentTask && !currentTask.labels.includes(tag)) {
            updateTask(
              docRef.current,
              tId,
              { labels: [...currentTask.labels, tag] },
              { id: currentIdentity.name, name: currentIdentity.name },
            );
          }
        }
        return updatedEl;
      }
      return el;
    });
    if (changed) {
      soundEngine.play("vote");
      const restored = restoreElements(next, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
    }
  }, [currentIdentity.name]);

  const handleRemoveTag = useCallback((elementIds: string[], tag: string) => {
    const api = apiRef.current;
    if (!api) return;
    const current = api.getSceneElements();
    const idSet = new Set(elementIds);
    let changed = false;
    const next = current.map((el) => {
      if (idSet.has(el.id)) {
        changed = true;
        const updatedEl = removeTagFromElement(el, tag);
        if ((el.customData as any)?.taskId && docRef.current) {
          const tId = (el.customData as any).taskId;
          const currentTask = getTask(docRef.current, tId);
          if (currentTask && currentTask.labels.includes(tag)) {
            updateTask(
              docRef.current,
              tId,
              { labels: currentTask.labels.filter((l) => l !== tag) },
              { id: currentIdentity.name, name: currentIdentity.name },
            );
          }
        }
        return updatedEl;
      }
      return el;
    });
    if (changed) {
      soundEngine.play("delete");
      const restored = restoreElements(next, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
    }
  }, [currentIdentity.name]);

  const handleApplyCluster = useCallback(
    (updatedElements: ExcalidrawElement[], newFrames: ExcalidrawElement[] = []) => {
      const api = apiRef.current;
      if (!api) return;
      soundEngine.play("cluster");
      const current = api.getSceneElements();
      const updatedMap = new Map<string, ExcalidrawElement>();
      for (const el of updatedElements) {
        updatedMap.set(el.id, el);
      }
      const merged = current.map((el) => updatedMap.get(el.id) ?? el);
      // Child elements must come before their parent frames in scene ordering
      const allNext = [...merged, ...newFrames];
      const restored = restoreElements(allNext, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
    },
    [],
  );

  useEffect(() => {
    applyBoardThemeToDom(boardTheme, currentViewBackground);
    soundEngine.setActiveThemePreset(boardTheme.preset);
  }, [boardTheme, currentViewBackground]);

  useEffect(() => {
    let lastHoveredElement: Element | null = null;

    const onPointerOver = (e: PointerEvent) => {
      try {
        const rawTarget = e.target;
        if (!rawTarget || !(rawTarget instanceof Element)) return;
        const matched = rawTarget.closest(
          "button, .vgui-btn, .topbar-btn, .sidebar-trigger, .theme-preset-card, .caulk-radius-chip, .element-chip, .caulk-menu-item, .chip-btn, .soundboard-card, .task-card-pill, .kanban-card"
        );
        if (!matched) {
          lastHoveredElement = null;
          return;
        }
        if (matched !== lastHoveredElement) {
          lastHoveredElement = matched;
          soundEngine.play("hover");
        }
      } catch {
        /* Ignore detached DOM or cross-origin event errors */
      }
    };

    const onPointerOut = (e: PointerEvent) => {
      try {
        const related = e.relatedTarget;
        if (lastHoveredElement) {
          if (!related || !(related instanceof Element) || !lastHoveredElement.contains(related)) {
            lastHoveredElement = null;
          }
        }
      } catch {
        /* Ignore */
      }
    };

    window.addEventListener("pointerover", onPointerOver, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    return () => {
      window.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("pointerout", onPointerOut);
    };
  }, []);

  useEffect(() => {
    return () => {
      resetBoardThemeOnDom();
    };
  }, []);

  const onChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files?: BinaryFiles,
    ) => {
      if (!hydratedRef.current || !isAllowed) return;

      // Background changes touch no element, so this runs before the scene fingerprint early return.
      const background = appState.viewBackgroundColor;
      if (
        background &&
        background !== "transparent" &&
        background !== viewBackgroundRef.current &&
        !canvasBgConfigRef.current?.ref
      ) {
        viewBackgroundRef.current = background;
        setCurrentViewBackground(background);
        bridgeRef.current?.setViewBackground(background);
      }

      // Update canvas frames list for FrameNavigator and presentation mode
      const currentFrames = (elements as readonly ExcalidrawElement[])
        .filter(
          (el) =>
            (el.type === "frame" || (el.customData as Record<string, unknown> | undefined)?.isFrame) &&
            !el.isDeleted,
        )
        .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
      const framesSig = currentFrames
        .map((f) => `${f.id}:${(f as any).name || ""}:${f.version}:${f.x}:${f.y}`)
        .join(",");
      if (framesSig !== lastFramesSigRef.current) {
        lastFramesSigRef.current = framesSig;
        setAllFrames(currentFrames);
        setPresentationFrames(currentFrames);
      }

      // Update selected roundable elements for per-object radius changer whenever selection changes
      const selectedIds = appState.selectedElementIds ?? {};
      const hasSelectedIds = Object.values(selectedIds).some(Boolean);
      const isSelectionTool = appState.activeTool?.type === "selection";
      const isInteracting = Boolean(
        appState.editingTextElement ||
        appState.resizingElement ||
        appState.selectionElement
      );

      if (appState.activeTool?.type && appState.activeTool.type !== currentActiveToolRef.current) {
        currentActiveToolRef.current = appState.activeTool.type;
        setCurrentActiveTool(appState.activeTool.type);
      }

      if (!hasSelectedIds || !isSelectionTool || isInteracting) {
        if (lastRoundableSigRef.current !== "") {
          lastRoundableSigRef.current = "";
          setSelectedRoundableElements([]);
        }
      } else {
        const roundable = (elements as readonly ExcalidrawElement[]).filter(
          (el) =>
            selectedIds[el.id] &&
            !el.isDeleted &&
            (el.type === "rectangle" || el.type === "diamond" || el.type === "frame")
        );
        const roundableSig = roundable
          .map((el) => `${el.id}:${el.version}:${el.roundness?.type}:${el.roundness?.value}`)
          .join(",");
        if (roundableSig !== lastRoundableSigRef.current) {
          lastRoundableSigRef.current = roundableSig;
          setSelectedRoundableElements(roundable);
        }

        // Auto-detect if user changed sloppiness (roughness) on a selected sticky note
        const selectedSticky = roundable.find(
          (el) => (el.customData as Record<string, unknown> | undefined)?.isSticky
        );
        if (selectedSticky && typeof selectedSticky.roughness === "number") {
          if (selectedSticky.roughness !== stickyDefaultsRef.current.roughness) {
            const nextRoughness = selectedSticky.roughness;
            setStickyDefaults(() => {
              const next = saveStickyDefaults({ roughness: nextRoughness });
              stickyDefaultsRef.current = next;
              return next;
            });
          }
        }
      }

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

      if (
        hasFontCorrection &&
        !pointerDownRef.current &&
        !appState.newElement &&
        apiRef.current
      ) {
        const restored = restoreElements(normalizedElements, null);
        apiRef.current.updateScene({
          elements: restored as unknown as OrderedExcalidrawElement[],
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }

      bridgeRef.current?.applyLocal(normalizedElements as readonly ExcalidrawElement[], files);
      appliedIdsRef.current = new Set(normalizedElements.map((el) => el.id));
      activityRecorderRef.current?.onLocalElementsChange(normalizedElements as readonly ExcalidrawElement[]);

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

    const currentDefaults = stickyDefaultsRef.current;
    const stickyRoundness =
      currentDefaults.radius > 0
        ? { type: 3 as const, value: currentDefaults.radius }
        : null;

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
          roughness: currentDefaults.roughness,
          roundness: stickyRoundness,
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
    soundEngine.play("create");
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

  // The sticky button floats over the page beside the toolbar (never inside it), so it
  // can't change the toolbar's size. Track the toolbar's box to stay aligned with it.
  const [stickyPos, setStickyPos] = useState<{ left: number; top: number; height: number } | null>(null);
  useEffect(() => {
    if (!stickyToolbarHost) {
      setStickyPos(null);
      return;
    }
    const toolbar = stickyToolbarHost.querySelector<HTMLElement>(".App-toolbar") ?? stickyToolbarHost;
    const measure = () => {
      const r = toolbar.getBoundingClientRect();
      // Sit after everything Excalidraw puts beside the toolbar (e.g. the laser pointer button).
      let right = r.right;
      for (const child of Array.from(stickyToolbarHost.querySelectorAll<HTMLElement>(":scope > *, :scope > * > *"))) {
        const cr = child.getBoundingClientRect();
        if (cr.width > 0 && cr.top < r.bottom && cr.bottom > r.top) right = Math.max(right, cr.right);
      }
      const left = right + 8;
      setStickyPos((prev) =>
        prev && prev.left === left && prev.top === r.top && prev.height === r.height
          ? prev
          : { left, top: r.top, height: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(toolbar);
    const mo = new MutationObserver(measure);
    mo.observe(stickyToolbarHost, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stickyToolbarHost]);

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

  // F activates the Frame tool (drag-to-draw a frame) like Miro / Figma
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.repeat) return;
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
      if (s.activeTool?.type === "frame") {
        api.setActiveTool({ type: "selection" });
      } else {
        api.setActiveTool({ type: "frame" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // C toggles pin placement for Comments (when not editing text).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPlacingComment(false);
        setPingMode(false);
        return;
      }
      if (e.key.toLowerCase() !== "c" || e.repeat) return;
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
      if (api.getAppState().editingTextElement) return;
      e.preventDefault();
      setShowComments(true);
      setPlacingComment((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        strokeColor: "transparent",
        backgroundColor: "#3E4637",
        fillStyle: "solid",
        strokeWidth: 0,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: null,
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

  const handleUpdateCardCustomData = useCallback(
    (elementId: string, customData: Record<string, unknown>) => {
      const api = apiRef.current;
      if (!api) return;
      const currentElements = api.getSceneElements();
      let changed = false;
      const updated = currentElements.map((el) => {
        if (el.id === elementId && !el.isDeleted) {
          changed = true;
          return {
            ...el,
            customData: {
              ...(el.customData as Record<string, unknown> | undefined),
              ...customData,
            },
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 2e9),
          };
        }
        return el;
      });
      if (changed) {
        const restored = restoreElements(updated, null);
        api.updateScene({
          elements: restored as unknown as OrderedExcalidrawElement[],
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
      }
    },
    [],
  );

  const addCodeCard = useCallback(
    (initialCode?: string, language = "typescript", title = "snippet.ts") => {
      const api = apiRef.current;
      if (!api) return;
      const appState = api.getAppState();
      const zoom = appState.zoom.value;
      const x = Math.round(appState.width / (2 * zoom) - appState.scrollX - 220);
      const y = Math.round(appState.height / (2 * zoom) - appState.scrollY - 140);

      const codeElement: ExcalidrawElement = sanitizeElement({
        id: `code-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: "embeddable",
        x,
        y,
        width: 440,
        height: 280,
        angle: 0,
        strokeColor: "#111410",
        backgroundColor: "#181c16",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: { type: 3, value: 4 },
        seed: Math.floor(Math.random() * 2e9),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: "https://caulk.code/snippet",
        locked: false,
        customData: {
          isCodeCard: true,
          code:
            initialCode ||
            `// TypeScript Snippet\nexport interface UserSession {\n  id: string;\n  name: string;\n  role: "admin" | "member";\n}\n\nexport function verify(session: UserSession): boolean {\n  return Boolean(session.id && session.role);\n}`,
          language,
          title,
        },
      });

      const next = [...api.getSceneElements(), codeElement];
      api.updateScene({
        elements: next as unknown as OrderedExcalidrawElement[],
        appState: { selectedElementIds: { [codeElement.id]: true } },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(next as readonly ExcalidrawElement[]);
      soundEngine.play("create");
      setToastMessage("💻 Added Code Snippet Card to canvas");
    },
    [],
  );

  const addChecklistCard = useCallback(
    (title = "Sprint Checklist") => {
      const api = apiRef.current;
      if (!api) return;
      const appState = api.getAppState();
      const zoom = appState.zoom.value;
      const x = Math.round(appState.width / (2 * zoom) - appState.scrollX - 160);
      const y = Math.round(appState.height / (2 * zoom) - appState.scrollY - 120);

      const checklistElement: ExcalidrawElement = sanitizeElement({
        id: `checklist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: "embeddable",
        x,
        y,
        width: 320,
        height: 240,
        angle: 0,
        strokeColor: "#111410",
        backgroundColor: "#3e4637",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: { type: 3, value: 4 },
        seed: Math.floor(Math.random() * 2e9),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: "https://caulk.checklist",
        locked: false,
        customData: {
          isChecklistCard: true,
          title,
          items: [
            { id: `c-${Date.now()}-1`, text: "Review pull requests", done: true },
            { id: `c-${Date.now()}-2`, text: "Verify automated tests pass", done: false },
            { id: `c-${Date.now()}-3`, text: "Deploy staging release", done: false },
          ],
        },
      });

      const next = [...api.getSceneElements(), checklistElement];
      api.updateScene({
        elements: next as unknown as OrderedExcalidrawElement[],
        appState: { selectedElementIds: { [checklistElement.id]: true } },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(next as readonly ExcalidrawElement[]);
      soundEngine.play("create");
      setToastMessage("📋 Added Interactive Checklist to canvas");
    },
    [],
  );

  const addBookmarkCard = useCallback(
    (url: string, title?: string, description?: string) => {
      const api = apiRef.current;
      if (!api) return;
      const appState = api.getAppState();
      const zoom = appState.zoom.value;
      const x = Math.round(appState.width / (2 * zoom) - appState.scrollX - 170);
      const y = Math.round(appState.height / (2 * zoom) - appState.scrollY - 100);

      const bookmarkElement: ExcalidrawElement = sanitizeElement({
        id: `bookmark-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: "embeddable",
        x,
        y,
        width: 340,
        height: 200,
        angle: 0,
        strokeColor: "#111410",
        backgroundColor: "#3e4637",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: { type: 3, value: 4 },
        seed: Math.floor(Math.random() * 2e9),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2e9),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: url,
        locked: false,
        customData: {
          isBookmarkCard: true,
          url,
          title: title || url,
          description: description || "Interactive web bookmark reference on the canvas.",
        },
      });

      const next = [...api.getSceneElements(), bookmarkElement];
      api.updateScene({
        elements: next as unknown as OrderedExcalidrawElement[],
        appState: { selectedElementIds: { [bookmarkElement.id]: true } },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(next as readonly ExcalidrawElement[]);
      soundEngine.play("create");
      setToastMessage("🔗 Added Web Bookmark Card to canvas");
    },
    [],
  );

  const handleAutoFormatHierarchy = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const all = api.getSceneElements();
    const appState = api.getAppState();
    const selectedIds = new Set(
      Object.entries(appState.selectedElementIds || {})
        .filter(([, sel]) => Boolean(sel))
        .map(([id]) => id),
    );

    const updated = layoutHierarchy(all, selectedIds.size > 0 ? selectedIds : undefined, {
      direction: "top-to-bottom",
    });

    api.updateScene({
      elements: updated as unknown as OrderedExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    bridgeRef.current?.applyLocal(updated as readonly ExcalidrawElement[]);
    soundEngine.play("click");
    setToastMessage("🌿 Auto-formatted diagram hierarchy (tree layout)");
  }, []);

  const addIssueCard = useCallback(
    (issue: IssueDetail, at?: { x: number; y: number }) => {
      if (!isAllowed) return;
      const api = apiRef.current;
      if (!api) return;
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

      const step = cascadeRef.current % 6;
      cascadeRef.current += 1;

      const cardWidth = 320;
      const cardHeight = 180;
      const x = center.x - cardWidth / 2 + step * 24;
      const y = center.y - cardHeight / 2 + step * 24;

      const elementId = `issue-${issue.number}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const embedEl: ExcalidrawElement = sanitizeElement({
        id: elementId,
        type: "embeddable",
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "#2b3327",
        fillStyle: "solid",
        strokeWidth: 0,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: { type: 3, value: 6 },
        seed: Math.floor(Math.random() * 2147483647),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: issue.htmlUrl,
        locked: false,
        customData: {
          isIssueCard: true,
          issueNumber: issue.number,
          issueTitle: issue.title,
          issueState: issue.state,
          issueLabels: issue.labels,
          issueAuthor: issue.author,
          issueAuthorAvatar: issue.authorAvatarUrl,
          issueAssignees: issue.assignees,
          issueComments: issue.commentsCount || 0,
          issueHtmlUrl: issue.htmlUrl,
          repoOwner: issue.owner || session.owner,
          repoName: issue.repo || session.repo,
        },
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
      soundEngine.play("create");
      setToastMessage(`✓ Added Issue #${issue.number} card to board!`);
    },
    [isAllowed, session.owner, session.repo],
  );

  const handleJumpToCard = useCallback((cardElementId: string) => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const target = elements.find((el) => el.id === cardElementId);
    if (target) {
      api.scrollToContent(target, { animate: true, duration: 400 });
      setTaskHubOpen(false);
      setSelectedTaskForDetails(null);
    }
  }, []);

  const handleAddCardToCanvas = useCallback(
    (task: TaskRecord) => {
      const api = apiRef.current;
      const doc = docRef.current;
      if (!api || !doc) return;
      const appState = api.getAppState();
      const rect = containerRef.current?.getBoundingClientRect();
      const center = rect
        ? viewportCoordsToSceneCoords(
            { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
            appState,
          )
        : { x: 100, y: 100 };

      const cardWidth = 300;
      const cardHeight = 180;
      const cardId = `task-card-${task.id}-${Date.now()}`;
      const cardElement: ExcalidrawElement = sanitizeElement({
        id: cardId,
        type: "embeddable",
        x: center.x - cardWidth / 2,
        y: center.y - cardHeight / 2,
        width: cardWidth,
        height: cardHeight,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "#2b3327",
        fillStyle: "solid",
        strokeWidth: 0,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: { type: 3, value: 8 },
        seed: Math.floor(Math.random() * 2147483647),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: `https://caulk.task/${task.key}`,
        locked: false,
        customData: {
          isTaskCard: true,
          taskId: task.id,
          taskKey: task.key,
        },
      });
      const elements = api.getSceneElements();
      const nextElements = [...elements, cardElement];

      api.updateScene({
        elements: nextElements as unknown as OrderedExcalidrawElement[],
        appState: {
          selectedElementIds: { [cardElement.id]: true },
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      bridgeRef.current?.applyLocal(nextElements as readonly ExcalidrawElement[]);
      updateTask(
        doc,
        task.id,
        { canvasCardElementId: cardElement.id },
        { id: currentIdentity.name, name: currentIdentity.name },
      );
      soundEngine.play("create");
      setToastMessage(`📍 Placed task card ${task.key} on board!`);
    },
    [currentIdentity.name],
  );

  const convertSelectedToTask = useCallback(() => {
    const api = apiRef.current;
    const doc = docRef.current;
    if (!api || !doc) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const selected = elements.filter((el) => appState.selectedElementIds[el.id] && !el.isDeleted);
    if (selected.length === 0) {
      setToastMessage("Select a sticky note or shape to convert to a task.");
      return;
    }

    const target = selected[0];
    const task = convertElementToTask(doc, target, {
      id: currentIdentity.name,
      name: currentIdentity.name,
    });

    const updated = elements.map((el) => {
      if (el.id === target.id) {
        return {
          ...el,
          customData: {
            ...((el.customData as Record<string, unknown> | undefined) || {}),
            taskId: task.id,
            taskKey: task.key,
          },
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 2e9),
        };
      }
      return el;
    });

    const restored = restoreElements(updated, null);
    api.updateScene({
      elements: restored as unknown as OrderedExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
    soundEngine.play("create");
    setToastMessage(`✓ Converted to Task ${task.key}!`);
    setSelectedTaskForDetails(task);
  }, [currentIdentity.name]);

  const handleAddStickyForTask = useCallback(
    (task: TaskRecord) => {
      const api = apiRef.current;
      const doc = docRef.current;
      if (!api || !doc) return;
      const appState = api.getAppState();
      const rect = containerRef.current?.getBoundingClientRect();
      const center = rect
        ? viewportCoordsToSceneCoords(
            { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
            appState,
          )
        : { x: 100, y: 100 };

      const stickyText = `${task.key}: ${task.title}${task.description ? "\n" + task.description : ""}`;
      const stickyWidth = 220;
      const stickyHeight = 160;

      const bgColor =
        task.priority === "critical"
          ? "#ffd2cf"
          : task.priority === "high"
          ? "#ffe4be"
          : task.priority === "low"
          ? "#d9ead3"
          : "#fff275";

      const created = convertToExcalidrawElements(
        [
          {
            type: "rectangle",
            x: center.x - stickyWidth / 2,
            y: center.y - stickyHeight / 2,
            width: stickyWidth,
            height: stickyHeight,
            backgroundColor: bgColor,
            fillStyle: "solid",
            strokeColor: "transparent",
            roughness: 0,
            roundness: { type: 3, value: 4 },
            customData: {
              isSticky: true,
              taskId: task.id,
              taskKey: task.key,
              tags: task.labels || [],
            },
            label: {
              text: stickyText,
              fontSize: 16,
              fontFamily: 2,
              textAlign: "center",
              verticalAlign: "middle",
              strokeColor: "#1e1e1e",
            },
          },
        ],
        { regenerateIds: true },
      );

      const current = (api.getSceneElements() || []).map(sanitizeElement);
      const restored = restoreElements([...current, ...created.map(sanitizeElement)], null);

      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        appState: {
          selectedElementIds: { [created[0].id]: true },
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);

      updateTask(
        doc,
        task.id,
        {
          linkedElementIds: [...(task.linkedElementIds || []), created[0].id],
        },
        { id: currentIdentity.name, name: currentIdentity.name },
      );

      soundEngine.play("create");
      setToastMessage(`📝 Added sticky note for ${task.key} to board!`);
    },
    [currentIdentity.name],
  );

  const handlePlaceSubtasksOnCanvas = useCallback(
    (parentTask: TaskRecord, subtasksToPlace: TaskRecord[]) => {
      const api = apiRef.current;
      const doc = docRef.current;
      if (!api || !doc || subtasksToPlace.length === 0) return;
      const elements = api.getSceneElements();
      const parentEl = elements.find(
        (el) => el.id === parentTask.canvasCardElementId || (el.customData as any)?.taskId === parentTask.id,
      );

      const startX = parentEl ? parentEl.x : 200;
      const startY = parentEl ? parentEl.y + parentEl.height + 80 : 300;
      const cardWidth = 260;
      const cardHeight = 130;
      const gap = 30;

      const newElements: ExcalidrawElement[] = [];

      subtasksToPlace.forEach((st, idx) => {
        const cardX = startX + idx * (cardWidth + gap);
        const cardY = startY;
        const cardId = `subtask-card-${st.id}-${Date.now()}-${idx}`;

        const cardElement: ExcalidrawElement = sanitizeElement({
          id: cardId,
          type: "embeddable",
          x: cardX,
          y: cardY,
          width: cardWidth,
          height: cardHeight,
          angle: 0,
          strokeColor: "transparent",
          backgroundColor: "#222a20",
          fillStyle: "solid",
          strokeWidth: 0,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          index: null,
          roundness: { type: 3, value: 6 },
          seed: Math.floor(Math.random() * 2e9),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2e9),
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: `https://caulk.task/${st.key}`,
          locked: false,
          customData: {
            isTaskCard: true,
            taskId: st.id,
            taskKey: st.key,
            parentId: parentTask.id,
            tags: st.labels || [],
          },
        });

        newElements.push(cardElement);

        if (parentEl) {
          const pCenterX = parentEl.x + parentEl.width / 2;
          const pBottomY = parentEl.y + parentEl.height;
          const childCenterX = cardX + cardWidth / 2;
          const childTopY = cardY;

          const dx = childCenterX - pCenterX;
          const dy = childTopY - pBottomY;

          const arrowElement: ExcalidrawElement = sanitizeElement({
            id: `arrow-subtask-${parentTask.id}-${st.id}-${Date.now()}`,
            type: "arrow",
            x: pCenterX,
            y: pBottomY,
            width: Math.abs(dx),
            height: Math.abs(dy),
            angle: 0,
            strokeColor: "#3182ce",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1.5,
            strokeStyle: "dashed",
            roughness: 0,
            opacity: 85,
            groupIds: [],
            frameId: null,
            index: null,
            roundness: { type: 2 },
            seed: Math.floor(Math.random() * 2e9),
            version: 1,
            versionNonce: Math.floor(Math.random() * 2e9),
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
            points: [[0, 0], [dx, dy]],
            startBinding: null,
            endBinding: null,
            lastCommittedPoint: null,
            startArrowhead: null,
            endArrowhead: "arrow",
            elbowed: false,
          });

          newElements.push(arrowElement);
        }

        updateTask(
          doc,
          st.id,
          { canvasCardElementId: cardId },
          { id: currentIdentity.name, name: currentIdentity.name },
        );
      });

      const nextAll = [...elements, ...newElements];
      const restored = restoreElements(nextAll, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);

      soundEngine.play("create");
      setToastMessage(`🌿 Placed ${subtasksToPlace.length} connected subtasks on board!`);
    },
    [currentIdentity.name],
  );

  const handleUnlinkTaskFromElement = useCallback(
    (elementId: string) => {
      const api = apiRef.current;
      const doc = docRef.current;
      if (!api || !doc) return;
      const elements = api.getSceneElements();
      let unlinkedTaskKey = "";
      let targetTaskId = "";
      const nextElements = elements.map((el) => {
        if (el.id === elementId) {
          unlinkedTaskKey = (el.customData as any)?.taskKey || "";
          targetTaskId = (el.customData as any)?.taskId || "";
          const nextCustomData = { ...((el.customData as Record<string, unknown> | undefined) || {}) };
          delete nextCustomData.taskId;
          delete nextCustomData.taskKey;
          delete nextCustomData.isTaskCard;
          return {
            ...el,
            customData: nextCustomData,
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 2e9),
          };
        }
        return el;
      });

      const restored = restoreElements(nextElements, null);
      api.updateScene({
        elements: restored as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);

      if (targetTaskId) {
        const task = getTask(doc, targetTaskId);
        if (task) {
          updateTask(
            doc,
            targetTaskId,
            {
              linkedElementIds: (task.linkedElementIds || []).filter((id) => id !== elementId),
              canvasCardElementId: task.canvasCardElementId === elementId ? undefined : task.canvasCardElementId,
            },
            { id: currentIdentity.name, name: currentIdentity.name },
          );
        }
      }
      soundEngine.play("delete");
      setToastMessage(`✓ Unlinked task ${unlinkedTaskKey || ""} from sticky note.`);
    },
    [currentIdentity.name],
  );

  const handleSetMemberRole = useCallback(
    (name: string, role: string) => {
      if (docRef.current) {
        setMemberRole(docRef.current, name, role, {
          id: currentIdentity.name,
          name: currentIdentity.name,
        });
      }
    },
    [currentIdentity.name],
  );

  const handleAddMember = useCallback(
    (member: {
      name: string;
      role?: string;
      avatarUrl?: string;
      isRepoCollaborator?: boolean;
      repoRole?: string;
    }) => {
      if (docRef.current) {
        addMember(docRef.current, member);
      }
    },
    [],
  );

  const handleRemoveMember = useCallback((name: string) => {
    if (docRef.current) {
      removeMember(docRef.current, name);
    }
  }, []);

  const handleSyncRepoCollaborators = useCallback(async () => {
    if (!session.owner || !session.repo) return 0;
    const tokenProvider = session.token ? () => Promise.resolve(session.token) : getFreshToken;
    const collabs = await fetchRepoCollaborators(tokenProvider, session.owner, session.repo);
    if (collabs.length > 0) {
      setRepoCollaborators(collabs);
      if (docRef.current) {
        syncRepoCollaborators(docRef.current, collabs);
      }
    }
    return collabs.length;
  }, [session.owner, session.repo, session.token, getFreshToken]);

  const handleAddCustomRole = useCallback(
    (role: { name: string; color?: string; icon?: string; description?: string }) => {
      if (docRef.current) {
        addCustomRole(docRef.current, role);
      }
    },
    [],
  );

  const handleDeleteCustomRole = useCallback(
    (roleId: string) => {
      if (docRef.current) {
        deleteCustomRole(docRef.current, roleId);
      }
    },
    [],
  );

  const handleCreateSubtask = useCallback(
    (parentId: string, title: string) => {
      if (docRef.current) {
        createSubtask(
          docRef.current,
          parentId,
          { title },
          { id: currentIdentity.name, name: currentIdentity.name },
        );
      }
    },
    [currentIdentity.name],
  );

  const renderEmbeddable = useCallback(
    (element: any) => {
      const link = element.link?.trim() || "";
      if (element.customData?.isTaskCard || element.customData?.taskId) {
        const taskId = element.customData.taskId as string;
        const task = tasks.find((t) => t.id === taskId);
        return (
          <WhiteboardTaskCard
            element={element}
            task={task}
            allTasks={tasks}
            onUpdateTask={(updates) => {
              if (docRef.current) {
                updateTask(docRef.current, taskId, updates, {
                  id: currentIdentity.name,
                  name: currentIdentity.name,
                });
              }
            }}
            onUpdateSubtaskStatus={(subtaskId, status) => {
              if (docRef.current) {
                updateTask(docRef.current, subtaskId, { status }, {
                  id: currentIdentity.name,
                  name: currentIdentity.name,
                });
              }
            }}
            onCreateSubtask={(parentId, title) => {
              handleCreateSubtask(parentId, title);
            }}
            onPlaceSubtasksOnCanvas={handlePlaceSubtasksOnCanvas}
            onOpenDetails={(t) => setSelectedTaskForDetails(t)}
          />
        );
      }
      if (element.customData?.isIssueCard || isGitHubIssueLink(link)) {
        return (
          <GitHubIssueCard
            element={element}
            token={getFreshToken}
            defaultOwner={session.owner}
            defaultRepo={session.repo}
            onUpdateElement={handleUpdateCardCustomData}
          />
        );
      }
      if (element.customData?.isCodeCard) {
        return (
          <CodeSnippetCard
            element={element}
            onUpdateElement={handleUpdateCardCustomData}
          />
        );
      }
      if (element.customData?.isChecklistCard) {
        return (
          <ChecklistCard
            element={element}
            onUpdateElement={handleUpdateCardCustomData}
          />
        );
      }
      if (element.customData?.isBookmarkCard) {
        return (
          <WebBookmarkCard
            element={element}
            onUpdateElement={handleUpdateCardCustomData}
          />
        );
      }
      if (!link) return null;
      return <VideoEmbedFrame link={link} assetStore={assetStore} />;
    },
    [
      assetStore,
      currentIdentity.name,
      handleCreateSubtask,
      handlePlaceSubtasksOnCanvas,
      handleUpdateCardCustomData,
      session.owner,
      session.repo,
      tasks,
    ],
  );

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
        soundEngine.play("alert");
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
      soundEngine.play("click");
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
    soundEngine.play("click");
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
    const selected = elements.filter((el) => appState.selectedElementIds[el.id] && !el.isDeleted);

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
      (el) => (el.type === "frame" || (el.customData as Record<string, unknown> | undefined)?.isFrame) && !el.isDeleted,
    ).length;
    const frameTitle = `Frame ${frameCount + 1}`;
    const frameId = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Identify elements that should be bound as frame children:
    // Either explicitly selected non-frame elements, or any existing elements completely inside the frame bounds.
    const targetChildren =
      selected.length > 0
        ? selected.filter((el) => el.type !== "frame" && el.type !== "magicframe")
        : elements.filter(
            (el) =>
              el.type !== "frame" &&
              el.type !== "magicframe" &&
              !el.isDeleted &&
              el.x >= x &&
              el.y >= y &&
              el.x + el.width <= x + width &&
              el.y + el.height <= y + height,
          );

    const childIds = new Set(targetChildren.map((c) => c.id));
    for (const c of targetChildren) {
      if (c.boundElements) {
        for (const b of c.boundElements) {
          if (b.type === "text") childIds.add(b.id);
        }
      }
    }

    const created = convertToExcalidrawElements([
      {
        id: frameId,
        type: "frame",
        name: frameTitle,
        children: Array.from(childIds),
        x,
        y,
        width,
        height,
        backgroundColor: "transparent",
        strokeColor: "#C59C3A",
        strokeWidth: 2,
        strokeStyle: "solid",
        roundness: { type: 3, value: 16 },
        customData: { isFrame: true, frameTitle },
      },
    ]);
    const frameElement = {
      ...created[0],
      backgroundColor: "transparent",
      strokeColor: "#C59C3A",
      strokeWidth: 2,
      strokeStyle: "solid",
      roundness: { type: 3 as const, value: 16 },
      customData: { isFrame: true, frameTitle },
    };

    // Excalidraw frame invariant: child elements must precede the parent frame in scene order
    const otherElements: ExcalidrawElement[] = [];
    const childrenToFrame: ExcalidrawElement[] = [];

    for (const el of elements) {
      if (childIds.has(el.id)) {
        childrenToFrame.push({
          ...el,
          frameId: frameElement.id,
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 1000000000),
          updated: Date.now(),
        });
      } else {
        otherElements.push(el);
      }
    }

    const nextElements = [...otherElements, ...childrenToFrame, frameElement];

    api.updateScene({
      elements: nextElements as unknown as OrderedExcalidrawElement[],
      appState: {
        selectedElementIds: { [frameElement.id]: true },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setToastMessage(
      `🖼️ Added "${frameTitle}"${childrenToFrame.length > 0 ? ` (${childrenToFrame.length} items bound)` : ""}`,
    );
  }, []);

  // --- Infinite Canvas Camera Navigation & Spatial Orientation (Phase 1) ---

  const handleMinimapNavigate = useCallback((sceneX: number, sceneY: number) => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const zoom = appState.zoom.value;
    const nextScrollX = appState.width / 2 - sceneX * zoom;
    const nextScrollY = appState.height / 2 - sceneY * zoom;
    api.updateScene({
      appState: { scrollX: nextScrollX, scrollY: nextScrollY },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const handleZoomToFit = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements().filter((el) => !el.isDeleted);
    if (elements.length > 0) {
      api.scrollToContent(elements, { fitToViewport: true, animate: true });
      soundEngine.play("click");
      setToastMessage("🔍 Zoomed to fit all board elements (Shift+1)");
    } else {
      setToastMessage("Board is empty");
    }
  }, []);

  const handleZoomToSelection = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const elements = api.getSceneElements();
    const selected = elements.filter((el) => appState.selectedElementIds[el.id] && !el.isDeleted);
    if (selected.length > 0) {
      api.scrollToContent(selected, { fitToViewport: true, animate: true });
      soundEngine.play("click");
      setToastMessage(`🔍 Zoomed to ${selected.length} selected element(s) (Shift+2)`);
    } else {
      setToastMessage("No elements selected to zoom to (Shift+2)");
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const currentCenterX = (appState.width / 2 - appState.scrollX) / appState.zoom.value;
    const currentCenterY = (appState.height / 2 - appState.scrollY) / appState.zoom.value;
    const newScrollX = appState.width / 2 - currentCenterX * 1;
    const newScrollY = appState.height / 2 - currentCenterY * 1;
    api.updateScene({
      appState: { zoom: { value: 1 as any }, scrollX: newScrollX, scrollY: newScrollY },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    soundEngine.play("click");
    setToastMessage("🔍 Zoom reset to 100% (Shift+0)");
  }, []);

  const handleGoToOrigin = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    api.updateScene({
      appState: { scrollX: appState.width / 2, scrollY: appState.height / 2 },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    soundEngine.play("click");
    setToastMessage("📍 Returned to World Origin (0, 0) [H]");
  }, []);

  const handleJumpToPeer = useCallback((peer: PeerUser) => {
    const api = apiRef.current;
    if (!api || !peer.viewport) return;
    api.updateScene({
      appState: {
        scrollX: peer.viewport.scrollX,
        scrollY: peer.viewport.scrollY,
        zoom: { value: peer.viewport.zoom as any },
      },
    });
    soundEngine.play("click");
    setToastMessage(`Jumped to @${peer.name}'s view`);
  }, []);

  const saveWaypoint = useCallback((slot: string) => {
    const api = apiRef.current;
    const bridge = bridgeRef.current;
    if (!api || !bridge) return;
    const appState = api.getAppState();
    const wp: Waypoint = {
      id: slot,
      name: `Waypoint ${slot}`,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom.value,
      created: Date.now(),
    };
    bridge.setWaypoint(slot, wp);
    soundEngine.play("click");
    setToastMessage(`📌 Saved camera waypoint [${slot}] (Ctrl+Alt+${slot})`);
  }, []);

  const jumpToWaypoint = useCallback((slot: string) => {
    const bridge = bridgeRef.current;
    const api = apiRef.current;
    if (!bridge || !api) return;
    const wp = bridge.getWaypoints()[slot];
    if (!wp) {
      setToastMessage(`Waypoint [${slot}] not set yet. Press Ctrl+Alt+${slot} to save current view.`);
      return;
    }
    api.updateScene({
      appState: {
        scrollX: wp.scrollX,
        scrollY: wp.scrollY,
        zoom: { value: wp.zoom as any },
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    soundEngine.play("ping");
    setToastMessage(`🚀 Jumped to waypoint [${slot}]: ${wp.name}`);
  }, []);

  const handleSelectFrame = useCallback((frame: ExcalidrawElement) => {
    const api = apiRef.current;
    if (!api) return;
    api.scrollToContent([frame], { fitToViewport: true, animate: true });
    soundEngine.play("click");
  }, []);

  const handleRenameFrame = useCallback((frameId: string, newName: string) => {
    const api = apiRef.current;
    const bridge = bridgeRef.current;
    if (!api || !bridge) return;
    const elements = api.getSceneElements();
    const target = elements.find((el) => el.id === frameId);
    if (!target) return;
    const updated = {
      ...target,
      name: newName,
      customData: {
        ...(target.customData as Record<string, unknown> | undefined),
        frameTitle: newName,
      },
    };
    const restored = restoreElements([updated], elements);
    api.updateScene({ elements: restored as readonly OrderedExcalidrawElement[] });
    bridge.applyLocal(restored as readonly ExcalidrawElement[]);
    setToastMessage(`✓ Renamed frame to "${newName}"`);
  }, []);

  useEffect(() => {
    const onNavigationKeyDown = (e: KeyboardEvent) => {
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
      if (api.getAppState().editingTextElement) return;

      // 1. M toggles radar minimap
      if (e.key.toLowerCase() === "m" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleMinimap();
        return;
      }

      // 2. H returns to origin (0, 0)
      if (e.key.toLowerCase() === "h" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleGoToOrigin();
        return;
      }

      // 3. Shift + 1, 2, 0 camera zoom shortcuts
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "!" || e.key === "1") {
          e.preventDefault();
          handleZoomToFit();
          return;
        }
        if (e.key === "@" || e.key === "2") {
          e.preventDefault();
          handleZoomToSelection();
          return;
        }
        if (e.key === ")" || e.key === "0") {
          e.preventDefault();
          handleResetZoom();
          return;
        }
      }

      // 4. Ctrl + Alt + [1-9]: Save camera waypoint
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey) {
        if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          saveWaypoint(e.key);
          return;
        }
      }

      // 5. Alt + [1-9]: Jump to camera waypoint
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          jumpToWaypoint(e.key);
          return;
        }
      }
    };

    window.addEventListener("keydown", onNavigationKeyDown);
    return () => window.removeEventListener("keydown", onNavigationKeyDown);
  }, [
    toggleMinimap,
    handleGoToOrigin,
    handleZoomToFit,
    handleZoomToSelection,
    handleResetZoom,
    saveWaypoint,
    jumpToWaypoint,
  ]);

  // TAB key: Multiplayer scoreboard / Player roster overlay (Hold to view, or quick press to toggle)
  useEffect(() => {
    const onScoreboardKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable ||
            target.closest?.(".excalidraw-textEditorContainer"))
        ) {
          return;
        }
        const api = apiRef.current;
        if (api?.getAppState().editingTextElement) return;

        e.preventDefault();
        if (e.repeat) return;
        tabPressTimeRef.current = Date.now();
        if (playerListOpenRef.current) {
          setPlayerListOpen(false);
        } else {
          setPlayerListOpen(true);
        }
      }
    };

    const onScoreboardKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const elapsed = Date.now() - tabPressTimeRef.current;
        // If the user held TAB for more than 300ms, close on release (game-style hold-to-view scoreboard)
        if (elapsed >= 300 && playerListOpenRef.current) {
          setPlayerListOpen(false);
        }
      }
    };

    window.addEventListener("keydown", onScoreboardKeyDown);
    window.addEventListener("keyup", onScoreboardKeyUp);
    return () => {
      window.removeEventListener("keydown", onScoreboardKeyDown);
      window.removeEventListener("keyup", onScoreboardKeyUp);
    };
  }, []);

  // When an arrow key is pressed to nudge a frame, keep unselected child elements inside the frame locked to it
  useEffect(() => {
    const onFrameNudgeKeyDown = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const api = apiRef.current;
      if (!api) return;
      const appState = api.getAppState();
      if (appState.editingTextElement || appState.openDialog || appState.openMenu) return;

      const elements = api.getSceneElements();
      const selectedFrames = elements.filter(
        (el) => appState.selectedElementIds[el.id] && el.type === "frame" && !el.isDeleted,
      );
      if (selectedFrames.length === 0) return;

      const frameIds = new Set(selectedFrames.map((f) => f.id));
      const childElements = elements.filter(
        (el) =>
          el.frameId &&
          frameIds.has(el.frameId) &&
          !appState.selectedElementIds[el.id] &&
          !el.isDeleted,
      );
      if (childElements.length === 0) return;

      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      const childIds = new Set(childElements.map((c) => c.id));
      const updated = elements.map((el) => {
        if (childIds.has(el.id)) {
          return {
            ...el,
            x: el.x + dx,
            y: el.y + dy,
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 1000000000),
            updated: Date.now(),
          };
        }
        return el;
      });

      api.updateScene({
        elements: updated as unknown as OrderedExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    window.addEventListener("keydown", onFrameNudgeKeyDown);
    return () => window.removeEventListener("keydown", onFrameNudgeKeyDown);
  }, []);

  // Presentation Mode
  const startPresentation = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const frames = elements
      .filter((el) => (el.type === "frame" || (el.customData as Record<string, unknown> | undefined)?.isFrame) && !el.isDeleted)
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
      const detail = await fetchGitHubIssue(
        getFreshToken,
        session.owner,
        session.repo,
        issue.number,
      );
      // Spawn the Issue Card right next to the selected note (do NOT override sticky!)
      const at = targetElement
        ? { x: targetElement.x + targetElement.width + 30, y: targetElement.y }
        : undefined;
      addIssueCard(detail, at);
      setToastMessage(`✓ Created Issue #${issue.number} and placed card beside note!`);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : "Failed to create issue.");
    } finally {
      setCreatingIssue(false);
    }
  }, [creatingIssue, session, storageLabel, addIssueCard]);

  // Stamp / Reaction
  const stampReaction = useCallback(
    (emoji: string) => {
      soundEngine.play("click");
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
      if (docRef.current) {
        recordActivity(docRef.current, {
          userName: currentIdentity.name,
          action: "restore",
          targetType: "board",
          title: "Restored board snapshot",
          detail: snapshot.name,
        });
      }
      historyOpenRef.current = false;
      setHistoryOpen(false);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  const handleJumpToElement = useCallback(
    (point?: { x: number; y: number }, elementId?: string) => {
      const api = apiRef.current;
      if (!api) return;

      if (elementId) {
        const elements = api.getSceneElements();
        const target = elements.find((el) => el.id === elementId && !el.isDeleted);
        if (target) {
          api.scrollToContent(target, { animate: true, duration: 400 });
          return;
        }
      }

      if (point) {
        const appState = api.getAppState();
        const targetScrollX = appState.width / 2 - point.x * appState.zoom.value;
        const targetScrollY = appState.height / 2 - point.y * appState.zoom.value;
        api.updateScene({
          appState: {
            scrollX: targetScrollX,
            scrollY: targetScrollY,
          },
        });
      }
    },
    [],
  );

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

  const makeAdapter = () =>
    new GitHubAdapter({
      token: getFreshToken,
      owner: session.owner,
      repo: session.repo,
      branch: session.branch,
      path: session.path,
    });

  // Throws WrongPassphraseError (shown by the modal) if the passphrase can't open the board.
  const unlockBoard = async (pass: string, remember: boolean) => {
    await new EncryptedStore(makeAdapter(), pass).open();
    setBoardPassphrase(session, pass, { remember });
    window.location.reload();
  };

  // newPass null removes the password (goes back to the default passphrase).
  const changeBoardPassword = async (newPass: string | null, remember: boolean) => {
    const target = newPass ?? defaultPassphrase(session);
    await engineRef.current?.saveNow();
    await rekeyBoard({
      adapter: makeAdapter(),
      boardPath: session.path,
      oldPassphrase: session.passphrase,
      newPassphrase: target,
      onProgress: (done, total) => setPasswordProgress(`Re-encrypting ${done}/${total}…`),
    });
    setBoardPassphrase(session, target, { remember });
    window.location.reload();
  };

  const busy = status.kind === "loading" || status.kind === "saving";

  const customShade = vguiShade(customColor);
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
            // Fires continuously while dragging in the picker: only choose the colour here.
            onChange={(e) => setCustomColor(e.target.value)}
            title="Color wheel: pick custom hex color"
          />
        </div>
      </div>
      <button
        className="swatch swatch-custom"
        style={{ background: customColor }}
        title={`Add custom ${customColor} sticky note`}
        aria-label={`Add custom ${customColor} sticky note`}
        onClick={() => addSticky(customColor)}
      />
      <button
        className="swatch swatch-shade"
        style={{ background: customShade }}
        title="VGUI shade of your colour"
        aria-label={`Add VGUI shade ${customShade} sticky note`}
        onClick={() => addSticky(customShade)}
      />
    </div>
  );

  const stickySettingsBar = (
    <div className="sticky-defaults-bar">
      <div className="sticky-defaults-section">
        <span className="sticky-defaults-label">Edges</span>
        <div className="sticky-defaults-chips">
          <button
            type="button"
            className={`sticky-default-chip ${stickyDefaults.radius === 0 ? "active" : ""}`}
            onClick={() => handleUpdateStickyDefault({ radius: 0 })}
            title="Sharp corners (0px radius)"
          >
            Sharp (0px)
          </button>
          <button
            type="button"
            className={`sticky-default-chip ${stickyDefaults.radius === 8 ? "active" : ""}`}
            onClick={() => handleUpdateStickyDefault({ radius: 8 })}
            title="Slightly rounded (8px radius)"
          >
            Round (8px)
          </button>
          <button
            type="button"
            className={`sticky-default-chip ${stickyDefaults.radius === 16 ? "active" : ""}`}
            onClick={() => handleUpdateStickyDefault({ radius: 16 })}
            title="Rounded (16px radius)"
          >
            Round (16px)
          </button>
        </div>
      </div>
      <div className="sticky-defaults-section">
        <span className="sticky-defaults-label">Sloppiness</span>
        <div className="sticky-defaults-chips">
          <button
            type="button"
            className={`sticky-default-chip ${stickyDefaults.roughness === 0 ? "active" : ""}`}
            onClick={() => handleUpdateStickyDefault({ roughness: 0 })}
            title="Architect style (0 sloppiness / crisp lines)"
          >
            0 Neat
          </button>
          <button
            type="button"
            className={`sticky-default-chip ${stickyDefaults.roughness === 1 ? "active" : ""}`}
            onClick={() => handleUpdateStickyDefault({ roughness: 1 })}
            title="Artist style (1 sloppiness)"
          >
            1 Artist
          </button>
          <button
            type="button"
            className={`sticky-default-chip ${stickyDefaults.roughness === 2 ? "active" : ""}`}
            onClick={() => handleUpdateStickyDefault({ roughness: 2 })}
            title="Cartoonist style (2 sloppiness / hand-drawn)"
          >
            2 Cartoon
          </button>
        </div>
      </div>
    </div>
  );

  const syncDot =
    status.kind === "error" || status.kind === "locked"
      ? "err"
      : status.kind === "pending" || status.kind === "loading"
        ? "warn"
        : status.kind === "saving"
          ? "busy"
          : "ok";
  const syncLabel =
    status.kind === "error"
      ? "Sync error"
      : status.kind === "locked"
        ? "Locked"
        : status.kind === "pending"
        ? "Unsaved"
        : status.kind === "saving"
          ? "Saving…"
          : status.kind === "loading"
            ? "Unlocking…"
            : "Saved";

  const isAnyModalOpen =
    taskHubOpen ||
    soundboardOpen ||
    Boolean(selectedTaskForDetails) ||
    themePickerOpen ||
    backgroundPickerOpen ||
    clusterModalOpen ||
    videoModalOpen ||
    startVotingOpen ||
    votingResultsOpen ||
    templateGalleryOpen ||
    passwordModalOpen ||
    issuesDrawerOpen ||
    historyOpen ||
    timerPickerOpen ||
    playerListOpen ||
    status.kind === "locked";

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
          <button
            type="button"
            className="topbar-btn"
            style={{ padding: "2px 7px", fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}
            onClick={onClose}
            title="Return to Home Dashboard & Boards"
            aria-label="Boards Dashboard"
          >
            <span>🏠</span>
            <span style={{ fontWeight: 600 }}>Boards</span>
          </button>
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
                ? `${liveStatus.peersCount} peer(s) connected. Click or press TAB for player roster.`
                : "No other peers connected right now. Click or press TAB for player roster."
            }
            onClick={() => setPlayerListOpen((v) => !v)}
            style={{ cursor: "pointer" }}
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

          <button
            type="button"
            className={`topbar-btn ${taskHubOpen ? "active" : ""}`}
            style={{ padding: "3px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            onClick={() => setTaskHubOpen((open) => !open)}
            title="Open Project & Task Management Hub"
            aria-label="Tasks & Progress"
          >
            <span>📋</span>
            <span style={{ fontWeight: 600 }}>Tasks</span>
            {tasks.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: "0 5px",
                  borderRadius: 8,
                  background: "var(--vgui-accent, #3182ce)",
                  color: "#ffffff",
                  fontWeight: 700,
                }}
              >
                {tasks.filter((t) => t.status !== "done").length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`topbar-btn ${issuesDrawerOpen ? "active" : ""}`}
            style={{ padding: "3px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => setIssuesDrawerOpen((open) => !open)}
            title="Browse & insert GitHub Issue Cards"
            aria-label="GitHub Issues"
          >
            <span>🐙</span>
            <span style={{ fontWeight: 600 }}>Issues</span>
          </button>

          <button
            type="button"
            className={`topbar-btn ${soundboardOpen ? "active" : ""}`}
            style={{ padding: "3px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            onClick={() => setSoundboardOpen((open) => !open)}
            title="Open Board Soundboard (Custom Sounds, Clipping & Hotkeys)"
            aria-label="Soundboard"
          >
            <span>🔊</span>
            <span style={{ fontWeight: 600 }}>Soundboard</span>
            {soundboardClips.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  padding: "0 5px",
                  borderRadius: 8,
                  background: "var(--vgui-accent, #3182ce)",
                  color: "#ffffff",
                  fontWeight: 700,
                }}
              >
                {soundboardClips.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className="topbar-btn"
            style={{ padding: "3px 7px", fontSize: 13, minWidth: 32 }}
            onClick={toggleMuteSound}
            title={soundEnabled ? "Mute retro sound effects" : "Unmute retro sound effects"}
            aria-label="Toggle retro sound effects"
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </header>

      {status.kind === "error" &&
        (status.message.toLowerCase().includes("401") ||
          status.message.toLowerCase().includes("rejected") ||
          status.message.toLowerCase().includes("expired") ||
          status.message.toLowerCase().includes("bad credentials")) && (
          <div className="auth-expired-banner">
            <span>⚠️ GitHub authentication expired or rejected. You must log in again to sync changes.</span>
            <button
              type="button"
              className="btn primary"
              style={{ padding: "3px 10px", fontSize: 11 }}
              onClick={onClose}
            >
              🔑 Re-login to GitHub
            </button>
          </div>
        )}

      {apiReady && !isNarrow && stickyPos && !isAnyModalOpen
        ? createPortal(
            <div
              className="sticky-anchor"
              ref={stickyAnchorRef}
              style={{ left: stickyPos.left, top: stickyPos.top, height: stickyPos.height }}
            >
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className={`sticky-trigger${stickyPanelOpen ? " active" : ""}`}
                  onClick={() => setStickyPanelOpen((open) => !open)}
                  title="Sticky note (N)"
                  aria-label="Sticky note (N)"
                  aria-expanded={stickyPanelOpen}
                >
                  <span className="sticky-trigger-icon" style={{ background: lastStickyColorRef.current }} />
                </button>
                {stickyPanelOpen && (
                  <div
                    className="sticky-popover"
                    role="toolbar"
                    aria-label="Sticky colours and defaults"
                    onClick={(e) => {
                      // Picking a colour swatch closes the popover; default style chips and the color wheel keep it open.
                      if ((e.target as HTMLElement).closest(".swatch")) setStickyPanelOpen(false);
                    }}
                  >
                    {stickySwatches}
                    {stickySettingsBar}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`sticky-trigger frame-trigger${currentActiveTool === "frame" ? " active" : ""}`}
                onClick={() => {
                  const api = apiRef.current;
                  if (!api) return;
                  if (currentActiveTool === "frame") {
                    api.setActiveTool({ type: "selection" });
                  } else {
                    api.setActiveTool({ type: "frame" });
                  }
                }}
                title="Frame (F) - Draw a frame around objects"
                aria-label="Frame (F)"
              >
                <span className="frame-trigger-icon" style={{ fontSize: 16 }}>🖼️</span>
              </button>
            </div>,
            containerRef.current ?? document.body,
          )
        : null}

      {apiReady && (isNarrow || !stickyToolbarHost) && !isAnyModalOpen && (
        <div className="sticky-mobile" style={{ display: "flex", gap: 6 }}>
          <div style={{ position: "relative" }}>
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
                {stickySettingsBar}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`sticky-mobile-btn${currentActiveTool === "frame" ? " active" : ""}`}
            onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              if (currentActiveTool === "frame") {
                api.setActiveTool({ type: "selection" });
              } else {
                api.setActiveTool({ type: "frame" });
              }
            }}
            title="Frame (F)"
            aria-label="Frame (F)"
          >
            🖼️ Frame
          </button>
        </div>
      )}

      <div
        className="board"
        style={{
          backgroundColor: viewBackgroundRef.current,
        }}
      >
        {canvasBgUrl && (
          <div
            className="board-canvas-bg"
            style={{
              backgroundImage: `url(${canvasBgUrl})`,
              backgroundRepeat: canvasBgConfig?.tile ? "repeat" : "no-repeat",
              backgroundSize: canvasBgConfig?.tile ? "auto" : "cover",
              backgroundPosition: "center",
            }}
          />
        )}
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
          theme="light"
          initialData={{
            appState: {
              viewBackgroundColor: DEFAULT_VIEW_BACKGROUND,
              currentItemStrokeColor: "#e9ecef",
              currentItemRoughness: 0,
              currentItemFontFamily: 2,
              currentItemStrokeWidth: 2,
              collaborators,
            },
          }}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
          validateEmbeddable={true}
          renderEmbeddable={renderEmbeddable}
          renderTopRightUI={(_isMobile, appState) => {
            const activeBadgeCount =
              unreadCommentsCount +
              (voting.session?.status === "active" ? 1 : 0) +
              (presenting ? 1 : 0);
            const hasLiveTool =
              placingComment ||
              pingMode ||
              presenting ||
              voting.session?.status === "active" ||
              Boolean(timer?.running) ||
              appState.openSidebar?.name === "comments" ||
              appState.openSidebar?.name === "ai";
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div className="caulk-tools-anchor" ref={toolsMenuRef}>
                  <button
                    type="button"
                    className={`sidebar-trigger caulk-tools-trigger${toolsMenuOpen || hasLiveTool ? " active" : ""}`}
                    aria-haspopup="menu"
                    aria-expanded={toolsMenuOpen}
                    title="Caulk tools &amp; collaboration settings"
                    onClick={() => setToolsMenuOpen((open) => !open)}
                  >
                    <span>🧰</span>
                    <span>Tools</span>
                    {activeBadgeCount > 0 && (
                      <span className="comment-top-badge">{activeBadgeCount}</span>
                    )}
                    <span style={{ fontSize: 10, opacity: 0.8 }}>{toolsMenuOpen ? "▲" : "▼"}</span>
                  </button>

                  {toolsMenuOpen && (
                    <div className="Island caulk-tools-menu" role="menu" aria-label="Caulk tools menu">
                      {/* Section 1: Spatial & Frames */}
                      <div className="caulk-menu-section">
                        <div className="caulk-menu-heading">Spatial &amp; Frames</div>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${frameNavigatorOpen ? " active" : ""}`}
                          onClick={() => {
                            setFrameNavigatorOpen((v) => !v);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📐 Frames &amp; Outline Drawer</span>
                          {allFrames.length > 0 && (
                            <span className="caulk-menu-pill">{allFrames.length}</span>
                          )}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${currentActiveTool === "frame" ? " active" : ""}`}
                          onClick={() => {
                            const api = apiRef.current;
                            if (api) {
                              if (currentActiveTool === "frame") {
                                api.setActiveTool({ type: "selection" });
                              } else {
                                api.setActiveTool({ type: "frame" });
                              }
                            }
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🖼️ Draw frame</span>
                          <kbd>F</kbd>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            addFrame();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📦 Frame selection</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            startPresentation();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🎞️ Present frames</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            handleAutoFormatHierarchy();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🌿 Auto-format diagram tree</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${minimapOpen ? " active" : ""}`}
                          onClick={() => {
                            toggleMinimap();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🛰️ Tactical radar minimap</span>
                          <span className="caulk-menu-pill">{minimapOpen ? "ON" : "OFF"}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${playerListOpen ? " active" : ""}`}
                          onClick={() => {
                            setPlayerListOpen((v) => !v);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>👥 Connected operators</span>
                          <kbd>Tab</kbd>
                        </button>
                      </div>

                      <div className="caulk-menu-sep" />

                      {/* Section 2: Canvas & Stickies */}
                      <div className="caulk-menu-section">
                        <div className="caulk-menu-heading">Canvas &amp; Stickies</div>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setTemplateGalleryOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📐 Template gallery…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            openMermaid();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📊 Mermaid diagram…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setVideoModalOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🎬 Insert video…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            addCodeCard();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>💻 Insert Code Snippet…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            addChecklistCard();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📋 Insert Checklist card…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            const url = window.prompt("Enter web bookmark URL:", "https://");
                            if (url?.trim()) {
                              addBookmarkCard(url.trim());
                            }
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🔗 Insert Web Bookmark card…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setClusterModalOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🏷️ Cluster &amp; organize stickies…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${showTags ? " active" : ""}`}
                          onClick={() => {
                            toggleShowTags();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🏷️ Sticky tags</span>
                          <span className="caulk-menu-pill">{showTags ? "Shown" : "Hidden"}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            convertSelectedToTask();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>✓ Convert selected to Task</span>
                        </button>
                      </div>

                      <div className="caulk-menu-sep" />

                      {/* Section 3: Collaborate & Attention */}
                      <div className="caulk-menu-section">
                        <div className="caulk-menu-heading">Collaborate &amp; Attention</div>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${placingComment ? " active" : ""}`}
                          onClick={() => {
                            setShowComments(true);
                            setPlacingComment((v) => !v);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>💬 Place comment pin</span>
                          <kbd>C</kbd>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${appState.openSidebar?.name === "comments" ? " active" : ""}`}
                          onClick={() => {
                            apiRef.current?.toggleSidebar({ name: "comments" });
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>💬 Comments panel</span>
                          {unreadCommentsCount > 0 && (
                            <span className="caulk-menu-pill">{unreadCommentsCount} new</span>
                          )}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => setShowComments((v) => !v)}
                        >
                          <span>👁️ Comment pins</span>
                          <span className="caulk-menu-pill">{showComments ? "Shown" : "Hidden"}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${voting.session?.status === "active" ? " active" : ""}`}
                          onClick={() => {
                            if (voting.session?.status === "ended") setVotingResultsOpen(true);
                            else setStartVotingOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>
                            🗳️{" "}
                            {voting.session?.status === "active"
                              ? "Voting in progress…"
                              : voting.session?.status === "ended"
                                ? "Voting results"
                                : "Start dot voting…"}
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            bringEveryoneToMe();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📣 Bring everyone to me</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${presenting ? " active" : ""}`}
                          onClick={() => {
                            setPresenting((v) => !v);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📡 Presenter mode</span>
                          <span className="caulk-menu-pill">{presenting ? "ON" : "OFF"}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`caulk-menu-item${pingMode ? " active" : ""}`}
                          onClick={() => {
                            setPingMode((v) => !v);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>📍 {pingMode ? "Cancel ping" : "Ping attention"}</span>
                          <kbd>Alt+Click</kbd>
                        </button>
                        <div className="caulk-menu-inline-row" aria-label="Stamp reaction">
                          <span className="caulk-menu-inline-label">Stamp:</span>
                          {["👍", "🔥", "💡", "🚀", "❤️"].map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="caulk-menu-chip"
                              title={`Stamp ${emoji} on board`}
                              onClick={() => {
                                stampReaction(emoji);
                                setToolsMenuOpen(false);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <div className="caulk-menu-inline-row" aria-label="Meeting timer">
                          <span className="caulk-menu-inline-label">⏱️ Timer:</span>
                          {[1, 3, 5, 10].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              className="caulk-menu-chip"
                              onClick={() => {
                                startMeetingTimer(mins);
                                setToolsMenuOpen(false);
                              }}
                            >
                              {mins}m
                            </button>
                          ))}
                          {timer?.running && (
                            <button
                              type="button"
                              className="caulk-menu-chip danger"
                              onClick={() => {
                                stopMeetingTimer();
                                setToolsMenuOpen(false);
                              }}
                            >
                              Stop
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="caulk-menu-sep" />

                      {/* Section 4: Workspace & Sync */}
                      <div className="caulk-menu-section">
                        <div className="caulk-menu-heading">Workspace &amp; Sync</div>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setBackgroundPickerOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🎨 Board background…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setThemePickerOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🎭 Theme &amp; UI colors…</span>
                          <span className="caulk-menu-pill">
                            {getThemePreset(boardTheme.preset, boardTheme.customTheme).badge}
                          </span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setHistory(!historyOpen);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🕒 Board history</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            copyShareLink();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🔗 Copy invite link</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          onClick={() => {
                            setIssuesDrawerOpen(true);
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🐙 GitHub Issues (Browse &amp; Insert)</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="caulk-menu-item"
                          disabled={creatingIssue}
                          onClick={() => {
                            if (!creatingIssue) void convertSelectedToIssue();
                            setToolsMenuOpen(false);
                          }}
                        >
                          <span>🐙 Create Issue Card from Note</span>
                        </button>
                        <div className="caulk-menu-inline-row">
                          <button
                            type="button"
                            className="caulk-menu-chip"
                            onClick={() => {
                              void engineRef.current?.saveNow();
                              setToolsMenuOpen(false);
                            }}
                          >
                            💾 Save
                          </button>
                          <button
                            type="button"
                            className="caulk-menu-chip"
                            onClick={() => {
                              void engineRef.current?.pullNow();
                              setToolsMenuOpen(false);
                            }}
                          >
                            ⬇️ Pull
                          </button>
                          {isRepoAdmin && (
                            <button
                              type="button"
                              className="caulk-menu-chip"
                              onClick={() => {
                                setPasswordModalOpen(true);
                                setToolsMenuOpen(false);
                              }}
                            >
                              🔐 Key
                            </button>
                          )}
                          <button
                            type="button"
                            className="caulk-menu-chip"
                            onClick={() => {
                              setToolsMenuOpen(false);
                              onClose();
                            }}
                          >
                            🏠 Boards
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            </div>
          );
        }}
        >
          <MainMenu>
            <MainMenu.Group title="Board">
              <MainMenu.Item onSelect={() => setIssuesDrawerOpen(true)}>🐙 GitHub Issues…</MainMenu.Item>
              <MainMenu.Item onSelect={() => setBackgroundPickerOpen(true)}>Board background…</MainMenu.Item>
              <MainMenu.Item onSelect={() => setThemePickerOpen(true)}>Theme &amp; UI colors…</MainMenu.Item>
              <MainMenu.Item onSelect={() => setStickyPanelOpen(!stickyPanelOpen)}>Sticky palette</MainMenu.Item>
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
            name="comments"
            className="ai-sidebar"
            docked={false}
          >
            <Sidebar.Header>Comments</Sidebar.Header>
            <CommentsSidebar
              threads={commentThreads}
              currentAuthor={currentIdentity.name}
              activeThreadId={activeCommentId}
              seenMap={seenCommentsMap}
              apiRef={apiRef}
              onSelectThread={(id) => {
                setShowComments(true);
                setActiveCommentId(id);
              }}
              onStartAdding={() => {
                setShowComments(true);
                setPlacingComment(true);
              }}
            />
          </Sidebar>
        </Excalidraw>
        <CommentOverlay
          doc={docRef.current}
          apiRef={apiRef}
          apiReady={apiReady}
          threads={commentThreads}
          currentAuthor={currentIdentity.name}
          peerNames={commentPeerNames}
          visible={showComments}
          placingMode={placingComment}
          onDonePlacing={() => setPlacingComment(false)}
          activeThreadId={activeCommentId}
          onSelectThread={setActiveCommentId}
          seenMap={seenCommentsMap}
          onMarkSeen={markCommentSeen}
        />
        <VotingOverlay
          doc={docRef.current}
          apiRef={apiRef}
          apiReady={apiReady}
          currentAuthor={currentIdentity.name}
          reactions={elementReactions}
          voting={voting}
          activeVoters={activeVoters}
          onOpenStartVoting={() => setStartVotingOpen(true)}
          onOpenResults={() => setVotingResultsOpen(true)}
        />
        <PresenceOverlay
          apiRef={apiRef}
          apiReady={apiReady}
          liveSessionRef={liveSessionRef}
          peers={liveStatus.peers}
          currentAuthor={currentIdentity.name}
          myColor={liveSessionRef.current?.userColor.stroke ?? "#c4b550"}
          followingPeerId={followingPeerId}
          presenting={presenting}
          pingMode={pingMode}
          onCancelPingMode={() => setPingMode(false)}
          onFollowPeer={handleFollowPeer}
          broughtByBanner={broughtByBanner}
          onStopPresenting={() => setPresenting(false)}
          onRateLimitToast={setToastMessage}
        />
        <ElementRadiusControl
          containerRef={containerRef}
          selectedElements={selectedRoundableElements}
          appState={apiRef.current?.getAppState() ?? null}
          onChangeRadius={handleSetElementRadius}
        />
        <TagsOverlay
          apiRef={apiRef}
          apiReady={apiReady}
          activeTagFilter={activeTagFilter}
          showTags={showTags}
          onSelectTagFilter={setActiveTagFilter}
          onAddTag={(id, tag) => handleAddTag([id], tag)}
          onRemoveTag={(id, tag) => handleRemoveTag([id], tag)}
          onUnlinkTask={handleUnlinkTaskFromElement}
        />
        <TagSidebarSection
          containerRef={containerRef}
          selectedElements={selectedRoundableElements}
          allElements={apiRef.current?.getSceneElements() ?? []}
          appState={apiRef.current?.getAppState() ?? null}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onUnlinkTask={handleUnlinkTaskFromElement}
        />

        {/* Quick Branching Handles & Magnetic Connection Ports */}
        <BranchingOverlay
          apiRef={apiRef}
          bridgeRef={bridgeRef}
          onToast={setToastMessage}
        />

        {/* Floating Selection Alignment & Distribution Toolbar */}
        <SelectionToolbar
          apiRef={apiRef}
          bridgeRef={bridgeRef}
          onToast={setToastMessage}
        />

        {/* Dynamic Smart Alignment Guides */}
        <SmartGuidesOverlay apiRef={apiRef} />

        {/* Bottom-left dock: Radar Minimap + Notifications Stack above Excalidraw zoom/undo */}
        <div
          className={`caulk-bottom-left-dock${
            placingComment ||
            pingMode ||
            presenting ||
            Boolean(followingPeerId && broughtByBanner) ||
            voting.session?.status === "active" ||
            voting.session?.status === "ended"
              ? " raised"
              : ""
          }`}
        >
          {/* Tactical Radar Minimap HUD */}
          <Minimap
            getAppState={() => apiRef.current?.getAppState() ?? null}
            getElements={() => apiRef.current?.getSceneElements() ?? []}
            onNavigate={handleMinimapNavigate}
            onZoomToFit={handleZoomToFit}
            onResetZoom={handleResetZoom}
            onGoToOrigin={handleGoToOrigin}
            isOpen={minimapOpen}
            onToggle={toggleMinimap}
          />

          <div className="caulk-notif-stack">
          {timerPickerOpen && (
            <div className="topbar-popover">
              <div className="topbar-popover-title">Meeting Timer</div>
              <div className="topbar-popover-row">
                {[1, 3, 5, 10].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className="btn ghost"
                    style={{ padding: "4px 8px" }}
                    onClick={() => startMeetingTimer(mins)}
                  >
                    {mins}m
                  </button>
                ))}
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
                  {(presentationFrames[slideIndex] as any)?.name ||
                    (presentationFrames[slideIndex]?.customData as Record<string, unknown> | undefined)
                      ?.frameTitle as string ||
                    `Frame ${slideIndex + 1}`}
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

          {digest && <DigestBanner digest={digest} onDismiss={() => setDigest(null)} />}
          </div>
        </div>
      </div>

      <IssuesDrawer
        open={issuesDrawerOpen}
        token={getFreshToken}
        owner={session.owner}
        repo={session.repo}
        onClose={() => setIssuesDrawerOpen(false)}
        onInsertIssueCard={(issue) => {
          addIssueCard(issue);
        }}
      />

      {taskHubOpen && (
        <TaskHubModal
          tasks={tasks}
          sprints={sprints}
          milestones={milestones}
          collaborators={Array.from(collaborators.values()).map((c) => c.username).filter(Boolean) as string[]}
          repoCollaborators={repoCollaborators}
          members={members}
          customRoles={customRoles}
          currentUserName={currentIdentity.name}
          onClose={() => setTaskHubOpen(false)}
          onCreateTask={(partial, options) => {
            if (docRef.current) {
              const created = createTask(docRef.current, partial, {
                id: currentIdentity.name,
                name: currentIdentity.name,
              });
              if (options?.createSticky) {
                handleAddStickyForTask(created);
              }
            }
          }}
          onUpdateTask={(taskId, updates) => {
            if (docRef.current) {
              updateTask(docRef.current, taskId, updates, {
                id: currentIdentity.name,
                name: currentIdentity.name,
              });
              if (updates.labels && apiRef.current) {
                const elements = apiRef.current.getSceneElements();
                let changed = false;
                const next = elements.map((el) => {
                  if ((el.customData as any)?.taskId === taskId) {
                    changed = true;
                    return {
                      ...el,
                      customData: {
                        ...((el.customData as Record<string, unknown> | undefined) || {}),
                        tags: updates.labels,
                      },
                      version: el.version + 1,
                      versionNonce: Math.floor(Math.random() * 2e9),
                    };
                  }
                  return el;
                });
                if (changed) {
                  const restored = restoreElements(next, null);
                  apiRef.current.updateScene({ elements: restored as unknown as OrderedExcalidrawElement[] });
                  bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
                }
              }
            }
          }}
          onCreateSubtask={handleCreateSubtask}
          onSetMemberRole={handleSetMemberRole}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
          onSyncRepoCollaborators={handleSyncRepoCollaborators}
          onAddCustomRole={handleAddCustomRole}
          onDeleteCustomRole={handleDeleteCustomRole}
          onCreateSprint={(partial) => {
            if (docRef.current) createSprint(docRef.current, partial);
          }}
          onUpdateSprint={(sprintId, updates) => {
            if (docRef.current) updateSprint(docRef.current, sprintId, updates);
          }}
          onDeleteSprint={(sprintId) => {
            if (docRef.current) deleteSprint(docRef.current, sprintId);
          }}
          onCreateMilestone={(partial) => {
            if (docRef.current) createMilestone(docRef.current, partial);
          }}
          onUpdateMilestone={(milestoneId, updates) => {
            if (docRef.current) updateMilestone(docRef.current, milestoneId, updates);
          }}
          onDeleteMilestone={(milestoneId) => {
            if (docRef.current) deleteMilestone(docRef.current, milestoneId);
          }}
          onSelectTaskDetails={(t) => setSelectedTaskForDetails(t)}
          onAddCardToCanvas={handleAddCardToCanvas}
          onAddStickyForTask={handleAddStickyForTask}
          onJumpToCard={handleJumpToCard}
        />
      )}

      {selectedTaskForDetails && (
        <TaskDetailsModal
          task={selectedTaskForDetails}
          allTasks={tasks}
          sprints={sprints}
          milestones={milestones}
          customRoles={customRoles}
          members={members}
          collaborators={Array.from(collaborators.values()).map((c) => c.username).filter(Boolean) as string[]}
          repoCollaborators={repoCollaborators}
          currentUserName={currentIdentity.name}
          onCreateTask={(partial) => {
            if (docRef.current) {
              return createTask(docRef.current, partial, {
                id: currentIdentity.name,
                name: currentIdentity.name,
              });
            }
          }}
          onUpdateTask={(taskId, updates) => {
            if (docRef.current) {
              const updated = updateTask(docRef.current, taskId, updates, {
                id: currentIdentity.name,
                name: currentIdentity.name,
              });
              if (updated && selectedTaskForDetails.id === taskId) {
                setSelectedTaskForDetails(updated);
              }
              if (updates.labels && apiRef.current) {
                const elements = apiRef.current.getSceneElements();
                let changed = false;
                const next = elements.map((el) => {
                  if ((el.customData as any)?.taskId === taskId) {
                    changed = true;
                    return {
                      ...el,
                      customData: {
                        ...((el.customData as Record<string, unknown> | undefined) || {}),
                        tags: updates.labels,
                      },
                      version: el.version + 1,
                      versionNonce: Math.floor(Math.random() * 2e9),
                    };
                  }
                  return el;
                });
                if (changed) {
                  const restored = restoreElements(next, null);
                  apiRef.current.updateScene({ elements: restored as unknown as OrderedExcalidrawElement[] });
                  bridgeRef.current?.applyLocal(restored as readonly ExcalidrawElement[]);
                }
              }
            }
          }}
          onDeleteTask={(taskId) => {
            if (docRef.current) {
              deleteTask(docRef.current, taskId);
              if (selectedTaskForDetails.id === taskId) {
                setSelectedTaskForDetails(null);
              }
            }
          }}
          onClose={() => setSelectedTaskForDetails(null)}
          onJumpToCard={handleJumpToCard}
          onAddStickyForTask={handleAddStickyForTask}
          onAddCardToCanvas={handleAddCardToCanvas}
          onUnlinkElement={handleUnlinkTaskFromElement}
        />
      )}

      <VideoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        onInsertVideo={handleInsertVideo}
        uploadAsset={uploadVideoAsset}
      />

      <HistoryPanel
        open={historyOpen}
        snapshots={snapshots}
        activityEntries={activityEntries}
        collaborators={Array.from(collaborators.values()).map((c) => c.username).filter(Boolean) as string[]}
        loading={historyLoading}
        busy={historyBusy}
        error={historyError}
        onClose={() => setHistory(false)}
        onRefresh={() => void refreshHistory()}
        onSnapshotNow={() => void snapshotNow()}
        onRestore={(snapshot) => void restoreSnapshot(snapshot)}
        onJumpToElement={handleJumpToElement}
      />

      {/* Opaque until the board opened with our key, so cached content never shows on a locked board. */}
      {status.kind === "loading" && (
        <div className="board-cover">
          <span className="board-cover-text">Opening board…</span>
        </div>
      )}
      {status.kind === "locked" && <UnlockBoardModal onUnlock={unlockBoard} onBack={onClose} />}
      {backgroundPickerOpen && (
        <BackgroundPicker
          initialColor={viewBackgroundRef.current}
          bgImage={canvasBgConfig}
          assetStore={assetStore}
          onChangeColor={applyBoardBackground}
          onChangeBgImage={applyCanvasBackgroundImage}
          onClose={() => setBackgroundPickerOpen(false)}
        />
      )}
      {themePickerOpen && (
        <ThemePickerModal
          theme={boardTheme}
          currentCanvasBackground={currentViewBackground}
          onChange={applyBoardTheme}
          onApplyCanvasBackground={applyBoardBackground}
          onClose={() => setThemePickerOpen(false)}
        />
      )}
      <StartVotingModal
        open={startVotingOpen}
        doc={docRef.current}
        apiRef={apiRef}
        currentAuthor={currentIdentity.name}
        onStartMeetingTimer={startMeetingTimer}
        onClose={() => setStartVotingOpen(false)}
      />
      <VotingResultsModal
        open={votingResultsOpen}
        voting={voting}
        apiRef={apiRef}
        onCopyToast={setToastMessage}
        onClose={() => setVotingResultsOpen(false)}
      />
      <TemplateGalleryModal
        open={templateGalleryOpen}
        repoConfig={templateRepoConfig}
        selectedElements={(() => {
          const api = apiRef.current;
          if (!api) return [];
          const sel = api.getAppState().selectedElementIds;
          return api
            .getSceneElements()
            .filter((el) => sel[el.id] && !el.isDeleted) as unknown as TemplateElement[];
        })()}
        onSelectTemplate={insertTemplateFromGallery}
        onClose={() => setTemplateGalleryOpen(false)}
        onToast={setToastMessage}
      />
      {clusterModalOpen && (
        <ClusterModal
          allElements={apiRef.current?.getSceneElements() ?? []}
          selectedElementIds={apiRef.current?.getAppState().selectedElementIds ?? {}}
          onApply={handleApplyCluster}
          onClose={() => setClusterModalOpen(false)}
          onToast={setToastMessage}
        />
      )}
      {passwordModalOpen && (
        <ChangePasswordModal
          hasPassword={session.passphrase !== defaultPassphrase(session)}
          progress={passwordProgress}
          onSubmit={changeBoardPassword}
          onClose={() => {
            setPasswordModalOpen(false);
            setPasswordProgress(undefined);
          }}
        />
      )}

      {soundboardOpen && (
        <SoundboardModal
          clips={soundboardClips}
          currentUserName={currentIdentity.name}
          onClose={() => setSoundboardOpen(false)}
          onAddClip={(clip) => {
            if (docRef.current) {
              addSoundboardClip(docRef.current, clip);
            }
          }}
          onUpdateClip={(id, updates) => {
            if (docRef.current) {
              updateSoundboardClip(docRef.current, id, updates);
            }
          }}
          onDeleteClip={(id) => {
            if (docRef.current) {
              deleteSoundboardClip(docRef.current, id);
            }
          }}
          onTriggerClip={(clip) => {
            if (docRef.current) {
              triggerSoundboardClip(docRef.current, clip, currentIdentity.name);
            }
          }}
        />
      )}

      {soundboardBroadcastToast && (
        <div className="soundboard-broadcast-toast">
          <span style={{ fontSize: 18 }}>{soundboardBroadcastToast.icon}</span>
          <span>
            <strong>{soundboardBroadcastToast.user}</strong> played <em>{soundboardBroadcastToast.name}</em>
          </span>
        </div>
      )}

      {/* Frame Outline & Table of Contents Drawer */}
      <FrameNavigator
        frames={allFrames}
        allElements={apiRef.current?.getSceneElements() ?? []}
        onSelectFrame={handleSelectFrame}
        onAddFrame={addFrame}
        onRenameFrame={handleRenameFrame}
        isOpen={frameNavigatorOpen}
        onClose={() => setFrameNavigatorOpen(false)}
      />

      {/* Spatial Camera Waypoints Quick Bar Dock */}
      {Object.keys(waypoints).length > 0 && (
        <div className="caulk-waypoints-dock">
          <span className="caulk-waypoints-label">📍 WAYPOINTS:</span>
          {Object.entries(waypoints)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([slot, wp]) => (
              <button
                key={slot}
                type="button"
                className="caulk-waypoint-chip"
                title={`Jump to ${wp.name} (Alt+${slot})`}
                onClick={() => jumpToWaypoint(slot)}
              >
                <span className="slot-num">{slot}</span>
                <span className="slot-name">{wp.name}</span>
              </button>
            ))}
        </div>
      )}

      {/* Multiplayer Scoreboard / Connected Operators Roster [TAB] */}
      <PlayerListModal
        currentUserName={currentIdentity.name}
        myColor={liveSessionRef.current?.userColor.stroke ?? "#4157ff"}
        isLeader={isElectedSaver(liveStatus.connected, liveStatus.clientId, liveStatus.peerClientIds)}
        peers={liveStatus.peers}
        followingPeerId={followingPeerId}
        onFollowPeer={(id) => setFollowingPeerId(id)}
        onJumpToPeer={handleJumpToPeer}
        boardName={label}
        roomName={liveRoomName || storageLabel}
        isOpen={playerListOpen}
        onClose={() => setPlayerListOpen(false)}
        localViewport={(() => {
          const s = apiRef.current?.getAppState();
          return s ? { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value } : null;
        })()}
      />

      <StatusBar
        status={status}
        liveStatus={liveStatus}
        lastPollAt={engineRef.current?.lastPolledAt ?? 0}
        remoteEdits={remoteEdits}
        pendingUploads={pendingUploads}
        rateLimit={rateLimit}
        label={storageLabel}
        busy={busy}
        historyOpen={historyOpen}
        activityCount={activityEntries.length}
        onHistory={() => setHistory(!historyOpen)}
        onSaveNow={() => void engineRef.current?.saveNow()}
        onPullNow={() => void engineRef.current?.pullNow()}
        onClose={onClose}
      />
    </div>
  );
}
