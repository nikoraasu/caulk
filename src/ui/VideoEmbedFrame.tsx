import { useEffect, useRef, useState, type ReactNode } from "react";
import { assetObjectUrl, parseAssetRef, type AssetStore } from "../storage/assets";

type EmbedTarget =
  | { kind: "asset"; title: string; badge: string }
  | {
      kind: "iframe";
      title: string;
      badge?: string;
      src: string;
      allow?: string;
      externalUrl?: string;
    }
  | {
      kind: "video";
      title: string;
      badge: string;
      src: string;
      externalUrl?: string;
    };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function hostBadge(link: string): string | undefined {
  try {
    return new URL(link).hostname.replace(/^www\./i, "").toUpperCase();
  } catch {
    return undefined;
  }
}

function directVideoBadge(link: string): string {
  const mimeMatch = link.match(/^data:video\/([a-z0-9.+-]+)/i);
  if (mimeMatch?.[1]) return mimeMatch[1].toUpperCase();
  const extMatch = link.match(/\.(mp4|webm|ogg|mov)(?:\?.*)?$/i);
  return extMatch?.[1] ? extMatch[1].toUpperCase() : "CLIP";
}

function resolveEmbedTarget(link: string): EmbedTarget {
  if (parseAssetRef(link)) {
    return { kind: "asset", title: "Video Clip", badge: "ENCRYPTED" };
  }

  const ytMatch = link.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  );
  if (ytMatch?.[1]) {
    return {
      kind: "iframe",
      title: "YouTube",
      badge: "VIDEO",
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      externalUrl: link,
    };
  }

  const vimeoMatch = link.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch?.[1]) {
    return {
      kind: "iframe",
      title: "Vimeo",
      badge: "VIDEO",
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      allow: "autoplay; fullscreen; picture-in-picture",
      externalUrl: link,
    };
  }

  const loomMatch = link.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loomMatch?.[1]) {
    return {
      kind: "iframe",
      title: "Loom",
      badge: "VIDEO",
      src: `https://www.loom.com/embed/${loomMatch[1]}`,
      externalUrl: link,
    };
  }

  const gdriveMatch = link.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gdriveMatch?.[1]) {
    return {
      kind: "iframe",
      title: "Google Drive",
      badge: "VIDEO",
      src: `https://drive.google.com/file/d/${gdriveMatch[1]}/preview`,
      externalUrl: link,
    };
  }

  if (link.startsWith("data:video/") || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(link)) {
    return {
      kind: "video",
      title: "Video Player",
      badge: directVideoBadge(link),
      src: link,
      externalUrl: /^https?:\/\//i.test(link) ? link : undefined,
    };
  }

  return {
    kind: "iframe",
    title: "Web Embed",
    badge: hostBadge(link),
    src: link,
    externalUrl: /^https?:\/\//i.test(link) ? link : undefined,
  };
}

/** Steam VGUI window shell shared by all embedded board videos. */
export function VguiVideoFrame({
  title,
  badge,
  externalUrl,
  children,
}: {
  title: string;
  badge?: string;
  externalUrl?: string;
  children: ReactNode;
}) {
  return (
    <div className="vgui-video-window">
      <div className="vgui-video-titlebar">
        <div className="vgui-video-title-left">
          <span className="vgui-video-lambda">λ</span>
          <span className="vgui-video-title">{title}</span>
          {badge && <span className="vgui-video-badge">{badge}</span>}
        </div>
        <div className="vgui-video-title-actions">
          {externalUrl && /^https?:\/\//i.test(externalUrl) && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vgui-video-winbtn"
              title="Open source video in new tab"
              aria-label="Open source video in new tab"
            >
              ↗
            </a>
          )}
        </div>
      </div>
      <div className="vgui-video-viewport">{children}</div>
    </div>
  );
}

