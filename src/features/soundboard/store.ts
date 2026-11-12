import type * as Y from "yjs";
import type { SoundboardClip, SoundboardTrigger } from "./types";

export const SOUNDBOARD_MAP_KEY = "soundboard";
export const SOUNDBOARD_TRIGGER_MAP_KEY = "soundboard_triggers";

/* ==========================================================================
   WAV Encoding & Audio Buffer Slicing Utilities
   ========================================================================== */

/** Converts an AudioBuffer slice to a 16-bit mono PCM WAV Base64 data URL */
export function encodeAudioBufferToWav(
  buffer: AudioBuffer,
  startTime = 0,
  endTime = buffer.duration,
): string {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(buffer.length, Math.floor(endTime * sampleRate));
  const numSamples = Math.max(1, endSample - startSample);

  // Mix down channels to mono if multiple
  const channelData = buffer.getChannelData(0);
  const isStereo = buffer.numberOfChannels > 1;
  const rightChannelData = isStereo ? buffer.getChannelData(1) : null;

  const dataLength = numSamples * 2; // 16-bit = 2 bytes per sample
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF Chunk Descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // "fmt " Sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate (sampleRate * numChannels * bitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (numChannels * bitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // "data" Sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Write PCM 16-bit audio samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const idx = startSample + i;
    let sample = channelData[idx] || 0;
    if (rightChannelData) {
      sample = (sample + (rightChannelData[idx] || 0)) * 0.5;
    }
    // Clamp to [-1.0, 1.0]
    const clamped = Math.max(-1, Math.min(1, sample));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  // Convert ArrayBuffer to Base64
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/* ==========================================================================
   Procedural Built-in Preset Sounds Generator
   ========================================================================== */

let cachedPresetClips: SoundboardClip[] | null = null;

export function getBuiltInPresetClips(): SoundboardClip[] {
  if (cachedPresetClips) return cachedPresetClips;

  const sampleRate = 22050;

  const createSynthWav = (duration: number, synth: (t: number) => number): string => {
    const numSamples = Math.floor(duration * sampleRate);
    const dataLength = numSamples * 2;
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const s = Math.max(-1, Math.min(1, synth(t)));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  };

  // 1. Airhorn (Triple MLG Horn Blast)
  const airhornData = createSynthWav(1.1, (t) => {
    // 3 short burst pulses at 0.0s, 0.35s, 0.7s
    const pulseIdx = Math.floor(t / 0.35);
    const pulseT = t % 0.35;
    if (pulseT > 0.28 || pulseIdx > 2) return 0;
    const env = Math.exp(-pulseT * 2.5) * (1 - Math.exp(-pulseT * 40));
    // Dissonant multi-tone frequencies: 466Hz (Bb4) + 622Hz (Eb5) + 700Hz
    const osc1 = Math.sin(2 * Math.PI * 466 * pulseT);
    const osc2 = Math.sin(2 * Math.PI * 622 * pulseT);
    const osc3 = Math.sin(2 * Math.PI * 700 * pulseT);
    const buzz = Math.sin(2 * Math.PI * 932 * pulseT) * 0.4;
    return (osc1 * 0.35 + osc2 * 0.35 + osc3 * 0.2 + buzz) * env * 0.9;
  });

  // 2. Ba-Dum-Tss (Comedy Rimshot)
  const badumData = createSynthWav(1.2, (t) => {
    // "Ba" at 0.0s, "Dum" at 0.22s, "Tss" at 0.44s
    if (t < 0.2) {
      const kickT = t;
      const kickEnv = Math.exp(-kickT * 18);
      const freq = 140 * Math.exp(-kickT * 30) + 50;
      return Math.sin(2 * Math.PI * freq * kickT) * kickEnv * 0.9;
    } else if (t < 0.42) {
      const snareT = t - 0.22;
      const snareEnv = Math.exp(-snareT * 15);
      const noise = (Math.random() * 2 - 1) * 0.6;
      const tone = Math.sin(2 * Math.PI * 180 * snareT) * 0.4;
      return (noise + tone) * snareEnv * 0.8;
    } else {
      const crashT = t - 0.44;
      const crashEnv = Math.exp(-crashT * 4.5);
      const noise = (Math.random() * 2 - 1) * 0.8;
      const shimmer = Math.sin(2 * Math.PI * 3400 * crashT) * 0.2;
      return (noise + shimmer) * crashEnv * 0.7;
    }
  });

  // 3. Level Up (Ascending RPG Arpeggio)
  const levelUpData = createSynthWav(0.85, (t) => {
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51]; // A C# E A C# E
    const noteIdx = Math.min(notes.length - 1, Math.floor(t / 0.12));
    const noteT = t % 0.12;
    const env = Math.exp(-noteT * 7);
    const freq = notes[noteIdx];
    return Math.sin(2 * Math.PI * freq * noteT) * env * 0.75;
  });

  // 4. Victory (Heroic Brass Fanfare)
  const victoryData = createSynthWav(1.3, (t) => {
    const notes = [523.25, 523.25, 523.25, 659.25, 783.99, 1046.5];
    const times = [0, 0.16, 0.32, 0.48, 0.7, 0.95];
    let activeIdx = 0;
    for (let i = 0; i < times.length; i++) {
      if (t >= times[i]) activeIdx = i;
    }
    const noteT = t - times[activeIdx];
    const env = Math.exp(-noteT * (activeIdx === 5 ? 2.5 : 8));
    const freq = notes[activeIdx];
    const brass = Math.sin(2 * Math.PI * freq * noteT) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * noteT) * 0.3;
    return brass * env * 0.8;
  });

  // 5. Quack (Funny Rubber Duck)
  const quackData = createSynthWav(0.55, (t) => {
    const env = Math.exp(-t * 6) * (1 - Math.exp(-t * 30));
    const formant = Math.sin(2 * Math.PI * (450 - t * 180) * t);
    const nasal = Math.sin(2 * Math.PI * (900 - t * 350) * t) * 0.5;
    return (formant + nasal) * env * 0.8;
  });

  // 6. Ding (Crystal Notification Bell)
  const dingData = createSynthWav(0.9, (t) => {
    const env = Math.exp(-t * 4);
    const bell1 = Math.sin(2 * Math.PI * 1760 * t);
    const bell2 = Math.sin(2 * Math.PI * 3520 * t) * 0.3;
    return (bell1 + bell2) * env * 0.8;
  });

  // 7. Applause (Crowd Cheer & Claps)
  const applauseData = createSynthWav(1.4, (t) => {
    const env = Math.min(1, t * 4) * Math.exp(-Math.max(0, t - 0.7) * 3);
    const noise = (Math.random() * 2 - 1) * 0.45;
    // Rhythmic pops
    const popRate = Math.sin(2 * Math.PI * 14 * t);
    const pop = popRate > 0.7 ? (Math.random() * 2 - 1) * 0.4 : 0;
    return (noise + pop) * env * 0.85;
  });

  // 8. Bruh / Fail (Descending Dramatic Slide)
  const bruhData = createSynthWav(0.75, (t) => {
    const env = Math.exp(-t * 3.5);
    const freq = Math.max(50, 160 - t * 110);
    const osc = Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3;
    return osc * env * 0.85;
  });

  cachedPresetClips = [
    {
      id: "preset-airhorn",
      name: "Airhorn",
      icon: "📢",
      color: "#e53e3e",
      audioData: airhornData,
      duration: 1.1,
      startTime: 0,
      endTime: 1.1,
      hotkey: "1",
      isPreset: true,
      createdAt: 1000,
    },
    {
      id: "preset-badum",
      name: "Ba-Dum-Tss",
      icon: "🥁",
      color: "#dd6b20",
      audioData: badumData,
      duration: 1.2,
      startTime: 0,
      endTime: 1.2,
      hotkey: "2",
      isPreset: true,
      createdAt: 1001,
    },
    {
      id: "preset-levelup",
      name: "Level Up",
      icon: "⚡",
      color: "#c59c3a",
      audioData: levelUpData,
      duration: 0.85,
      startTime: 0,
      endTime: 0.85,
      hotkey: "3",
      isPreset: true,
      createdAt: 1002,
    },
    {
      id: "preset-victory",
      name: "Victory",
      icon: "🏆",
      color: "#48bb78",
      audioData: victoryData,
      duration: 1.3,
      startTime: 0,
      endTime: 1.3,
      hotkey: "4",
      isPreset: true,
      createdAt: 1003,
    },
    {
      id: "preset-quack",
      name: "Quack",
      icon: "🦆",
      color: "#319795",
      audioData: quackData,
      duration: 0.55,
      startTime: 0,
      endTime: 0.55,
      hotkey: "5",
      isPreset: true,
      createdAt: 1004,
    },
    {
      id: "preset-ding",
      name: "Bell Ding",
      icon: "🔔",
      color: "#3182ce",
      audioData: dingData,
      duration: 0.9,
      startTime: 0,
      endTime: 0.9,
      hotkey: "6",
      isPreset: true,
      createdAt: 1005,
    },
    {
      id: "preset-applause",
      name: "Applause",
      icon: "👏",
      color: "#805ad5",
      audioData: applauseData,
      duration: 1.4,
      startTime: 0,
      endTime: 1.4,
      hotkey: "7",
      isPreset: true,
      createdAt: 1006,
    },
    {
      id: "preset-fail",
      name: "Fail / Bruh",
      icon: "💀",
      color: "#718096",
      audioData: bruhData,
      duration: 0.75,
      startTime: 0,
      endTime: 0.75,
      hotkey: "8",
      isPreset: true,
      createdAt: 1007,
    },
  ];

  return cachedPresetClips;
}

