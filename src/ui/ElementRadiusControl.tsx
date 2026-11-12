import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

export function isRoundableElement(el: ExcalidrawElement): boolean {
  if (el.isDeleted) return false;
  return el.type === "rectangle" || el.type === "diamond" || el.type === "frame";
}

export function getElementRadiusValue(el: ExcalidrawElement): number {
  if (!el.roundness) return 0;
  if (el.roundness.type === 3) {
    return typeof el.roundness.value === "number" ? el.roundness.value : 16;
  }
  if (el.roundness.type === 1 || el.roundness.type === 2) {
    return 16;
  }
  return 0;
}

const SIDEBAR_PRESETS = [
  { label: "Sharp 0", val: 0 },
  { label: "4px", val: 4 },
  { label: "8px", val: 8 },
  { label: "12px", val: 12 },
  { label: "16px", val: 16 },
  { label: "24px", val: 24 },
  { label: "32px", val: 32 },
  { label: "44px", val: 44 },
];

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedElements: readonly ExcalidrawElement[];
  appState: AppState | null;
  onChangeRadius: (radius: number) => void;
};

export function ElementRadiusControl({
  containerRef,
  selectedElements,
  appState,
  onChangeRadius,
}: Props) {
  const [sidebarMount, setSidebarMount] = useState<HTMLDivElement | null>(null);

  const roundable = selectedElements.filter(isRoundableElement);
  const selectedIds = appState?.selectedElementIds ?? {};
  const hasSelected = Object.values(selectedIds).some(Boolean);
  const hasRoundable = roundable.length > 0 && hasSelected;

  // Find current radius from first selected roundable element
  const currentRadius = hasRoundable ? getElementRadiusValue(roundable[0]) : 0;
  const isSticky = roundable.some(
    (el) => (el.customData as Record<string, unknown> | undefined)?.isSticky
  );

  // Mount/unmount sidebar panel into Excalidraw's .App-menu__left under Edges fieldset
  useEffect(() => {
    if (!hasRoundable) {
      setSidebarMount((prev) => {
        if (prev?.parentNode) prev.parentNode.removeChild(prev);
        return null;
      });
      const existing = containerRef.current?.querySelectorAll(".caulk-sidebar-radius-mount");
      existing?.forEach((el) => el.parentNode?.removeChild(el));
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const findAndMount = () => {
      const edgesInput = container.querySelector<HTMLInputElement>(
        '.App-menu__left input[name="edges"]'
      );
      const fieldset = edgesInput?.closest("fieldset");
      if (!fieldset) {
        setSidebarMount((prev) => {
          if (prev?.parentNode) prev.parentNode.removeChild(prev);
          return null;
        });
        return;
      }

      let mount = fieldset.querySelector<HTMLDivElement>(".caulk-sidebar-radius-mount");
      if (!mount) {
        mount = document.createElement("div");
        mount.className = "caulk-sidebar-radius-mount";
        fieldset.appendChild(mount);
      }
      setSidebarMount((prev) => (prev === mount ? prev : mount));
    };

    findAndMount();

    // Observe DOM mutations only in sidebar area
    const sidebarArea =
      container.querySelector(".App-menu__left") ||
      container.querySelector(".layer-ui__wrapper") ||
      container;
    const observer = new MutationObserver(findAndMount);
    observer.observe(sidebarArea, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      setSidebarMount((prev) => {
        if (prev?.parentNode) prev.parentNode.removeChild(prev);
        return null;
      });
      const existing = container.querySelectorAll(".caulk-sidebar-radius-mount");
      existing.forEach((el) => el.parentNode?.removeChild(el));
    };
  }, [hasRoundable, containerRef]);

  if (!hasRoundable || !sidebarMount) {
    return null;
  }

  return createPortal(
    <div className="caulk-sidebar-radius-panel">
      <div className="caulk-radius-row-head">
        <span className="caulk-radius-title">Corner radius</span>
        <span className="caulk-radius-badge">
          {currentRadius === 0 ? "0px (Sharp)" : `${currentRadius}px`}
        </span>
      </div>
      <div className="caulk-radius-slider-wrap">
        <input
          type="range"
          min={0}
          max={48}
          step={1}
          value={currentRadius}
          onChange={(e) => onChangeRadius(Number(e.target.value))}
          className="caulk-radius-slider"
          aria-label="Object corner radius"
        />
      </div>
      <div className="caulk-radius-chips">
        {SIDEBAR_PRESETS.map((item) => (
          <button
            key={item.val}
            type="button"
            className={`caulk-radius-chip ${currentRadius === item.val ? "active" : ""}`}
            onClick={() => onChangeRadius(item.val)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {isSticky && (
        <div
          className="caulk-radius-sticky-hint"
          title="Adjusting corner radius on a sticky note updates your default sticky note style"
        >
          Sticky default: {currentRadius === 0 ? "Sharp (0px)" : `${currentRadius}px`}
        </div>
      )}
    </div>,
    sidebarMount
  );
}
