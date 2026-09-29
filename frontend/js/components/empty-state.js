import { h } from "../dom.js";
import { icon } from "../icons.js";

/**
 * The "nothing here yet" panel.
 *
 * `iconName` is a lucide icon name; it is drawn only when supplied, matching the
 * React build where the icon prop was optional.
 */
export default function EmptyState({ iconName, title, description, action, compact } = {}) {
  return h(
    "div",
    {
      className: `flex flex-col items-center justify-center text-center ${
        compact ? "py-10" : "py-16 sm:py-20"
      } px-6`,
    },
    iconName
      ? h(
          "div",
          {
            className:
              "w-14 h-14 rounded-2xl bg-primary-soft border border-brand-100 flex items-center justify-center mb-5",
          },
          icon(iconName, { size: 24, className: "text-primary" })
        )
      : null,
    h("h3", { className: "text-lg font-extrabold text-ink-900 tracking-tight" }, title),
    description
      ? h(
          "p",
          { className: "text-sm text-muted max-w-sm mt-2 mb-6 leading-relaxed" },
          description
        )
      : null,
    action || null
  );
}
