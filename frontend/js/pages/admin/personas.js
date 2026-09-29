/**
 * Admin console — Customer personas.
 *
 * Vanilla port of `pages/admin/AdminPersonas.jsx`.
 *
 * The one admin page that explains the machine learning: pipeline → run facts →
 * every cluster → the named personas (via the already-ported `PersonaEvidence`).
 * Every number is read from the stored run, and the algorithm is named in the
 * header, the pipeline strip, the run facts and the honesty note.
 *
 * "Run segmentation" POSTs `/ml/run` then reloads `/admin/personas`. While a run
 * is in flight the Run button disables (Running…), then the reload shows the
 * skeleton, exactly as React did; the success step alert clears after 4s.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import PersonaEvidence from "./persona-evidence.js";
import { formatINR } from "../../utils/format.js";

const number = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Human labels for the three validation indices, so a reader need not know D-B. */
const METRIC_LABELS = {
  silhouette: { label: "Silhouette", hint: "Separation between clusters. Higher is better, max 1.", better: "higher" },
  daviesBouldin: { label: "Davies-Bouldin", hint: "Overlap between clusters. Lower is better.", better: "lower" },
  calinskiHarabasz: { label: "Calinski-Harabasz", hint: "Separation relative to spread. Higher is better.", better: "higher" },
};

const PipelineStep = ({ icon: Icon, label, value, detail }) =>
  h(
    "li",
    { className: "flex items-start gap-2.5 min-w-0" },
    h("span", { className: "w-7 h-7 rounded-lg bg-primary-soft text-primary flex items-center justify-center flex-none mt-0.5" }, icon(Icon, { size: 13 })),
    h(
      "div",
      { className: "min-w-0" },
      h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, label),
      h("p", { className: "text-sm font-extrabold text-ink-900 leading-tight" }, value),
      detail && h("p", { className: "text-2xs text-muted leading-snug" }, detail)
    )
  );

