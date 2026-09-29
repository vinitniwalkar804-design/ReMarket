/**
 * Admin console — machine learning lab.
 *
 * Vanilla port of `pages/admin/AdminMLLab.jsx`.
 *
 * The read-out of the stored `/ml/results` run: methodology steps, the consensus
 * agreement between each base algorithm and the hybrid partition, a cluster-count
 * comparison, and the personas the run produced. Re-running POSTs `/ml/run`,
 * then reloads; name, run stamp and feature count all come from the stored run.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { formatDateTime, formatNumber } from "../../utils/format.js";
import { C } from "../../utils/theme.js";

const ALGO_META = {
  kmeans: { label: "K-Means", badge: "badge-info" },
  agglomerative: { label: "Agglomerative", badge: "badge-primary" },
  dbscan: { label: "DBSCAN", badge: "badge-danger" },
  hybrid: { label: "Hybrid Consensus", badge: "badge-accent" },
};

const agreementBar = (v) => {
  if (v == null) return { bar: "bg-line-strong", tone: "text-muted" };
  if (v > 0.7) return { bar: "bg-success", tone: "text-success" };
  if (v > 0.4) return { bar: "bg-warning", tone: "text-warning" };
  return { bar: "bg-danger", tone: "text-danger" };
};

export default function AdminMLLab() {
  const st = { data: null, loading: true, running: false, step: "" };
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
    paint();
    try {
      const { data } = await api.get("/ml/results");
      if (!ensureAlive()) return;
      st.data = data;
    } catch {
      if (!ensureAlive()) return;
    }
    st.loading = false;
    paint();
  };

  const run = async () => {
    st.running = true;
    st.step = "Building customer features from behavior events…";
    paint();
    try {
      await api.post("/ml/run");
      st.step = "Consensus ensemble complete — personas written.";
      await load();
      clearTimeout(stepTimer);
      stepTimer = setTimeout(() => {
        if (!ensureAlive()) return;
        st.step = "";
        paint();
      }, 4000);
    } catch (err) {
      if (!ensureAlive()) return;
      st.step = err.response?.data?.message || "ML run failed";
    }
    st.running = false;
    paint();
  };

  const runButton = (idleLabel, idleIcon = "RefreshCw") =>
    h(
      "button",
      { type: "button", onClick: run, disabled: st.running, className: "btn-primary" },
      st.running ? icon("Loader2", { size: 15, className: "animate-spin" }) : icon(idleIcon, { size: 15 }),
      st.running ? " Running pipeline…" : ` ${idleLabel}`
    );

  const paint = () => {
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "animate-fade-in space-y-5" },
          h("div", { className: "h-9 w-56 bg-sunken rounded-lg animate-pulse" }),
          h(
            "div",
            { className: "grid lg:grid-cols-3 gap-5" },
            [0, 1, 2].map(() => h("div", { className: "h-64 rounded-2xl bg-sunken animate-pulse" }))
          )
        )
      );
      return;
    }

    const results = st.data?.results || [];
    const hybrid = results.find((r) => r.algorithm === "hybrid");
    const others = results.filter((r) => r.algorithm !== "hybrid");

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
            h("span", { className: "page-eyebrow" }, icon("FlaskConical", { size: 12 }), " Machine learning"),
            h("h1", { className: "page-title" }, "ML Lab"),
            h("p", { className: "page-sub" }, "Hybrid ensemble segmentation — KMeans · Agglomerative · DBSCAN · weighted consensus.")
          ),
          h("div", { className: "self-start" }, runButton(st.data?.hasResults ? "Re-run pipeline" : "Run pipeline"))
        ),
        st.step &&
          h(
            "div",
            { className: `alert animate-fade-in ${st.running ? "alert-info" : st.step.includes("complete") ? "alert-success" : "alert-danger"}` },
            st.running
              ? icon("Loader2", { size: 15, className: "animate-spin flex-none" })
              : st.step.includes("complete")
                ? icon("CheckCircle2", { size: 15, className: "flex-none" })
                : icon("XCircle", { size: 15, className: "flex-none" }),
            h("span", null, st.step)
          ),
        !st.data?.hasResults
          ? h(
              "div",
              { className: "panel p-12 text-center" },
              h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("FlaskConical", { size: 22 })),
              h("h3", { className: "font-extrabold text-ink-900" }, "No runs yet"),
              h("p", { className: "text-sm text-muted mt-1 max-w-sm mx-auto" }, "Run the pipeline once to build the full customer intelligence suite."),
              h("div", { className: "mt-5 flex justify-center" }, runButton("Run first segmentation", "FlaskConical"))
            )
          : hybrid
            ? [
                h(
                  "div",
                  { className: "grid lg:grid-cols-3 gap-5" },
                  h(
                    "section",
                    { className: "panel lg:col-span-2" },
                    h(
                      "div",
                      { className: "panel-head" },
                      h(
                        "div",
                        { className: "flex items-center gap-2.5" },
                        icon("GitBranch", { size: 16, className: "text-primary" }),
                        h(
                          "div",
                          null,
                          h("h2", { className: "panel-title" }, "Methodology"),
                          h("p", { className: "panel-sub" }, hybrid.methodology?.name || "Ensemble consensus clustering")
                        )
                      )
                    ),
                    h(
                      "div",
                      { className: "panel-body" },
                      h(
                        "ol",
                        { className: "space-y-3" },
                        (hybrid.methodology?.steps || []).map((s, i) =>
                          h(
                            "li",
                            { key: i, className: "flex items-start gap-3" },
                            h("span", { className: "w-6 h-6 rounded-full bg-primary-soft text-primary text-2xs font-extrabold flex items-center justify-center flex-none mt-0.5" }, i + 1),
                            h("span", { className: "text-sm text-ink-700 leading-relaxed" }, s)
                          )
                        ),
                        (hybrid.methodology?.steps || []).length === 0 && h("li", { className: "text-sm text-muted-soft" }, "No methodology steps recorded.")
                      ),
                      h(
                        "div",
                        { className: "mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2" },
                        h("span", { className: "badge-primary" }, icon("Layers", { size: 11 }), ` ${hybrid.methodology?.featureCount || 0} features`),
                        h("span", { className: "badge-neutral" }, formatDateTime(st.data.runDate)),
                        h("span", { className: "badge-neutral" }, `Run #${st.data.runId}`)
                      )
                    )
                  ),
                  h(
                    "section",
                    { className: "panel" },
                    h(
                      "div",
                      { className: "panel-head" },
                      h(
                        "div",
                        { className: "flex items-center gap-2.5" },
                        icon("Activity", { size: 16, className: "text-primary" }),
                        h("h2", { className: "panel-title" }, "Consensus agreement")
                      )
                    ),
                    h(
                      "div",
                      { className: "panel-body" },
                      h(
                        "div",
                        { className: "space-y-3.5" },
                        [
                          { label: "K-Means ↔ Hybrid (ARI)", value: hybrid.agreement?.ariKmeansVsHybrid, fmt: (v) => (v != null ? v.toFixed(3) : "—") },
                          { label: "Agglomerative ↔ Hybrid (ARI)", value: hybrid.agreement?.ariAgglomerativeVsHybrid, fmt: (v) => (v != null ? v.toFixed(3) : "—") },
                          { label: "Consensus strength", value: hybrid.agreement?.consensusStrength, fmt: (v) => (v != null ? `${(v * 100).toFixed(0)}%` : "—") },
                          { label: "DBSCAN noise", value: hybrid.agreement?.noiseLevel, fmt: (v) => (v != null ? `${v} pts` : "—") },
                        ].map((row) => {
                          const { bar, tone } = agreementBar(row.value);
                          return h(
                            "div",
                            { key: row.label },
                            h(
                              "div",
                              { className: "flex justify-between text-2xs mb-1 gap-2" },
                              h("span", { className: "text-muted" }, row.label),
                              h("span", { className: `font-extrabold tabular ${tone}` }, row.fmt(row.value))
                            ),
                            h(
                              "div",
                              { className: "h-1.5 rounded-full bg-sunken overflow-hidden" },
                              h("div", {
                                className: `h-full rounded-full transition-all duration-500 ${bar}`,
                                style: { width: `${Math.min(100, Math.max(0, (row.value ?? 0) * 100))}%` },
                              })
                            )
                          );
                        })
                      ),
                      h(
                        "p",
                        { className: "text-2xs text-muted-soft mt-4 pt-3 border-t border-line leading-relaxed" },
                        "ARI ≥ 0.9 means near-identical partitions — strong structural signal in the behavior data."
                      )
                    )
                  )
                ),
                h(
                  "section",
                  { className: "panel" },
                  h(
                    "div",
                    { className: "panel-head" },
                    h(
                      "div",
                      { className: "flex items-center gap-2.5" },
                      icon("BarChart3", { size: 16, className: "text-primary" }),
                      h("h2", { className: "panel-title" }, "Algorithm comparison")
                    ),
                    h("span", { className: "badge-neutral" }, `${others.length} base algorithms`)
                  ),
                  h(
                    "div",
                    { className: "panel-body" },
                    h(
                      "div",
                      { className: "grid sm:grid-cols-3 gap-3" },
                      others.map((r, i) => {
                        const meta = ALGO_META[r.algorithm] || { label: r.algorithm, badge: "badge-neutral" };
                        return h(
                          "div",
                          { key: r.algorithm, className: "sunken-panel p-4" },
                          h("span", { className: `badge ${meta.badge}` }, meta.label),
                          h(
                            "div",
                            { className: "mt-2 flex items-baseline gap-2" },
                            h("span", { className: "metric" }, r.numClusters ?? r.size ?? "—"),
                            h("span", { className: "w-2.5 h-2.5 rounded-full flex-none", style: { background: [C.info, C.primary, C.danger][i % 3] } })
                          ),
                          h(
                            "div",
                            { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-0.5" },
                            "clusters",
                            typeof r.noiseCount === "number" ? ` · ${r.noiseCount} noise` : ""
                          )
                        );
                      }),
                      others.length === 0 && h("p", { className: "text-sm text-muted-soft col-span-3" }, "No base algorithm results recorded.")
                    )
                  )
                ),
                h(
                  "section",
                  { className: "panel" },
                  h(
                    "div",
                    { className: "panel-head" },
                    h(
                      "div",
                      { className: "flex items-center gap-2.5" },
                      icon("Network", { size: 16, className: "text-primary" }),
                      h("h2", { className: "panel-title" }, "Discovered personas")
                    ),
                    h("a", link("/admin/personas", { className: "link-more text-xs" }), icon("Sparkles", { size: 13 }), " Explore personas")
                  ),
                  h(
                    "div",
                    { className: "panel-body space-y-4" },
                    (st.data.personas || []).map((p) =>
                      h(
                        "div",
                        { key: p.personaId, className: "flex flex-col sm:flex-row items-start sm:items-center gap-3" },
                        h(
                          "div",
                          { className: "w-full sm:max-w-[200px] flex-none" },
                          h("div", { className: "text-sm font-bold text-ink-900" }, p.name),
                          h("div", { className: "text-2xs text-muted font-mono" }, `persona #${p.personaId}`)
                        ),
                        h(
                          "div",
                          { className: "flex-1 w-full" },
                          h(
                            "div",
                            { className: "h-3 rounded-full bg-sunken overflow-hidden" },
                            h("div", {
                              className: "h-full rounded-full bg-primary transition-all duration-500",
                              style: { width: `${Math.max(4, p.percentage)}%` },
                            })
                          )
                        ),
                        h(
                          "div",
                          { className: "text-right flex-none w-28" },
                          h("div", { className: "text-sm font-extrabold text-primary tabular" }, `${p.percentage}%`),
                          h("div", { className: "text-2xs text-muted tabular" }, `${formatNumber(p.customerCount)} customers`)
                        )
                      )
                    ),
                    (st.data.personas || []).length === 0 && h("p", { className: "text-sm text-muted-soft" }, "No personas produced by this run.")
                  )
                ),
              ]
            : h(
                "div",
                { className: "panel p-12 text-center" },
                h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("FlaskConical", { size: 20 })),
                h("h3", { className: "font-extrabold text-ink-900" }, "Run incomplete"),
                h("p", { className: "text-sm text-muted mt-1" }, "Results exist but no hybrid consensus block was produced. Re-run the pipeline."),
                h("div", { className: "mt-5 flex justify-center" }, runButton("Re-run pipeline"))
              )
      )
    );
  };

  paint();
  load();

  return root;
}