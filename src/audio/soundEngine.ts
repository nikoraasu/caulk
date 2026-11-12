/**
 * Retro & Themed Sound Effects Engine for Caulk.
 * Uses authentic recorded audio clips from classic operating systems and games:
 *   - vgui: Authentic Half-Life / Valve GoldSrc & Source UI (buttonrollover, buttonclickrelease, item pickups, FVOX bell)
 *   - windows-xp: Authentic 2001 Windows XP (Navigation Start, Balloon notification, Ding, Recycle)
 *   - frutiger: Resonant water droplets, aquatic pops, and crystal glass bells
 *   - mac-os9: Authentic Apple Mac OS 9 Platinum (Tink, Pop, Bottle, Sosumi)
 *   - win95: Authentic Redmond 1995 (Ding, Chord, Chimes, Tada)
 *   - dos: Authentic IBM PC speaker 8253 PIT square-wave hardware synthesis
 */

export type SoundEvent =
  | "hover"
  | "click"
  | "create"
  | "delete"
  | "ping"
  | "vote"
  | "cluster"
  | "alert";

export type SoundPack =
  | "auto"
  | "vgui"
  | "windows-xp"
  | "frutiger"
  | "mac-os9"
  | "win95"
  | "dos";

export type SoundConfig = {
  enabled: boolean;
  volume: number; // 0.0 - 1.0
  pack: SoundPack;
};

const STORAGE_KEY_ENABLED = "caulk.sound_enabled.v1";
const STORAGE_KEY_VOLUME = "caulk.sound_volume.v1";
const STORAGE_KEY_PACK = "caulk.sound_pack.v1";

// Embedded base64 for the two most frequent VGUI sounds so Half-Life buttonrollover
// and buttonclickrelease play instantly without waiting for any network request.
const VGUI_HOVER_B64 =
  "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";

const VGUI_CLICK_B64 =
  "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";