export default function AdminPersonas() {
  const st = { data: null, error: null, loading: true, running: false, step: "" };
  let disposed = false;
  let stepTimer = null;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const contentHost = h("div");
  root.appendChild(contentHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      clearTimeout(stepTimer);
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const load = async () => {
    st.loading = true;
    st.error = null;
    paint();
    try {
      const { data: payload } = await api.get("/admin/personas");
      if (!ensureAlive()) return;
      st.data = payload;
    } catch (err) {
      if (!ensureAlive()) return;
      st.error = err.response?.data?.message || "Could not load the current segmentation.";
    }
    st.loading = false;
    paint();
  };

  const run = async () => {
    st.running = true;
    st.error = null;
    st.step = "Rebuilding customer features from behaviour events…";
    paint();
    try {
      await api.post("/ml/run");
      st.step = "Persona regenerated from the new K-Means run.";
      await load();
      clearTimeout(stepTimer);
      stepTimer = setTimeout(() => {
        if (!ensureAlive()) return;
        st.step = "";
        paint();
      }, 4000);
    } catch (err) {
      if (!ensureAlive()) return;
      st.error = err.response?.data?.message || "The segmentation run failed.";
      st.step = "";
    }
    st.running = false;
    paint();
  };

  const paintRunButton = (label, idleIcon, runningLabel) =>
    h(
      "button",
      { type: "button", onClick: run, disabled: st.running, className: "btn-primary" },
      st.running ? icon("Loader2", { size: 15, className: "animate-spin" }) : icon(idleIcon, { size: 15 }),
      st.running ? ` ${runningLabel}` : ` ${label}`
    );

  const paint = () => {
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "space-y-4 animate-fade-in" },
          h("div", { className: "h-9 w-64 bg-sunken rounded-lg animate-pulse" }),
          h("div", { className: "h-24 rounded-2xl bg-sunken animate-pulse" }),
          h("div", { className: "h-64 rounded-2xl bg-sunken animate-pulse" })
        )
      );
      return;
    }

    const personas = st.data?.personas || [];
    const distribution = st.data?.clusterDistribution || [];
    const totalCustomers = number(st.data?.totalCustomers);
    const numClusters = number(st.data?.numClusters, distribution.length);
    const namedCount = personas.length;
    // Customers the partition held back rather than assigned to a cluster. Reported
    // rather than hidden, so the cluster sizes add up to a number the page explains.
    const unclusteredCustomers = number(st.data?.unclusteredCustomers);
    // Read from the API, never assumed. A run made before K-Means became the reported
    // result is labelled as the legacy consensus it actually is, so the page cannot
    // describe a segmentation the stored personas were not drawn from.
    const sourceLabel = st.data?.sourceLabel || "K-Means";

    // The largest cluster, used to scale the distribution bars.
    const largestCluster = distribution.reduce((m, c) => Math.max(m, number(c.count)), 0);

    if (personas.length === 0 && distribution.length === 0) {
      mount(
        contentHost,
        h(
          "div",
          { className: "animate-fade-in space-y-5" },
          h(
            "header",
            null,
            h("span", { className: "page-eyebrow" }, icon("Brain", { size: 12 }), " Customer Intelligence"),
            h("h1", { className: "page-title" }, "Customer personas"),
            h("p", { className: "page-sub" }, "K-Means over per-customer behaviour features. No personas exist until the first run.")
          ),
          st.error && h("div", { className: "alert alert-danger" }, st.error),
          h(
            "div",
            { className: "panel p-12 text-center" },
            h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Brain", { size: 22 })),
            h("h3", { className: "font-extrabold text-ink-900" }, "No segmentation has been run yet"),
            h(
              "p",
              { className: "text-sm text-muted mt-1 max-w-md mx-auto" },
              "The run reads real behaviour events, orders and offers, builds one feature row per customer, and fits K-Means. Personas appear afterwards, named from the clusters that actually exist."
            ),
            h("div", { className: "mt-5 flex justify-center" }, paintRunButton("Run segmentation", "RefreshCw", "Running…"))
          )
        )
      );
      return;
    }

    const metricsGrid =
      st.data?.metrics &&
      h(
        "section",
        { className: "surface-panel p-5" },
        h("h2", { className: "text-2xs font-bold uppercase tracking-[0.12em] text-muted mb-3" }, "How well separated these clusters are"),
        h(
          "div",
          { className: "grid gap-3 sm:grid-cols-3" },
          ["silhouette", "daviesBouldin", "calinskiHarabasz"].map((key) => {
            const spec = METRIC_LABELS[key];
            const raw = st.data.metrics[key];
            const value = raw === null || raw === undefined ? null : Number(raw);
            const note = st.data.metricNotes?.[key];
            return h(
              "div",
              { key: key, className: "sunken-panel p-3.5" },
              h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted", title: spec.hint }, spec.label),
              value === null || !Number.isFinite(value)
                ? h(
                    "div",
                    null,
                    h("p", { className: "text-sm font-extrabold text-muted mt-1" }, "Not defined"),
                    note && h("p", { className: "text-2xs text-muted mt-0.5 leading-snug" }, note)
                  )
                : h(
                    "p",
                    { className: "text-sm font-extrabold text-ink-900 mt-1 tabular" },
                    value.toFixed(3),
                    h("span", { className: "text-2xs font-semibold text-muted ml-1.5" }, `${spec.better} is better`)
                  )
            );
          })
        )
      );

    const distributionSection =
      distribution.length > 0 &&
      h(
        "section",
        { className: "surface-panel p-5" },
        h(
          "div",
          { className: "flex items-baseline justify-between gap-3 flex-wrap mb-3.5" },
          h("h2", { className: "text-2xs font-bold uppercase tracking-[0.12em] text-muted" }, "Every cluster in this run"),
          h(
            "span",
            { className: "text-2xs text-muted" },
            totalCustomers > 0 ? distribution.map((c) => `${c.count} (${Math.round((c.count / totalCustomers) * 100)}%)`).join(" · ") : ""
          )
        ),
        h(
          "ul",
          { className: "space-y-2.5" },
          distribution.map((cluster) => {
            const count = number(cluster.count);
            const share = totalCustomers > 0 ? (count / totalCustomers) * 100 : 0;
            const width = largestCluster > 0 ? (count / largestCluster) * 100 : 0;
            const named = Boolean(cluster.personaName);
            return h(
              "li",
              { key: cluster.clusterId, className: "flex items-center gap-3" },
              h("span", { className: "text-2xs font-bold text-muted w-16 flex-none tabular" }, `Cluster ${cluster.clusterId}`),
              h(
                "span",
                { className: "h-2.5 bg-sunken rounded-full overflow-hidden flex-1 min-w-[80px]" },
                h("span", {
                  className: `block h-full rounded-full ${named ? "bg-primary" : "bg-ink-300"}`,
                  style: { width: `${Math.max(width, 1)}%` },
                })
              ),
              h("span", { className: "text-2xs tabular text-ink-700 w-12 text-right flex-none" }, count),
              h("span", { className: "text-2xs tabular text-muted w-10 text-right flex-none" }, `${share.toFixed(0)}%`),
              h(
                "span",
                { className: "text-2xs w-40 text-right flex-none truncate" },
                named
                  ? h("span", { className: "font-bold text-ink-800" }, cluster.personaName)
                  : h("span", { className: "text-muted italic" }, "unnamed")
              )
            );
          })
        ),
        distribution.some((c) => !c.personaName) &&
          h(
            "p",
            { className: "text-2xs text-muted mt-3.5 leading-relaxed" },
            "An unnamed cluster is a real group the data produced, not missing data. It simply did not separate strongly enough from the others to be given a descriptive name, so it is shown without one rather than being given a label nobody measured."
          )
      );

    const personasSection = h(
      "section",
      { className: "space-y-4" },
      h("h2", { className: "text-2xs font-bold uppercase tracking-[0.12em] text-muted" }, `${namedCount} named persona${namedCount === 1 ? "" : "s"}`),
      personas.length === 0
        ? h(
            "div",
            { className: "panel p-10 text-center" },
            h("p", { className: "text-sm font-extrabold text-ink-900" }, "No cluster earned a persona name"),
            h(
              "p",
              { className: "text-sm text-muted mt-1 max-w-md mx-auto" },
              `K-Means found ${numClusters} group${numClusters === 1 ? "" : "s"}, but none separated strongly enough to be named. The clusters are still listed above with their sizes.`
            )
          )
        : personas.map((p) => {
            const metrics = [
              { icon: "Wallet", label: "Avg spending", value: formatINR(p.avgSpending || 0) },
              { icon: "Timer", label: "Decision time", value: `${number(p.avgDecisionTime).toFixed(0)} min` },
              { icon: "Eye", label: "Avg views", value: number(p.avgViews).toFixed(0) },
              { icon: "GitCompareArrows", label: "Comparisons", value: number(p.avgComparisons).toFixed(1) },
            ];
            return h(
              "article",
              { key: p.personaId, className: "card-interactive p-6" },
              h(
                "div",
                { className: "flex items-start justify-between gap-4 mb-5 flex-wrap" },
                h(
                  "div",
                  { className: "min-w-0" },
                  h(
                    "div",
                    { className: "flex items-center gap-2.5 flex-wrap" },
                    h("span", { className: "text-2xl leading-none" }, p.emoji || "\u{1F9D1}\u{200D}\u{1F4BB}"),
                    h("h3", { className: "text-base font-extrabold text-ink-900" }, p.name),
                    h("span", { className: "badge-accent font-mono" }, `Cluster ${p.personaId}`),
                    p.signature && h("span", { className: "badge-outline font-mono" }, p.signature)
                  ),
                  h("p", { className: "text-sm text-muted mt-1.5 max-w-xl" }, p.description)
                ),
                h(
                  "div",
                  { className: "text-right flex-none" },
                  h("div", { className: "metric" }, `${p.percentage}%`),
                  h(
                    "div",
                    { className: "text-2xs text-muted mt-0.5" },
                    `${p.customerCount} customers`,
                    // `matchScore` is a raw rule score (range depends on the
                    // weights) and is not a ratio, so it is not shown as a
                    // percentage. `confidence` is the normalised 0-1 measure
                    // derived from the margin over the runner-up.
                    p.confidence != null
                      ? ` · ${(p.confidence * 100).toFixed(0)}% confidence`
                      : p.matchScore != null
                        ? ` · score ${number(p.matchScore).toFixed(1)}`
                        : ""
                  )
                )
              ),
              h(
                "div",
                { className: "grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" },
                metrics.map((m) =>
                  h(
                    "div",
                    { key: m.label, className: "sunken-panel p-3.5" },
                    h(
                      "div",
                      { className: "flex items-center gap-1.5 mb-1" },
                      icon(m.icon, { size: 12, className: "text-primary" }),
                      h("span", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, m.label)
                    ),
                    h("div", { className: "text-sm font-extrabold text-ink-900 tabular" }, m.value)
                  )
                )
              ),
              p.dominantCategories?.length > 0 &&
                h(
                  "div",
                  { className: "flex flex-wrap gap-2 mb-4" },
                  p.dominantCategories.map((c) => h("span", { key: c._id || c, className: "badge-primary" }, c.name || c))
                ),
              p.marketingStrategy &&
                h(
                  "div",
                  { className: "flex items-start gap-3 rounded-xl border border-brand-200 bg-primary-soft p-4" },
                  icon("Target", { size: 16, className: "text-primary mt-0.5 flex-none" }),
                  h(
                    "div",
                    null,
                    h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-primary mb-0.5" }, "Suggested marketing strategy"),
                    h("p", { className: "text-sm text-ink-700 leading-relaxed" }, p.marketingStrategy)
                  )
                ),
              PersonaEvidence({ persona: p })
            );
          })
    );

    const honestySection = h(
      "section",
      { className: "surface-panel p-5 space-y-3" },
      h("h2", { className: "text-2xs font-bold uppercase tracking-[0.12em] text-muted flex items-center gap-1.5" }, icon("Sparkles", { size: 12 }), " How to read this page"),
      h(
        "ul",
        { className: "space-y-2 text-2xs text-muted leading-relaxed" },
        h(
          "li",
          { className: "flex items-start gap-2" },
          icon("Link2", { size: 11, className: "mt-1 flex-none" }),
          h(
            "span",
            null,
            "The segmentation is ",
            h("span", { className: "font-bold text-ink-800" }, "K-Means"),
            ", and every cluster, profile and persona above comes from one K-Means partition. Agglomerative, DBSCAN and a consensus blend are still fitted on the same data and are still stored, but they are comparison output and never supply the numbers here."
          )
        ),
        h(
          "li",
          { className: "flex items-start gap-2" },
          icon("Target", { size: 11, className: "mt-1 flex-none" }),
          h(
            "span",
            null,
            "A persona name is awarded by scoring measured cluster means against each candidate label and keeping the best one-to-one match. Open ",
            h("span", { className: "font-bold text-ink-800" }, "Why this persona"),
            " on any card to see the contributing features, the population mean it was compared against, and which labels it beat."
          )
        ),
        h(
          "li",
          { className: "flex items-start gap-2" },
          icon("RefreshCw", { size: 11, className: "mt-1 flex-none" }),
          h(
            "span",
            null,
            "Re-running replaces this segmentation. Customer profiles pick up the new clusters immediately. Percentages describe the customers who had enough behaviour to be clustered at all, not the whole user base."
          )
        )
      ),
      h(
        "div",
        { className: "pt-1" },
        h("a", link("/admin/clusters", { className: "btn-secondary btn-sm" }), icon("FlaskConical", { size: 14 }), " Full cluster detail in the Cluster Lab")
      )
    );

    mount(
      contentHost,
      h(
        "div",
        { className: "animate-fade-in space-y-5" },
        h(
          "header",
          { className: "flex flex-col sm:flex-row sm:items-end justify-between gap-4" },
          h(
            "div",
            null,
            h("span", { className: "page-eyebrow" }, icon("Brain", { size: 12 }), " Customer Intelligence"),
            h("h1", { className: "page-title" }, "Customer personas"),
            h(
              "p",
              { className: "page-sub" },
              `Every customer is scored on ${number(st.data?.featureCount) || 46} behaviour features, then grouped by `,
              h("span", { className: "font-bold text-ink-800" }, sourceLabel),
              ". The names below are read off the clusters that resulted — they are not assigned in advance."
            )
          ),
          paintRunButton("Re-run segmentation", "RefreshCw", "Running…")
        ),
        st.step && h("div", { className: "alert alert-info" }, icon("Loader2", { size: 15, className: "animate-spin flex-none" }), h("span", null, st.step)),
        st.error && h("div", { className: "alert alert-danger" }, icon("AlertTriangle", { size: 15, className: "flex-none" }), h("span", null, st.error)),
        // Legacy runs stored personas from the hybrid consensus before K-Means became
        // the reported result. Say so plainly and point at the re-run rather than
        // letting a legacy segmentation pass as the current K-Means one.
        st.data?.needsRerun &&
          personas.length > 0 &&
          h(
            "div",
            { className: "alert alert-warning" },
            icon("AlertTriangle", { size: 15, className: "flex-none" }),
            h(
              "span",
              null,
              "These personas come from a ",
              h("strong", null, "legacy hybrid consensus"),
              " run that predates the K-Means primary, so they are not yet the reported segmentation. Re-run segmentation to regenerate them from the K-Means partition."
            )
          ),
        h(
          "section",
          { className: "surface-panel p-5" },
          h("h2", { className: "text-2xs font-bold uppercase tracking-[0.12em] text-muted mb-3.5" }, "How these personas were produced"),
          h(
            "ol",
            { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" },
            PipelineStep({ icon: "Database", label: "Behaviour events", value: `${totalCustomers.toLocaleString("en-IN")} customers`, detail: "One row per customer, from events, orders, offers and reviews." }),
            PipelineStep({ icon: "Grid3x3", label: "Features", value: `${number(st.data?.featureCount) || 46} per customer`, detail: "Activity, commerce, timing and category interest." }),
            PipelineStep({ icon: "Sigma", label: "Scaled", value: st.data?.scaling?.scalerClass || "StandardScaler", detail: "So no single feature dominates the distance." }),
            PipelineStep({
              icon: "TargetIcon",
              label: sourceLabel,
              value: `${numClusters} cluster${numClusters === 1 ? "" : "s"}`,
              detail: st.data?.kSelection?.reason
                ? `K chosen from a validation sweep: ${st.data.kSelection.reason}`
                : st.data?.needsRerun
                  ? "Stored from an earlier run. Re-run to use the current K-Means primary."
                  : "K chosen from a validation sweep.",
            })
          )
        ),
        h(
          "section",
          { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" },
          h(
            "div",
            { className: "stat-card" },
            h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, "Algorithm"),
            h("p", { className: "text-lg font-extrabold text-ink-900 mt-1" }, sourceLabel),
            h("p", { className: "text-2xs text-muted mt-0.5" }, "The reported segmentation")
          ),
          h(
            "div",
            { className: "stat-card" },
            h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, "Customers clustered"),
            h("p", { className: "text-lg font-extrabold text-ink-900 mt-1 tabular" }, totalCustomers.toLocaleString("en-IN")),
            h(
              "p",
              { className: "text-2xs text-muted mt-0.5" },
              unclusteredCustomers > 0 ? `Held back as unclustered: ${unclusteredCustomers}` : "Enough behaviour to be measurable"
            )
          ),
          h(
            "div",
            { className: "stat-card" },
            h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, "Clusters"),
            h(
              "p",
              { className: "text-lg font-extrabold text-ink-900 mt-1 tabular" },
              numClusters,
              h("span", { className: "text-sm font-bold text-muted ml-1.5" }, `${namedCount} named`)
            ),
            h(
              "p",
              { className: "text-2xs text-muted mt-0.5" },
              numClusters - namedCount > 0 ? `${numClusters - namedCount} below the naming threshold` : "All cleared the naming threshold"
            )
          ),
          h(
            "div",
            { className: "stat-card" },
            h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, "Run"),
            h(
              "p",
              { className: "text-sm font-extrabold text-ink-900 mt-1" },
              st.data?.runDate ? new Date(st.data.runDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"
            ),
            h("p", { className: "text-2xs text-muted mt-0.5 font-mono truncate", title: st.data?.runId }, st.data?.runId || "")
          )
        ),
        metricsGrid,
        distributionSection,
        personasSection,
        honestySection
      )
    );
  };

  paint();
  load();

  return root;
}