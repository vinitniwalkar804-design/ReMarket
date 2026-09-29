/**
 * Toasts.
 *
 * Replaces `react-hot-toast`. The app only ever calls `toast.success` and
 * `toast.error`, with an optional `icon`, a `duration` override, and an optional
 * `action` ({ label, onClick }) for the Undo/View affordances. That whole
 * surface is implemented here, with the same 3s default and the same card
 * metrics the React build configured on `<Toaster>`:
 *
 *   position="top-right", duration 3000,
 *   style: { borderRadius: "10px", padding: "14px", fontSize: "14px" }
 *
 * Durations differ by tone in the original (errors linger at 4000ms via the
 * explicit `duration` the call sites pass), and that is honoured per-call rather
 * than re-decided here.
 */

import { h } from "./dom.js";

const DEFAULT_DURATION = 3000;

let container = null;
const live = new Set();

function ensureContainer() {
  if (container && container.isConnected) return container;
  container = h("div", {
    // Inline styles rather than a class: the toast surface is framework-level
    // chrome that must not depend on the design-system stylesheet having loaded.
    style: {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "8px",
      pointerEvents: "none",
      maxWidth: "min(92vw, 380px)",
    },
    "aria-live": "polite",
    "aria-atomic": "false",
  });
  document.body.appendChild(container);
  return container;
}

function build(kind, message, opts) {
  const tone =
    kind === "success"
      ? { bg: "#FFFFFF", fg: "#1B2137", icon: "#0A7A59", border: "#E4E7F0" }
      : { bg: "#FFFFFF", fg: "#1B2137", icon: "#C51B3D", border: "#E4E7F0" };

  const el = h(
    "div",
    {
      style: {
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        borderRadius: "10px",
        padding: "14px",
        fontSize: "14px",
        fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
        fontWeight: "600",
        lineHeight: "1.4",
        boxShadow: "0 18px 40px -14px rgba(12,17,34,0.22), 0 6px 14px -6px rgba(12,17,34,0.08)",
        opacity: "0",
        transform: "translateY(-8px)",
        transition: "opacity 0.22s cubic-bezier(0.4,0,0.2,1), transform 0.22s cubic-bezier(0.4,0,0.2,1)",
      },
      role: kind === "error" ? "alert" : "status",
    },
    opts.icon
      ? h("span", { style: { flex: "none", fontSize: "15px", lineHeight: "1" }, "aria-hidden": "true" }, opts.icon)
      : null,
    h("span", { style: { flex: "1 1 auto", minWidth: "0" } }, message),
    opts.action?.label
      ? h("button", {
          type: "button",
          style: {
            flex: "none",
            cursor: "pointer",
            background: "transparent",
            border: "none",
            padding: "2px 4px",
            color: "#4F3ED0",
            font: "inherit",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontSize: "12px",
          },
          onclick: () => {
            dismiss(entry);
            opts.action.onClick?.();
          },
        }, opts.action.label)
      : null
  );

  const entry = { el, timer: null };
  // Animate in on the next frame so the transition has a start value to move
  // from; setting both in the same tick would skip the animation entirely.
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  return entry;
}

function dismiss(entry) {
  if (!entry || !live.has(entry)) return;
  live.delete(entry);
  clearTimeout(entry.timer);
  entry.el.style.opacity = "0";
  entry.el.style.transform = "translateY(-8px)";
  setTimeout(() => entry.el.remove(), 220);
}

/** Show a toast. `kind` is "success" | "error". */
function show(kind, message, opts = {}) {
  const entry = build(kind, message, opts);
  live.add(entry);
  ensureContainer().appendChild(entry.el);
  entry.timer = setTimeout(() => dismiss(entry), opts.duration ?? DEFAULT_DURATION);
  return () => dismiss(entry);
}

export const toast = {
  success: (message, opts) => show("success", message, opts),
  error: (message, opts) => show("error", message, opts),
  dismissAll: () => {
    for (const entry of [...live]) dismiss(entry);
  },
};

export default toast;
