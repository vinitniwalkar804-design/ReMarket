import { h } from "../dom.js";
import { icon } from "../icons.js";

/**
 * Modal dialog.
 *
 * Ported from the React build's `Modal.jsx`, preserving the behaviour that is
 * easy to lose without React: Escape closes, the backdrop closes, and body scroll
 * is locked while it is open and released on close - including on unmount, so a
 * dialog that is removed by a route change cannot leave the page unscrollable.
 */
export default function Modal({ open = true, onClose, title, subtitle, children, footer, wide, size } = {}) {
  if (!open) return null;

  const width = size || (wide ? "sm:max-w-3xl" : "sm:max-w-lg");
  const previousOverflow = document.body.style.overflow;

  const close = () => onClose?.();

  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";

  const dialog = h(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": typeof title === "string" ? title : undefined,
      className: `relative w-full ${width} bg-card rounded-t-3xl sm:rounded-2xl shadow-pop border border-line animate-slide-up max-h-[92vh] flex flex-col`,
    },
    h(
      "div",
      {
        className:
          "flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-line bg-raised rounded-t-3xl sm:rounded-t-2xl",
      },
      h(
        "div",
        { className: "min-w-0" },
        h("h3", { className: "text-base font-extrabold text-ink-900 tracking-tight" }, title),
        subtitle ? h("p", { className: "text-xs text-muted mt-1 leading-relaxed" }, subtitle) : null
      ),
      h(
        "button",
        { type: "button", onClick: close, "aria-label": "Close dialog", className: "btn-icon flex-none -mr-1 -mt-0.5" },
        icon("X", { size: 18 })
      )
    ),
    h("div", { className: "px-5 sm:px-6 py-5 overflow-y-auto" }, children),
    footer
      ? h(
          "div",
          {
            className:
              "px-5 sm:px-6 py-4 border-t border-line bg-raised flex items-center justify-end gap-2.5 rounded-b-3xl sm:rounded-b-2xl",
          },
          footer
        )
      : null
  );

  const root = h(
    "div",
    { className: "fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6" },
    h("div", {
      className: "absolute inset-0 bg-ink-950/55 backdrop-blur-[3px] animate-fade-in",
      onClick: close,
    }),
    dialog
  );

  /**
   * React cleaned this up in the effect's return; without React the same job is
   * done by observing the node's removal from the document, so a dialog torn
   * down by a route change releases the scroll lock exactly as a closed one does.
   */
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return root;
}