/** Custom Steam VGUI transport player for uploaded encrypted clips and direct video URLs. */
function VguiVideoPlayer({
  src,
  loading = false,
  failed = false,
}: {
  src: string | null;
  loading?: boolean;
  failed?: boolean;
}) {
  const playerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setMediaError(false);
  }, [src]);

  const isUnavailable = failed || mediaError;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !src || isUnavailable) return;
    if (v.paused || v.ended) {
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const host = playerRef.current;
    const v = videoRef.current;
    if (document.fullscreenElement === host) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (host?.requestFullscreen) {
      void host.requestFullscreen().catch(() => v?.requestFullscreen?.());
    } else if (v?.requestFullscreen) {
      void v.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div ref={playerRef} className="vgui-player">
      <div className="vgui-player-screen" onClick={togglePlay}>
        {isUnavailable ? (
          <span className="vgui-video-status error">Video unavailable</span>
        ) : loading || !src ? (
          <span className="vgui-video-status">Loading video…</span>
        ) : (
          <>
            <video
              ref={videoRef}
              src={src}
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) setDuration(d);
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
              onError={() => setMediaError(true)}
              className="vgui-player-video"
            />
            {!playing && (
              <button
                type="button"
                className="vgui-player-overlay-play"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                aria-label="Play video"
                title="Play video"
              >
                ▶
              </button>
            )}
          </>
        )}
      </div>

      <div className="vgui-player-controls">
        <button
          type="button"
          className="vgui-video-winbtn transport"
          onClick={togglePlay}
          disabled={!src || isUnavailable}
          title={playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <span className="vgui-player-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          className="vgui-player-seek"
          min={0}
          max={duration > 0 ? duration : 0}
          step={0.1}
          value={Math.min(currentTime, duration > 0 ? duration : 0)}
          disabled={!src || isUnavailable || duration <= 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = next;
            setCurrentTime(next);
          }}
          style={{
            background: `linear-gradient(90deg, var(--vgui-accent) 0%, var(--vgui-accent) ${pct}%, var(--vgui-base) ${pct}%, var(--vgui-base) 100%)`,
          }}
          aria-label="Seek video"
        />

        <button
          type="button"
          className="vgui-video-winbtn transport"
          onClick={toggleMute}
          disabled={!src || isUnavailable}
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </button>

        <button
          type="button"
          className="vgui-video-winbtn transport"
          onClick={toggleFullscreen}
          disabled={!src || isUnavailable}
          title="Fullscreen"
          aria-label="Fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  );
}

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

  return <VguiVideoPlayer src={src} loading={!src && !failed} failed={failed} />;
}

/** Renders an Excalidraw embeddable link/asset inside a Steam VGUI window frame. */
export function VideoEmbedFrame({
  link,
  assetStore,
}: {
  link: string;
  assetStore: AssetStore;
}) {
  try {
    const target = resolveEmbedTarget(link);

    if (target.kind === "asset") {
      return (
        <VguiVideoFrame title={target.title} badge={target.badge}>
          <AssetVideo store={assetStore} reference={link} />
        </VguiVideoFrame>
      );
    }

    if (target.kind === "video") {
      return (
        <VguiVideoFrame title={target.title} badge={target.badge} externalUrl={target.externalUrl}>
          <VguiVideoPlayer src={target.src} />
        </VguiVideoFrame>
      );
    }

    return (
      <VguiVideoFrame title={target.title} badge={target.badge} externalUrl={target.externalUrl}>
        <iframe
          src={target.src}
          className="vgui-video-iframe"
          allow={target.allow}
          allowFullScreen
          title={target.title}
        />
      </VguiVideoFrame>
    );
  } catch (err) {
    console.error("VideoEmbedFrame error:", err);
    return (
      <VguiVideoFrame title="Video" badge="ERROR">
        <div className="vgui-player-screen">
          <span className="vgui-video-status error">Unable to preview video</span>
        </div>
      </VguiVideoFrame>
    );
  }
}
