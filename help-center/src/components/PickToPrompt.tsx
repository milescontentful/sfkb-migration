/**
 * PickToPrompt — click any element in your UI to copy its selector, styles,
 * and React component info to the clipboard as ready-to-paste prompt context.
 * Paste straight into Cursor / Claude Code instead of screenshotting and
 * describing UI changes by hand.
 *
 * ZERO dependencies. No Tailwind, no icon library, no CSS imports. Works in
 * any React project (Next.js, Vite, CRA). Just drop this one file in.
 *
 * INSTALL
 *   1. Copy this file anywhere in your project, e.g. src/components/PickToPrompt.tsx
 *   2. Render it once near the root, dev-only:
 *
 *        import { PickToPrompt } from "./components/PickToPrompt";
 *        ...
 *        {process.env.NODE_ENV === "development" && <PickToPrompt />}
 *
 *      (Next.js App Router: add it to app/layout.tsx. Vite/CRA: add it to App.tsx.)
 *
 * USE
 *   - Click the pointer icon (bottom-left) to toggle pick mode.
 *   - Hover any element to see tag / selector / size / styles / React component.
 *   - Click any element to copy that info to your clipboard.
 *   - Press Esc (or click the icon again) to exit.
 *
 * Clipboard output looks like:
 *   Element: <button> "Deploy"
 *   Selector: div.flex > button.bg-blue
 *   Size: 72x32 at (1180, 8)
 *   Styles: color:rgb(255,255,255), bg:rgb(0,89,200), font:13px Inter
 *   React: <DeployButton> props:[onClick, disabled] 2 hooks
 *
 * Icon: Lucide "mouse-pointer-click" (ISC License, https://lucide.dev) — inlined
 * so this file stays dependency-free and freely shareable.
 */
"use client";

import { useState, useCallback, useEffect } from "react";

interface ElementInfo {
  tag: string;
  classes: string;
  id: string;
  text: string;
  selector: string;
  rect: { x: number; y: number; w: number; h: number };
  styles: Record<string, string>;
  react: { component: string; props: string[]; state: string } | null;
}

const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

// --- Tooltip placement tuning ------------------------------------------------
// Tweak these to control how the hover tooltip is positioned. You can edit them
// here, OR change them live in the browser console without a rebuild, e.g.:
//   window.__PICK_TO_PROMPT__ = { gap: 24 }
const TOOLTIP_CONFIG = {
  gap: 12, // px of space between the hovered element and the tooltip
  estHeight: 168, // estimated tooltip height when it shows React info
  estHeightBasic: 100, // estimated height without React info
  width: 320, // estimated tooltip width (used to clamp horizontally)
};

function buildSelector(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }
    const classes = Array.from(current.classList)
      .filter((c) => !c.startsWith("__") && c.length < 40)
      .slice(0, 2);
    if (classes.length) part += `.${classes.join(".")}`;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

// Walk up the fiber tree to find the React component name + props
function getReactInfo(el: HTMLElement): ElementInfo["react"] {
  try {
    // React 18/19 internal fiber key
    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );
    if (!fiberKey) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fiber = (el as any)[fiberKey];
    // Walk up to find a function/class component (skip HostComponent fibers)
    let componentName = "";
    const propsKeys: string[] = [];
    let stateInfo = "";

    for (let i = 0; i < 15 && fiber; i++) {
      if (fiber.type && typeof fiber.type === "function") {
        componentName = fiber.type.displayName || fiber.type.name || "Anonymous";
        if (fiber.memoizedProps) {
          propsKeys.push(
            ...Object.keys(fiber.memoizedProps)
              .filter((k) => k !== "children")
              .slice(0, 8)
          );
        }
        // Check for hooks state (memoizedState is a linked list in function components)
        if (fiber.memoizedState) {
          let hookCount = 0;
          let hookNode = fiber.memoizedState;
          while (hookNode && hookCount < 10) {
            hookCount++;
            hookNode = hookNode.next;
          }
          stateInfo = `${hookCount} hooks`;
        }
        break;
      }
      fiber = fiber.return;
    }

    if (!componentName) return null;
    return { component: componentName, props: propsKeys, state: stateInfo };
  } catch {
    return null;
  }
}

function getElementInfo(el: HTMLElement): ElementInfo {
  const rect = el.getBoundingClientRect();
  const computed = window.getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList).join(" "),
    id: el.id || "",
    text: (el.textContent || "").trim().slice(0, 100),
    selector: buildSelector(el),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    styles: {
      bg: computed.backgroundColor,
      color: computed.color,
      font: `${computed.fontSize} ${computed.fontFamily.split(",")[0]}`,
      padding: computed.padding,
      border: computed.border !== "none" ? computed.border : "",
    },
    react: getReactInfo(el),
  };
}

// Position the tooltip so it never overlaps the element being hovered:
// prefer above, flip below when there isn't enough room.
function getTooltipPosition(rect: ElementInfo["rect"], hasReact: boolean) {
  const cfg = {
    ...TOOLTIP_CONFIG,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(typeof window !== "undefined" ? (window as any).__PICK_TO_PROMPT__ : null),
  };
  const GAP = cfg.gap;
  const estH = hasReact ? cfg.estHeight : cfg.estHeightBasic;
  const estW = cfg.width;
  const left = Math.max(8, Math.min(rect.x, window.innerWidth - estW - 8));
  const top =
    rect.y >= estH + GAP ? rect.y - estH - GAP : rect.y + rect.h + GAP;
  return { left, top };
}

