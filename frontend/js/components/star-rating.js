import { h } from "../dom.js";
import { icon } from "../icons.js";

/**
 * A row of five stars, filled to `value`.
 *
 * `value` is rounded before comparison, exactly as the React build did, so a
 * 4.4 average renders four filled stars in both frontends.
 */
export default function StarRating({ value = 0, size = 14, className = "", showValue = false } = {}) {
  const rounded = Math.round(value);
  return h(
    "span",
    { className: `inline-flex items-center gap-1 ${className}` },
    h(
      "span",
      { className: "inline-flex items-center gap-0.5" },
      [1, 2, 3, 4, 5].map((i) =>
        icon("Star", {
          size,
          className: i <= rounded ? "text-rating fill-rating" : "text-line-strong fill-sunken",
        })
      )
    ),
    showValue
      ? h("span", { className: "text-xs font-bold text-ink-800 tabular" }, Number(value || 0).toFixed(1))
      : null
  );
}