let sharedCtx: AudioContext | null = null;
let sharedMasterGain: GainNode | null = null;
let lastHoverTime = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      sharedCtx = new AudioCtx();
    }
    if (sharedCtx.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function getMasterGain(ctx: AudioContext, volume: number): GainNode | null {
  try {
    if (!sharedMasterGain || sharedMasterGain.context !== ctx) {
      sharedMasterGain = ctx.createGain();
      sharedMasterGain.connect(ctx.destination);
    }
    sharedMasterGain.gain.setValueAtTime(volume, ctx.currentTime);
    return sharedMasterGain;
  } catch {
    return null;
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

class SoundEngine {
  private enabled: boolean;
  private volume: number;
  private pack: SoundPack;
  private activeThemePreset: string = "vgui";

  // Cache for decoded AudioBuffers keyed by "pack/event"
  private bufferCache = new Map<string, AudioBuffer>();
  private pendingLoads = new Map<string, Promise<AudioBuffer | null>>();

  constructor() {
    if (typeof window !== "undefined") {
      const storedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);
      this.enabled = storedEnabled !== null ? storedEnabled === "true" : true;

      const storedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      this.volume = storedVol !== null ? Math.max(0, Math.min(1, Number(storedVol))) : 0.45;

      const storedPack = localStorage.getItem(STORAGE_KEY_PACK) as SoundPack | null;
      this.pack = storedPack || "auto";

      // On first user interaction, ensure audio context is ready and preload current pack
      const onFirstGesture = () => {
        window.removeEventListener("pointerdown", onFirstGesture);
        window.removeEventListener("keydown", onFirstGesture);
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        this.preloadPack();
      };
      window.addEventListener("pointerdown", onFirstGesture, { passive: true, once: true });
      window.addEventListener("keydown", onFirstGesture, { passive: true, once: true });
    } else {
      this.enabled = true;
      this.volume = 0.45;
      this.pack = "auto";
    }
  }

  public setActiveThemePreset(preset: string): void {
    if (this.activeThemePreset === preset) return;
    this.activeThemePreset = preset;
    if (typeof window !== "undefined") {
      this.preloadPack();
    }
  }

  public getConfig(): SoundConfig {
    return {
      enabled: this.enabled,
      volume: this.volume,
      pack: this.pack,
    };
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(this.volume));
      const ctx = getAudioContext();
      if (ctx && sharedMasterGain) {
        sharedMasterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
      }
    }
  }

  public setSoundPack(pack: SoundPack): void {
    this.pack = pack;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_PACK, pack);
      this.preloadPack(pack);
    }
  }

  public resolveEffectivePack(): SoundPack {
    if (this.pack !== "auto") return this.pack;
    const p = this.activeThemePreset.toLowerCase();
    if (p.includes("xp")) return "windows-xp";
    if (p.includes("glacier") || p.includes("aqua") || p.includes("aero") || p.includes("dorfic")) {
      return "frutiger";
    }
    if (p.includes("mac") || p.includes("os9")) return "mac-os9";
    if (p.includes("win95") || p.includes("win98") || p.includes("classic")) return "win95";
    if (p.includes("dos") || p.includes("tui")) return "dos";
    return "vgui";
  }

  /**
   * Preload audio clips for a pack in background.
   */
  public preloadPack(forcePack?: SoundPack): void {
    if (typeof window === "undefined") return;
    const pack = forcePack || this.resolveEffectivePack();
    if (pack === "dos") return;

    const events: SoundEvent[] = [
      "hover",
      "click",
      "create",
      "delete",
      "ping",
      "vote",
      "cluster",
      "alert",
    ];
    for (const ev of events) {
      this.loadBuffer(pack, ev).catch(() => {});
    }
  }

  /**
   * Load and decode an AudioBuffer for a (pack, event) pair.
   */
  private async loadBuffer(pack: SoundPack, event: SoundEvent): Promise<AudioBuffer | null> {
    if (pack === "dos") return null;
    const key = `${pack}/${event}`;

    const cached = this.bufferCache.get(key);
    if (cached) return cached;

    const pending = this.pendingLoads.get(key);
    if (pending) return pending;

    const ctx = getAudioContext();
    if (!ctx) return null;

    const promise = (async () => {
      try {
        // Fast-path: VGUI hover and click are embedded directly as base64
        if (pack === "vgui" && event === "hover") {
          const buf = await ctx.decodeAudioData(base64ToArrayBuffer(VGUI_HOVER_B64));
          this.bufferCache.set(key, buf);
          return buf;
        }
        if (pack === "vgui" && event === "click") {
          const buf = await ctx.decodeAudioData(base64ToArrayBuffer(VGUI_CLICK_B64));
          this.bufferCache.set(key, buf);
          return buf;
        }

        // Fetch from /sounds/${pack}/${event}.mp3
        const baseUrl =
          typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
            ? import.meta.env.BASE_URL
            : "/";
        const cleanBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
        const url = `${cleanBase}sounds/${pack}/${event}.mp3`;

        const res = await fetch(url);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.bufferCache.set(key, audioBuf);
        return audioBuf;
      } catch {
        return null;
      } finally {
        this.pendingLoads.delete(key);
      }
    })();

    this.pendingLoads.set(key, promise);
    return promise;
  }

  /**
   * Plays an AudioBuffer through the shared master gain node.
   */
  private playBuffer(ctx: AudioContext, buffer: AudioBuffer): void {
    try {
      const masterGain = getMasterGain(ctx, this.volume);
      if (!masterGain) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGain);
      source.onended = () => {
        try {
          source.disconnect();
        } catch {}
      };
      source.start(0);
    } catch {
      /* Handled silently if audio context is blocked */
    }
  }

  /**
   * Main entrypoint to trigger sound effects across the application.
   */
  public play(event: SoundEvent, forcePack?: SoundPack): void {
    if (!this.enabled && !forcePack) return;
    if (this.volume <= 0 && !forcePack) return;

    if (event === "hover") {
      const now = Date.now();
      if (now - lastHoverTime < 75) return;
      lastHoverTime = now;
    }

    try {
      const pack = forcePack || this.resolveEffectivePack();
      const ctx = getAudioContext();
      if (!ctx) return;

      // Authentic DOS 8253 PIT PC Speaker Square Wave Synthesis
      if (pack === "dos") {
        const master = getMasterGain(ctx, this.volume);
        if (master) this.playDOS(ctx, master, event);
        return;
      }

      const key = `${pack}/${event}`;
      const cached = this.bufferCache.get(key);

      if (cached) {
        this.playBuffer(ctx, cached);
      } else {
        // Asynchronously load buffer and play as soon as decoded
        this.loadBuffer(pack, event).then((buf) => {
          if (buf) {
            this.playBuffer(ctx, buf);
          } else {
            // Fallback to procedural synthesis if fetch is unavailable
            const master = getMasterGain(ctx, this.volume);
            if (master) this.playProceduralFallback(ctx, master, pack, event);
          }
        });
      }
    } catch {
      /* Ignore audio initialization errors */
    }
  }

  /* ---------------- DOS PC Speaker Sound Synthesis ---------------- */
  private playDOS(ctx: AudioContext, dest: GainNode, event: SoundEvent): void {
    const t = ctx.currentTime;

    if (event === "hover") {
      this.playTone(ctx, dest, 1200, t, 0.006, 0.08, "square");
    } else if (event === "click") {
      this.playTone(ctx, dest, 800, t, 0.015, 0.18, "square");
    } else if (event === "create" || event === "vote") {
      this.playTone(ctx, dest, 440, t, 0.035, 0.25, "square");
      this.playTone(ctx, dest, 880, t + 0.04, 0.05, 0.28, "square");
    } else if (event === "delete") {
      this.playTone(ctx, dest, 140, t, 0.05, 0.25, "square");
    } else if (event === "ping" || event === "alert") {
      this.playTone(ctx, dest, 1000, t, 0.12, 0.35, "square");
    } else if (event === "cluster") {
      this.playTone(ctx, dest, 500, t, 0.03, 0.2, "square");
      this.playTone(ctx, dest, 700, t + 0.04, 0.03, 0.2, "square");
      this.playTone(ctx, dest, 900, t + 0.08, 0.06, 0.25, "square");
    }
  }

  /* Procedural fallback when audio asset files cannot be reached */
  private playProceduralFallback(
    ctx: AudioContext,
    dest: GainNode,
    _pack: SoundPack,
    event: SoundEvent,
  ): void {
    const t = ctx.currentTime;
    if (event === "hover") {
      this.playTone(ctx, dest, 2400, t, 0.012, 0.15, "sine");
    } else if (event === "click") {
      this.playTone(ctx, dest, 900, t, 0.025, 0.25, "triangle");
    } else if (event === "create" || event === "vote") {
      this.playTone(ctx, dest, 880, t, 0.06, 0.25, "sine");
      this.playTone(ctx, dest, 1320, t + 0.05, 0.1, 0.3, "sine");
    } else if (event === "delete") {
      this.playTone(ctx, dest, 280, t, 0.04, 0.2, "sawtooth");
    } else if (event === "ping" || event === "alert") {
      this.playTone(ctx, dest, 1046.5, t, 0.12, 0.3, "sine");
    } else if (event === "cluster") {
      this.playTone(ctx, dest, 523.25, t, 0.08, 0.2, "sine");
      this.playTone(ctx, dest, 659.25, t + 0.05, 0.1, 0.25, "sine");
      this.playTone(ctx, dest, 783.99, t + 0.1, 0.15, 0.28, "sine");
    }
  }

  /* Helper to synthesize a pure tone */
  private playTone(
    ctx: AudioContext,
    dest: GainNode,
    freq: number,
    startTime: number,
    duration: number,
    gainLevel: number,
    type: OscillatorType = "sine",
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(gainLevel, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }
}

export const soundEngine = new SoundEngine();