function formatForClipboard(info: ElementInfo): string {
  const lines = [
    `Element: <${info.tag}> "${info.text}"`,
    `Selector: ${info.selector}`,
    `Size: ${info.rect.w}x${info.rect.h} at (${info.rect.x}, ${info.rect.y})`,
    `Styles: color:${info.styles.color}, bg:${info.styles.bg}, font:${info.styles.font}`,
  ];
  if (info.styles.border) lines.push(`Border: ${info.styles.border}`);
  if (info.react) {
    lines.push(
      `React: <${info.react.component}> props:[${info.react.props.join(", ")}] ${info.react.state}`
    );
  }
  return lines.join("\n");
}

// Lucide "mouse-pointer-click" icon (ISC License) — inlined to stay dependency-free.
function PickIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4.1 12 6" />
      <path d="m5.1 8-2.9-.8" />
      <path d="m6 12-1.9 2" />
      <path d="M7.2 2.2 8 5.1" />
      <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
    </svg>
  );
}

export function PickToPrompt() {
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState<ElementInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!el || el.closest("[data-pick-to-prompt]")) return;
      setHovered(getElementInfo(el));
    },
    [active]
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!active) return;
      const el = e.target as HTMLElement;
      if (el.closest("[data-pick-to-prompt]")) return;
      e.preventDefault();
      e.stopPropagation();
      const info = getElementInfo(el);
      navigator.clipboard.writeText(formatForClipboard(info));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [active]
  );

  // Escape key to exit pick mode
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && active) {
        setActive(false);
        setHovered(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active]);

  useEffect(() => {
    if (active) {
      document.addEventListener("mousemove", handleMouseMove, true);
      document.addEventListener("click", handleClick, true);
      document.body.style.cursor = "crosshair";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("click", handleClick, true);
      document.body.style.cursor = "";
    };
  }, [active, handleMouseMove, handleClick]);

  return (
    <>
      {/* Toggle button */}
      <button
        data-pick-to-prompt="toggle"
        onClick={() => {
          setActive(!active);
          setHovered(null);
        }}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        title={active ? "Exit Pick to Prompt (Esc)" : "Pick an element (copies prompt to clipboard)"}
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 32,
          width: 32,
          padding: 0,
          border: "none",
          borderRadius: 9999,
          cursor: "pointer",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
          background: active ? "#ef4444" : "#1a1c1d",
          color: active
            ? "#ffffff"
            : btnHover
              ? "#ffffff"
              : "rgba(255,255,255,0.6)",
          transition: "background-color 0.15s ease, color 0.15s ease",
        }}
      >
        <PickIcon size={16} />
      </button>

      {/* Active indicator */}
      {active && (
        <div
          data-pick-to-prompt="banner"
          style={{
            position: "fixed",
            left: 56,
            bottom: 16,
            zIndex: 2147483647,
            borderRadius: 8,
            background: "#ef4444",
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 500,
            color: "#ffffff",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            fontFamily:
              'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          }}
        >
          {copied
            ? "Copied to clipboard!"
            : "Pick to Prompt ON — click element to copy, Esc to exit"}
        </div>
      )}

      {/* Hover tooltip */}
      {active && hovered && (
        <div
          data-pick-to-prompt="tooltip"
          style={{
            pointerEvents: "none",
            position: "fixed",
            zIndex: 2147483646,
            maxWidth: 384,
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            background: "#ffffff",
            padding: 10,
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
            ...getTooltipPosition(hovered.rect, !!hovered.react),
          }}
        >
          <div style={{ marginBottom: 4, fontFamily: MONO, fontSize: 10, color: "#0059C8" }}>
            &lt;{hovered.tag}&gt;{" "}
            {hovered.id && <span style={{ color: "#D97706" }}>#{hovered.id}</span>}
          </div>
          <div
            style={{
              marginBottom: 4,
              fontSize: 11,
              fontWeight: 500,
              color: "#1a1c1d",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontFamily:
                'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            }}
          >
            &quot;{hovered.text}&quot;
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              color: "#737785",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {hovered.selector}
          </div>
          <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 9, color: "#9ca3af" }}>
            {hovered.rect.w}x{hovered.rect.h} | {hovered.styles.font}
          </div>
          {hovered.react && (
            <div style={{ marginTop: 6, borderTop: "1px solid #E5E7EB", paddingTop: 6 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: "#059669" }}>
                React: &lt;{hovered.react.component}&gt;
              </div>
              {hovered.react.props.length > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: "#737785" }}>
                  props: {hovered.react.props.join(", ")}
                </div>
              )}
              {hovered.react.state && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: "#D97706" }}>
                  {hovered.react.state}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Highlight outline */}
      {active && hovered && (
        <div
          data-pick-to-prompt="highlight"
          style={{
            pointerEvents: "none",
            position: "fixed",
            zIndex: 2147483645,
            border: "2px solid rgba(239,68,68,0.6)",
            background: "rgba(239,68,68,0.05)",
            left: hovered.rect.x,
            top: hovered.rect.y,
            width: hovered.rect.w,
            height: hovered.rect.h,
          }}
        />
      )}
    </>
  );
}
