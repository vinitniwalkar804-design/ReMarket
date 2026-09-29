import { h } from "../dom.js";

/**
 * Loading placeholders.
 *
 * These carry the exact same class strings as the React build's skeletons, so
 * a page that is loading has identical geometry to one that has loaded. Any page
 * ported later should reuse these rather than inventing another spinner, or the
 * two frontends will diverge while data loads.
 */
export { default as EmptyState } from "./empty-state.js";

export const SkeletonCard = () =>
  h(
    "div",
    { className: "card overflow-hidden animate-pulse" },
    h("div", { className: "aspect-[4/3] bg-sunken" }),
    h(
      "div",
      { className: "p-3.5 space-y-2.5" },
      h("div", { className: "h-2.5 bg-sunken rounded w-2/5" }),
      h("div", { className: "h-3.5 bg-sunken rounded w-11/12" }),
      h("div", { className: "h-3.5 bg-sunken rounded w-2/3" }),
      h(
        "div",
        { className: "flex justify-between items-end pt-2" },
        h("div", { className: "h-5 bg-sunken rounded w-1/3" }),
        h("div", { className: "h-2.5 bg-sunken rounded w-16" })
      )
    ),
    h("div", { className: "h-9 border-t border-line bg-raised" })
  );

export const SkeletonRow = () =>
  h(
    "div",
    { className: "flex items-center gap-4 p-4 card animate-pulse" },
    h("div", { className: "w-11 h-11 bg-sunken rounded-lg flex-none" }),
    h(
      "div",
      { className: "flex-1 space-y-2" },
      h("div", { className: "h-3.5 bg-sunken rounded w-1/3" }),
      h("div", { className: "h-2.5 bg-sunken rounded w-1/2" })
    ),
    h("div", { className: "h-5 bg-sunken rounded w-20 flex-none" })
  );

export const SkeletonLine = ({ className = "" } = {}) =>
  h("div", { className: `bg-sunken animate-pulse rounded ${className}` });

export const SkeletonStat = () =>
  h(
    "div",
    { className: "card p-5 animate-pulse space-y-3" },
    h("div", { className: "h-2.5 bg-sunken rounded w-24" }),
    h("div", { className: "h-7 bg-sunken rounded w-16" }),
    h("div", { className: "h-2.5 bg-sunken rounded w-32" })
  );

export const SkeletonTable = ({ rows = 6, cols = 5 } = {}) =>
  h(
    "div",
    { className: "card overflow-hidden animate-pulse" },
    h("div", { className: "h-11 bg-raised border-b border-line" }),
    h(
      "div",
      { className: "divide-y divide-line" },
      Array.from({ length: rows }, (_, r) =>
        h(
          "div",
          { key: r, className: "px-4 py-3.5 flex items-center gap-4" },
          Array.from({ length: cols }, (_, c) =>
            h("div", {
              key: c,
              className: "h-3 bg-sunken rounded",
              style: { width: c === 0 ? "26%" : `${Math.max(10, 60 / cols)}%` },
            })
          )
        )
      )
    )
  );
