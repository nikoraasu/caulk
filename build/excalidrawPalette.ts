// Patches Excalidraw's built-in quick colour picks to the VGUI palette at build time,
// and enhances native frames to support custom background colors, stroke colors, and border radiuses.
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

/** Patches native frame capabilities (stroke color, background fill, edge roundness, and canvas rendering). */
function patchFrameFeatures(code: string): string {
  let out = code;

  // 1. Frame Stroke Color capability
  // Dev
  if (out.includes('var hasStrokeColor = (type) => type !== "image" && type !== "frame" && type !== "magicframe";')) {
    out = out.replace(
      'var hasStrokeColor = (type) => type !== "image" && type !== "frame" && type !== "magicframe";',
      'var hasStrokeColor = (type) => type !== "image" && type !== "magicframe";',
    );
  }
  // Prod: e!=="image"&&e!=="frame"&&e!=="magicframe"
  const prodStrokeRe = /([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)=>\2!=="image"&&\2!=="frame"&&\2!=="magicframe"/g;
  if (prodStrokeRe.test(out)) {
    out = out.replace(prodStrokeRe, '$1=$2=>$2!=="image"&&$2!=="magicframe"');
  }

  // 2. Frame Background Color capability
  // Dev
  if (out.includes('var hasBackground = (type) => type === "rectangle" ||')) {
    out = out.replace(
      'var hasBackground = (type) => type === "rectangle" ||',
      'var hasBackground = (type) => type === "rectangle" || type === "frame" ||',
    );
  }
  // Prod
  const prodBgRe = /([a-zA-Z0-9_$]+)=>\1==="rectangle"\|\|\1==="iframe"\|\|\1==="embeddable"\|\|\1==="ellipse"\|\|\1==="diamond"\|\|\1==="line"\|\|\1==="freedraw"/g;
  if (prodBgRe.test(out)) {
    out = out.replace(
      prodBgRe,
      '$1=>$1==="rectangle"||$1==="frame"||$1==="iframe"||$1==="embeddable"||$1==="ellipse"||$1==="diamond"||$1==="line"||$1==="freedraw"',
    );
  }

  // 3. Frame Edge Roundness capability
  // Dev
  if (out.includes('var canChangeRoundness = (type) => type === "rectangle" ||')) {
    out = out.replace(
      'var canChangeRoundness = (type) => type === "rectangle" ||',
      'var canChangeRoundness = (type) => type === "rectangle" || type === "frame" ||',
    );
  }
  // Prod
  const prodRoundRe = /([a-zA-Z0-9_$]+)=>\1==="rectangle"\|\|\1==="iframe"\|\|\1==="embeddable"\|\|\1==="line"\|\|\1==="diamond"\|\|\1==="image"/g;
  if (prodRoundRe.test(out)) {
    out = out.replace(
      prodRoundRe,
      '$1=>$1==="rectangle"||$1==="frame"||$1==="iframe"||$1==="embeddable"||$1==="line"||$1==="diamond"||$1==="image"',
    );
  }

  // 4. Frame Canvas Rendering with Custom Colors, Stroke & Border Radius
  // Dev
  const devFrameRe = /case "magicframe":\s*case "frame":\s*\{[\s\S]*?break;\s*\}/;
  if (devFrameRe.test(out)) {
    out = out.replace(devFrameRe, `case "magicframe":
    case "frame": {
      if (appState.frameRendering.enabled && appState.frameRendering.outline) {
        context.save();
        context.translate(
          element.x + appState.scrollX,
          element.y + appState.scrollY
        );
        const rad = typeof element.roundness?.value === "number" ? element.roundness.value : (element.roundness ? 16 : 0);
        if (element.backgroundColor && element.backgroundColor !== "transparent" && element.backgroundColor !== "rgba(0, 0, 200, 0.04)") {
          context.fillStyle = element.backgroundColor;
          if (rad > 0 && context.roundRect) {
            context.beginPath();
            context.roundRect(0, 0, element.width, element.height, rad / appState.zoom.value);
            context.fill();
            context.closePath();
          } else {
            context.fillRect(0, 0, element.width, element.height);
          }
        }
        context.lineWidth = ((typeof element.strokeWidth === "number" ? element.strokeWidth : FRAME_STYLE.strokeWidth) || 1) / appState.zoom.value;
        context.strokeStyle = (element.strokeColor && element.strokeColor !== "transparent") ? element.strokeColor : FRAME_STYLE.strokeColor;
        if (isMagicFrameElement(element)) {
          context.strokeStyle = appState.theme === THEME.LIGHT ? "#7affd7" : "#1d8264";
        }
        if (element.strokeStyle === "dashed") {
          context.setLineDash([8 / appState.zoom.value, 8 / appState.zoom.value]);
        } else if (element.strokeStyle === "dotted") {
          context.setLineDash([3 / appState.zoom.value, 3 / appState.zoom.value]);
        } else {
          context.setLineDash([]);
        }
        if (rad > 0 && context.roundRect) {
          context.beginPath();
          context.roundRect(
            0,
            0,
            element.width,
            element.height,
            rad / appState.zoom.value
          );
          context.stroke();
          context.closePath();
        } else {
          context.strokeRect(0, 0, element.width, element.height);
        }
        context.setLineDash([]);
        context.restore();
      }
      break;
    }`);
  }

  // Prod
  const prodFrameRe = /case"magicframe":case"frame":\{([a-zA-Z0-9_$]+)\.frameRendering\.enabled&&[\s\S]*?break\}/;
  if (prodFrameRe.test(out)) {
    out = out.replace(prodFrameRe, (_match, a) => {
      return `case"magicframe":case"frame":{${a}.frameRendering.enabled&&${a}.frameRendering.outline&&(o.save(),o.translate(e.x+${a}.scrollX,e.y+${a}.scrollY),(()=>{const rad=typeof e.roundness?.value==="number"?e.roundness.value:(e.roundness?16:0);if(e.backgroundColor&&e.backgroundColor!=="transparent"&&e.backgroundColor!=="rgba(0, 0, 200, 0.04)"){o.fillStyle=e.backgroundColor;if(rad>0&&o.roundRect){o.beginPath();o.roundRect(0,0,e.width,e.height,rad/${a}.zoom.value);o.fill();o.closePath();}else{o.fillRect(0,0,e.width,e.height);}}o.lineWidth=((typeof e.strokeWidth==="number"?e.strokeWidth:Pe.strokeWidth)||1)/${a}.zoom.value;o.strokeStyle=(e.strokeColor&&e.strokeColor!=="transparent")?e.strokeColor:Pe.strokeColor;if(yd(e)){o.strokeStyle=${a}.theme===ke.LIGHT?"#7affd7":"#1d8264";}if(e.strokeStyle==="dashed"){o.setLineDash([8/${a}.zoom.value,8/${a}.zoom.value]);}else if(e.strokeStyle==="dotted"){o.setLineDash([3/${a}.zoom.value,3/${a}.zoom.value]);}else{o.setLineDash([]);}if(rad>0&&o.roundRect){o.beginPath();o.roundRect(0,0,e.width,e.height,rad/${a}.zoom.value);o.stroke();o.closePath();}else{o.strokeRect(0,0,e.width,e.height);}o.setLineDash([]);})(),o.restore());break}`;
    });
  }

  return out;
}

/** Rewrites the quick-pick arrays and patches frame capabilities. Returns the patched code and the names of any patch that found no match. */
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
  out = patchFrameFeatures(out);
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
