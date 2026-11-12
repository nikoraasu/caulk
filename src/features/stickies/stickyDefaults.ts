export interface StickyDefaults {
  roughness: number; // 0 = Architect (clean / 0 sloppiness), 1 = Artist, 2 = Cartoonist
  radius: number; // 0 = Sharp (null roundness), >0 = rounded corners in px
}

const STORAGE_KEY = "caulk_sticky_defaults_v1";

export function loadStickyDefaults(): StickyDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        roughness:
          typeof parsed.roughness === "number"
            ? Math.max(0, Math.min(2, Math.round(parsed.roughness)))
            : 0,
        radius:
          typeof parsed.radius === "number"
            ? Math.max(0, Math.min(48, Math.round(parsed.radius)))
            : 0,
      };
    }
  } catch {}
  return {
    roughness: 0, // Default: 0 sloppiness (Architect style)
    radius: 0, // Default: sharp corners (0px radius)
  };
}

export function saveStickyDefaults(defaults: Partial<StickyDefaults>): StickyDefaults {
  const current = loadStickyDefaults();
  const next: StickyDefaults = {
    roughness:
      typeof defaults.roughness === "number"
        ? Math.max(0, Math.min(2, Math.round(defaults.roughness)))
        : current.roughness,
    radius:
      typeof defaults.radius === "number"
        ? Math.max(0, Math.min(48, Math.round(defaults.radius)))
        : current.radius,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}
