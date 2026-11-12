export interface SoundboardClip {
  id: string;
  name: string;
  icon: string;
  color?: string;
  audioData?: string; // base64 data URL
  duration: number; // trimmed duration in seconds
  startTime: number; // clip start offset in seconds
  endTime: number; // clip end offset in seconds
  hotkey?: string; // e.g. "1" - "9"
  isPreset?: boolean;
  createdAt: number;
  createdBy?: string;
}

export interface SoundboardTrigger {
  id: string;
  clipId: string;
  name: string;
  icon: string;
  user: string;
  timestamp: number;
}

export const POPULAR_SOUNDBOARD_ICONS: string[] = [
  "📢", "🎺", "💥", "🥁", "👏", "🔔", "🎮", "⚡",
  "🦆", "🐱", "🐶", "🤖", "🚀", "💣", "🎯", "🍕",
  "👑", "🥳", "🔥", "💀", "🍿", "🎉", "😱", "🏆",
  "🚨", "🏎️", "🥊", "🎷", "👾", "👽", "🦄", "⭐"
];

export const RETRO_CLIP_COLORS: string[] = [
  "#c59c3a", // Amber
  "#48bb78", // Green
  "#3182ce", // Blue
  "#805ad5", // Purple
  "#dd6b20", // Orange
  "#e53e3e", // Red
  "#319795", // Teal
  "#718096", // Steel Gray
];
