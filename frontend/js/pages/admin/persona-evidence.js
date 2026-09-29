import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";

/**
 * Why the model assigned a cluster to this persona.
 *
 * The persona card states a conclusion - "Research-Heavy Buyer", 31% of
 * customers, spend here - and the pipeline already records how it got there:
 * which features contributed, how far the cluster sits from the population mean,
 * how confidently the label won, and which persona it beat. None of that was
 * being shown, so the card read as a marketing assertion the operator had to
 * take on faith.
 *
 * Everything rendered here comes from the stored persona document. When a field
 * is absent the corresponding line is omitted rather than defaulted, so a
 * pipeline run that produced no evidence shows an honest "no evidence recorded"
 * instead of a zeroed-out bar that looks like a measurement.
 *
 * Ported from the React build's `pages/admin/PersonaEvidence.jsx`. That file
 * kept one piece of state, `open`, and its only mutation was the disclosure
 * button. `persona` never changes for the life of the component, so the derived
 * values below are computed once instead of on every repaint, and the toggle
 * remounts the component's own root - which is exactly the region React
 * re-rendered - rather than wrapping it in a host element that would leave an
 * extra node in the DOM between the two states.
 */

const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;

const EvidenceRow = ({ item, maxContribution }) => {
  const contribution = Number(item.contribution) || 0;
  const width = maxContribution > 0 ? Math.max((Math.abs(contribution) / maxContribution) * 100, 2) : 0;
  const positive = contribution >= 0;

  return h(
    "li",
    { className: "py-2" },
    h(
      "div",
      { className: "flex items-baseline justify-between gap-3" },
      h("span", { className: "text-xs font-semibold text-ink-900" }, item.label || item.name),
      h(
        "span",
        {
          className: `text-2xs tabular flex-none ${positive ? "text-emerald-600" : "text-rose-600"}`,
        },
        positive ? "+" : "",
        contribution.toFixed(2)
      )
    ),
    h(
      "div",
      { className: "mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden" },
      h("div", {
        className: `h-full rounded-full ${positive ? "bg-emerald-500/70" : "bg-rose-500/70"}`,
        style: { width: `${width}%` },
      })
    ),
    h(
      "p",
      { className: "mt-1 text-2xs text-muted tabular" },
      "cluster mean ",
      Number(item.clusterMean).toFixed(1),
      " vs reference ",
      Number(item.reference).toFixed(1),
      item.saturated &&
        h(
          "span",
          {
            className: "ml-1.5 text-amber-600",
            title:
              "Raw value is far above the reference; the score is capped so one extreme feature cannot dominate the label.",
          },
          "(capped)"
        )
    )
  );
};