/* ==========================================================================
   CRDT Store Operations
   ========================================================================== */

export function getSoundboardMap(doc: Y.Doc): Y.Map<SoundboardClip> {
  return doc.getMap<SoundboardClip>(SOUNDBOARD_MAP_KEY);
}

export function getSoundboardTriggerMap(doc: Y.Doc): Y.Map<SoundboardTrigger> {
  return doc.getMap<SoundboardTrigger>(SOUNDBOARD_TRIGGER_MAP_KEY);
}

export function listSoundboardClips(doc: Y.Doc): SoundboardClip[] {
  const map = getSoundboardMap(doc);
  if (map.size === 0) {
    // Seed default starter sound clips
    const presets = getBuiltInPresetClips();
    doc.transact(() => {
      for (const p of presets) {
        map.set(p.id, p);
      }
    });
  }
  return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export function getSoundboardClip(doc: Y.Doc, id: string): SoundboardClip | undefined {
  const map = getSoundboardMap(doc);
  const found = map.get(id);
  if (found) return found;
  return getBuiltInPresetClips().find((p) => p.id === id);
}

export function addSoundboardClip(
  doc: Y.Doc,
  clip: Omit<SoundboardClip, "id" | "createdAt">,
): SoundboardClip {
  const map = getSoundboardMap(doc);
  // Ensure presets are loaded first
  if (map.size === 0) {
    listSoundboardClips(doc);
  }
  const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const record: SoundboardClip = {
    ...clip,
    id,
    createdAt: Date.now(),
  };
  map.set(id, record);
  return record;
}

export function updateSoundboardClip(
  doc: Y.Doc,
  id: string,
  updates: Partial<SoundboardClip>,
): void {
  const map = getSoundboardMap(doc);
  const existing = map.get(id);
  if (!existing) return;
  map.set(id, { ...existing, ...updates });
}

export function deleteSoundboardClip(doc: Y.Doc, id: string): void {
  const map = getSoundboardMap(doc);
  map.delete(id);
}

export function triggerSoundboardClip(
  doc: Y.Doc,
  clip: SoundboardClip,
  user: string,
): void {
  const triggerMap = getSoundboardTriggerMap(doc);
  const trigger: SoundboardTrigger = {
    id: `trig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    clipId: clip.id,
    name: clip.name,
    icon: clip.icon,
    user: user || "Someone",
    timestamp: Date.now(),
  };
  triggerMap.set("latest", trigger);
}

export function subscribeToSoundboardClips(
  doc: Y.Doc,
  callback: (clips: SoundboardClip[]) => void,
): () => void {
  const map = getSoundboardMap(doc);
  const listener = () => {
    callback(listSoundboardClips(doc));
  };
  map.observe(listener);
  callback(listSoundboardClips(doc));
  return () => {
    map.unobserve(listener);
  };
}

export function subscribeToSoundboardTriggers(
  doc: Y.Doc,
  callback: (trigger: SoundboardTrigger) => void,
): () => void {
  const map = getSoundboardTriggerMap(doc);
  const listener = (event: Y.YMapEvent<SoundboardTrigger>) => {
    if (event.keysChanged.has("latest")) {
      const trig = map.get("latest");
      if (trig && Date.now() - trig.timestamp < 4000) {
        callback(trig);
      }
    }
  };
  map.observe(listener);
  return () => {
    map.unobserve(listener);
  };
}

/* ==========================================================================
   Soundboard Playback Engine (Web Audio API)
   ========================================================================== */

let sharedAudioCtx: AudioContext | null = null;
function getSharedAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (Ctx) sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

const audioBufferCache = new Map<string, AudioBuffer>();

export async function playSoundboardClip(
  clip?: { audioData?: string; startTime?: number; endTime?: number } | null,
  volume = 1.0,
): Promise<void> {
  if (!clip || !clip.audioData) return;
  const ctx = getSharedAudioCtx();
  if (!ctx) return;

  try {
    let buffer = audioBufferCache.get(clip.audioData);
    if (!buffer) {
      // Decode base64 data URL to ArrayBuffer
      const commaIdx = clip.audioData.indexOf(",");
      const b64 = commaIdx >= 0 ? clip.audioData.slice(commaIdx + 1) : clip.audioData;
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      audioBufferCache.set(clip.audioData, buffer);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(Math.max(0, Math.min(1.5, volume)), ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // If clip has startTime/endTime defined within the buffer
    const offset = Math.max(0, clip.startTime || 0);
    const duration = clip.endTime && clip.endTime > offset ? clip.endTime - offset : undefined;

    source.start(0, offset, duration);
  } catch (err) {
    console.warn("[Soundboard] playback failed:", err);
  }
}
