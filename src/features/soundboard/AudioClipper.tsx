import { useState, useRef, useEffect, useCallback } from "react";
import {
  POPULAR_SOUNDBOARD_ICONS,
  RETRO_CLIP_COLORS,
  type SoundboardClip,
} from "./types";
import { encodeAudioBufferToWav } from "./store";

type Props = {
  initialClip?: Partial<SoundboardClip>;
  onSave: (clip: Omit<SoundboardClip, "id" | "createdAt">) => void;
  onCancel: () => void;
};

export function AudioClipper({ initialClip, onSave, onCancel }: Props) {
  const [name, setName] = useState(initialClip?.name || "");
  const [icon, setIcon] = useState(initialClip?.icon || "📢");
  const [color, setColor] = useState(initialClip?.color || RETRO_CLIP_COLORS[0]);
  const [hotkey, setHotkey] = useState<string>(initialClip?.hotkey || "");

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(initialClip?.duration || 0);
  const [startTime, setStartTime] = useState(initialClip?.startTime || 0);
  const [endTime, setEndTime] = useState(initialClip?.endTime || 0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Compute waveform peaks for visual display
  const computeWaveform = (buf: AudioBuffer) => {
    const channel = buf.getChannelData(0);
    const numBars = 80;
    const step = Math.floor(channel.length / numBars);
    const peaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(channel.length, start + step);
      for (let j = start; j < end; j++) {
        const val = Math.abs(channel[j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }
    setWaveformPeaks(peaks);
  };

  // Decode array buffer
  const decodeAndLoadAudio = async (arrayBuffer: ArrayBuffer, defaultName?: string) => {
    try {
      setErrorMessage(null);
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      setDuration(decoded.duration);
      setStartTime(0);
      setEndTime(Math.min(10, decoded.duration));
      computeWaveform(decoded);
      if (!name && defaultName) {
        setName(defaultName.replace(/\.[^/.]+$/, ""));
      }
    } catch {
      setErrorMessage("Could not decode audio. Try another MP3, WAV, or WebM file.");
    }
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        void decodeAndLoadAudio(reader.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Handle microphone recording
  const startRecording = async () => {
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordChunksRef.current, { type: "audio/webm" });
        const arrayBuf = await blob.arrayBuffer();
        void decodeAndLoadAudio(arrayBuf, "Microphone Clip");
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMessage("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  // Preview trimmed region
  const handlePreview = () => {
    if (!audioBuffer) return;
    const ctx = getAudioContext();

    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {}
      activeSourceRef.current = null;
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const playStart = Math.max(0, startTime);
    const playDur = Math.max(0.1, endTime - playStart);

    source.onended = () => {
      setIsPlaying(false);
    };

    source.start(0, playStart, playDur);
    activeSourceRef.current = source;
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {}
      activeSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      if (activeSourceRef.current) {
        try {
          activeSourceRef.current.stop();
        } catch {}
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  // Save the clipped sound
  const handleSave = () => {
    if (!name.trim()) {
      setErrorMessage("Please enter a title for this sound.");
      return;
    }
    if (!audioBuffer) {
      setErrorMessage("Please upload an audio file or record a clip first.");
      return;
    }

    // Generate sliced clean 16-bit WAV data URL
    const wavDataUrl = encodeAudioBufferToWav(audioBuffer, startTime, endTime);
    const clipDuration = Math.max(0.1, Number((endTime - startTime).toFixed(2)));

    onSave({
      name: name.trim(),
      icon: icon || "📢",
      color,
      audioData: wavDataUrl,
      duration: clipDuration,
      startTime: 0,
      endTime: clipDuration,
      hotkey: hotkey ? hotkey.slice(0, 1) : undefined,
    });
  };

  const trimmedLength = Math.max(0, (endTime - startTime)).toFixed(2);

  return (
    <div className="audio-clipper-container">
      {/* Header */}
      <div className="audio-clipper-head">
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--vgui-accent)" }}>
          ✂️ Sound Clipper &amp; Waveform Editor
        </div>
        <div style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
          Upload any audio file or record with your mic, clip the sound bite, and assign an icon.
        </div>
      </div>

      {errorMessage && (
        <div className="audio-clipper-error">{errorMessage}</div>
      )}

      {/* Input Sources Strip */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="btn"
          onClick={() => fileInputRef.current?.click()}
        >
          📂 Upload Audio File
        </button>

        {isRecording ? (
          <button
            type="button"
            className="btn"
            style={{ background: "var(--err, #e53e3e)", color: "#fff", border: "1px solid #ff7878" }}
            onClick={stopRecording}
          >
            ⏹ Stop Recording ({recordSeconds}s)
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={startRecording}
          >
            🎙️ Record Microphone
          </button>
        )}

        {duration > 0 && (
          <span style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
            Total Audio: {duration.toFixed(2)}s
          </span>
        )}
      </div>

      {/* Waveform & Trimmer Canvas */}
      {audioBuffer && (
        <div className="audio-clipper-waveform-wrap">
          {/* Waveform Bars */}
          <div className="audio-clipper-waveform">
            {waveformPeaks.map((peak, idx) => {
              const barPct = (idx / waveformPeaks.length) * 100;
              const startPct = (startTime / duration) * 100;
              const endPct = (endTime / duration) * 100;
              const isSelected = barPct >= startPct && barPct <= endPct;

              return (
                <div
                  key={idx}
                  className="audio-waveform-bar"
                  style={{
                    height: `${Math.max(10, peak * 100)}%`,
                    background: isSelected ? "var(--vgui-accent, #c59c3a)" : "var(--vgui-border, #455243)",
                  }}
                />
              );
            })}
          </div>

          {/* Scrubber Handles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
              <span>Start: {startTime.toFixed(2)}s</span>
              <span style={{ color: "var(--vgui-accent)" }}>
                Selected: {trimmedLength}s
              </span>
              <span>End: {endTime.toFixed(2)}s</span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, width: 36, color: "var(--vgui-muted)" }}>Start:</span>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, duration)}
                step={0.05}
                value={startTime}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), endTime - 0.1);
                  setStartTime(Math.max(0, val));
                }}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, width: 36, color: "var(--vgui-muted)" }}>End:</span>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, duration)}
                step={0.05}
                value={endTime}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), startTime + 0.1);
                  setEndTime(Math.min(duration, val));
                }}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Preview Controls */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <button
              type="button"
              className={`btn ${isPlaying ? "danger" : "primary"}`}
              style={{ fontSize: 11, padding: "4px 12px" }}
              onClick={isPlaying ? handleStop : handlePreview}
            >
              {isPlaying ? "⏹ Stop Preview" : "▶ Preview Trim"}
            </button>
            <span style={{ fontSize: 11, color: "var(--vgui-muted)" }}>
              Clips silence and outputs clean 16-bit audio.
            </span>
          </div>
        </div>
      )}

      {/* Sound Settings (Name, Emoji Icon, Color, Hotkey) */}
      <div className="audio-clipper-meta-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>Sound Title:</label>
          <input
            type="text"
            className="task-input"
            placeholder="e.g. Gordon Scream, Airhorn, Bruh..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>Assigned Icon / Emoji:</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              className="task-input"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ width: 50, textAlign: "center", fontSize: 18 }}
            />
            <div className="audio-clipper-emoji-palette">
              {POPULAR_SOUNDBOARD_ICONS.slice(0, 16).map((em) => (
                <button
                  key={em}
                  type="button"
                  className={`audio-emoji-btn ${icon === em ? "active" : ""}`}
                  onClick={() => setIcon(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>Button Color:</label>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {RETRO_CLIP_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 2,
                    background: c,
                    cursor: "pointer",
                    border: color === c ? "2px solid #ffffff" : "1px solid rgba(0,0,0,0.4)",
                    transform: color === c ? "scale(1.15)" : "none",
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>Hotkey:</label>
            <select
              className="task-select"
              value={hotkey}
              onChange={(e) => setHotkey(e.target.value)}
              style={{ width: 90 }}
            >
              <option value="">None</option>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <option key={k} value={k}>
                  Key [{k}]
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={handleSave}
          disabled={!audioBuffer || !name.trim()}
        >
          ✓ Add to Soundboard
        </button>
      </div>
    </div>
  );
}