export default function PersonaEvidence({ persona }) {
  // React's per-render computations. `persona` is fixed for the component's
  // lifetime, so the toggle re-render would recompute identical values.
  const evidence = persona.evidence || [];
  const maxContribution = evidence.reduce(
    (m, e) => Math.max(m, Math.abs(Number(e.contribution) || 0)),
    0
  );
  const hasEvidence = evidence.length > 0;

  let open = false;

  const root = h("div", { className: "mt-4 rounded-xl border border-line bg-raised overflow-hidden" });

  const disclosure = () =>
    h(
      "button",
      {
        type: "button",
        onClick: () => {
          open = !open;
          render();
        },
        "aria-expanded": open,
        className:
          "w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors",
      },
      icon("Scale", { size: 14, className: "text-primary flex-none" }),
      h("span", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-ink-900" }, "Why this persona"),
      persona.confidence != null &&
        h(
          "span",
          { className: "text-2xs text-muted tabular" },
          "confidence ",
          pct(persona.confidence),
          persona.marginOverRunnerUp != null &&
            ` · +${Number(persona.marginOverRunnerUp).toFixed(2)} over runner-up`
        ),
      icon("ChevronDown", {
        size: 14,
        className: `ml-auto text-muted flex-none transition-transform ${open ? "rotate-180" : ""}`,
      })
    );

  const panel = () =>
    h(
      "div",
      { className: "px-4 pb-4 pt-1 border-t border-line space-y-4" },
      persona.isNamed === false &&
        h(
          "p",
          {
            className:
              "text-2xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3",
          },
          "This segment did not clear the evidence threshold for a named persona. It is shown as an unnamed segment rather than being given a descriptive label.",
          persona.namingReason ? ` Reason: ${persona.namingReason}` : ""
        ),
      h(
        "div",
        { className: "grid gap-4 sm:grid-cols-2 pt-3" },
        h(
          "div",
          null,
          h(
            "p",
            { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1" },
            "Scored evidence"
          ),
          hasEvidence
            ? h(
                "ul",
                { className: "divide-y divide-line" },
                ...evidence.map((item) => EvidenceRow({ item, maxContribution }))
              )
            : h("p", { className: "text-2xs text-muted" }, "No evidence recorded for this segment.")
        ),
        h(
          "div",
          { className: "space-y-4" },
          persona.alternatives?.length > 0 &&
            h(
              "div",
              null,
              h(
                "p",
                { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5" },
                "Ran against"
              ),
              h(
                "ul",
                { className: "space-y-1" },
                ...persona.alternatives.map((alt) => {
                  const best = Number(persona.matchScore) || 0;
                  const score = Number(alt.score) || 0;
                  return h(
                    "li",
                    { className: "flex items-center gap-2 text-2xs" },
                    h("span", { className: "text-ink-700 flex-1 truncate" }, alt.name),
                    h(
                      "span",
                      { className: "h-1 w-16 rounded-full bg-sunken overflow-hidden flex-none" },
                      h("span", {
                        className: "block h-full bg-white/25 rounded-full",
                        style: { width: `${best > 0 ? Math.max((score / best) * 100, 3) : 0}%` },
                      })
                    ),
                    h("span", { className: "tabular text-muted w-10 text-right flex-none" }, score.toFixed(1))
                  );
                })
              )
            ),
          persona.highFeatures?.length > 0 &&
            h(
              "div",
              null,
              h(
                "p",
                {
                  className:
                    "text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5 flex items-center gap-1",
                },
                icon("TrendingUp", { size: 11, className: "text-emerald-600" }),
                " Above population"
              ),
              h(
                "ul",
                { className: "space-y-0.5" },
                ...persona.highFeatures.slice(0, 4).map((f) =>
                  h(
                    "li",
                    { className: "flex items-baseline justify-between gap-2 text-2xs" },
                    h("span", { className: "text-ink-700 truncate" }, f.label || f.name),
                    h(
                      "span",
                      { className: "tabular text-emerald-600 flex-none" },
                      Number(f.clusterMean).toFixed(1),
                      " vs ",
                      Number(f.populationMean).toFixed(1)
                    )
                  )
                )
              )
            ),
          persona.lowFeatures?.length > 0 &&
            h(
              "div",
              null,
              h(
                "p",
                {
                  className:
                    "text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5 flex items-center gap-1",
                },
                icon("TrendingDown", { size: 11, className: "text-rose-500" }),
                " Below population"
              ),
              h(
                "ul",
                { className: "space-y-0.5" },
                ...persona.lowFeatures.slice(0, 4).map((f) =>
                  h(
                    "li",
                    { className: "flex items-baseline justify-between gap-2 text-2xs" },
                    h("span", { className: "text-ink-700 truncate" }, f.label || f.name),
                    h(
                      "span",
                      { className: "tabular text-rose-500 flex-none" },
                      Number(f.clusterMean).toFixed(1),
                      " vs ",
                      Number(f.populationMean).toFixed(1)
                    )
                  )
                )
              )
            ),
          persona.counterSignals?.length > 0 &&
            h(
              "div",
              null,
              h(
                "p",
                {
                  className:
                    "text-2xs font-bold uppercase tracking-[0.1em] text-muted mb-1.5 flex items-center gap-1",
                },
                icon("AlertTriangle", { size: 11, className: "text-amber-600" }),
                " Counted against"
              ),
              h(
                "ul",
                { className: "space-y-0.5" },
                ...persona.counterSignals.map((label) => h("li", { className: "text-2xs text-ink-700" }, label))
              )
            )
        )
      )
    );

  // React re-rendered the whole component on the toggle. That region is this
  // root, so it is remounted in place: closed renders only the button, open
  // renders the button followed by the panel - the same two child lists the
  // JSX produces, with no wrapper element between them.
  const render = () => mount(root, disclosure(), open ? panel() : null);

  render();

  return root;
}
