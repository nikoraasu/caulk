// Patches Excalidraw's built-in quick colour picks to the VGUI palette at build time.
// Excalidraw does not expose these arrays as props, so the literals are rewritten in the bundle.
// Two entry points: a Vite transform (build and dev) and an esbuild plugin for dev pre-bundling,
// which skips Vite transforms.
import { readFile } from "node:fs/promises";
import type { Plugin as VitePlugin } from "vite";
import type { Plugin as EsbuildPlugin } from "esbuild";
import { VGUI_CANVAS_PICKS, VGUI_FILL_PICKS, VGUI_STROKE_PICKS } from "../src/ui/vguiColors";

const ID = "[\\w$]+";
const CANVAS_MARKER = '"#f5faff"';
const WARNING = "Excalidraw palette patch did not apply";

type Patch = {
  name: string;
  /** Minified production form: `X=[X.black,X.red[Y],...]`, with X and Y varying per build. */
  prod: RegExp;
  /** Unminified dev form: `var NAME = [ ... ];`. */
  devName: string;
  picks: readonly string[];
};

const PATCHES: Patch[] = [
  {
    name: "stroke picks",
    prod: new RegExp(
      `=\\[(${ID})\\.black,\\1\\.red\\[${ID}\\],\\1\\.green\\[${ID}\\],\\1\\.blue\\[${ID}\\],\\1\\.yellow\\[${ID}\\]\\]`,
      "g",
    ),
    devName: "DEFAULT_ELEMENT_STROKE_PICKS",
    picks: VGUI_STROKE_PICKS,
  },
  {
    name: "background picks",
    prod: new RegExp(
      `=\\[(${ID})\\.transparent,\\1\\.red\\[${ID}\\],\\1\\.green\\[${ID}\\],\\1\\.blue\\[${ID}\\],\\1\\.yellow\\[${ID}\\]\\]`,
      "g",
    ),
    devName: "DEFAULT_ELEMENT_BACKGROUND_PICKS",
    picks: VGUI_FILL_PICKS,
  },
  {
    name: "canvas background picks",
    prod: new RegExp(`=\\[(${ID})\\.white,"#f8f9fa","#f5faff","#fffce8","#fdf8f6"\\]`, "g"),
    devName: "DEFAULT_CANVAS_BACKGROUND_PICKS",
    picks: VGUI_CANVAS_PICKS,
  },
];

function replaceAll(code: string, re: RegExp, value: string): [string, number] {
  let count = 0;
  const out = code.replace(re, () => {
    count++;
    return value;
  });
  return [out, count];
}

/** Rewrites the quick-pick arrays. Returns the patched code and the names of any patch that found no match. */
export function patchExcalidrawPalette(code: string): { code: string; missed: string[] } {
  if (!code.includes(CANVAS_MARKER)) return { code, missed: [] };
  const missed: string[] = [];
  let out = code;
  for (const patch of PATCHES) {
    const json = JSON.stringify(patch.picks);
    let [next, count] = replaceAll(out, patch.prod, `=${json}`);
    if (count === 0) {
      const devRe = new RegExp(`var ${patch.devName} = \\[[\\s\\S]*?\\];`, "g");
      [next, count] = replaceAll(out, devRe, `var ${patch.devName} = ${json};`);
    }
    if (count === 0) missed.push(patch.name);
    out = next;
  }
  return { code: out, missed };
}

function reportMissed(id: string, missed: string[]) {
  console.warn(`\n[caulk] ${WARNING} in ${id}: no match for ${missed.join(", ")}.\n`);
}

const isExcalidrawDist = (id: string) => id.replace(/\\/g, "/").includes("@excalidraw/excalidraw/dist");

/** Vite plugin: patches the Excalidraw bundle during build and on-demand dev transforms. */
export function excalidrawPalettePlugin(): VitePlugin {
  return {
    name: "caulk:excalidraw-palette",
    enforce: "pre",
    transform(code, id) {
      if (!isExcalidrawDist(id) || !code.includes(CANVAS_MARKER)) return null;
      const { code: out, missed } = patchExcalidrawPalette(code);
      if (missed.length > 0) reportMissed(id, missed);
      return out === code ? null : { code: out, map: null };
    },
  };
}

/** esbuild plugin for `optimizeDeps.esbuildOptions.plugins`, since dev pre-bundling skips Vite transforms. */
export function excalidrawPaletteEsbuildPlugin(): EsbuildPlugin {
  return {
    name: "caulk:excalidraw-palette",
    setup(build) {
      build.onLoad({ filter: /@excalidraw[\\/]excalidraw[\\/]dist[\\/].*\.js$/ }, async (args) => {
        const code = await readFile(args.path, "utf8");
        if (!code.includes(CANVAS_MARKER)) return undefined;
        const { code: out, missed } = patchExcalidrawPalette(code);
        if (missed.length > 0) reportMissed(args.path, missed);
        return { contents: out, loader: "js" };
      });
    },
  };
}
