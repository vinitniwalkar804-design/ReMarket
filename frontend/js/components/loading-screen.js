import { h } from "../dom.js";

/**
 * Full-screen loader.
 *
 * Used for two things in the React build: the auth check, and the Suspense
 * fallback for a route whose page module has not arrived yet. Both are
 * re-rendered here, so the two states stay visually identical.
 */
export default function LoadingScreen({ label = "Loading your marketplace" } = {}) {
  return h(
    "div",
    { className: "min-h-screen flex items-center justify-center bg-canvas" },
    h(
      "div",
      { className: "flex flex-col items-center gap-5" },
      h(
        "div",
        { className: "relative w-11 h-11" },
        h("div", {
          className: "absolute inset-0 rounded-xl bg-primary animate-spin [animation-duration:1.1s]",
        }),
        h("div", { className: "absolute inset-[3px] rounded-lg bg-canvas" })
      ),
      h("p", { className: "text-sm font-semibold text-muted tracking-tight" }, label)
    )
  );
}
