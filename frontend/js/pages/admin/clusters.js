/**
 * Admin console — cluster visualization.
 *
 * Vanilla port of `pages/admin/AdminClusters.jsx`.
 *
 * The sibling of the persona page: the same stored K-Means/Agglomerative/DBSCAN
 * Hybrid runs, projected onto the two principal components that `hybrid` (or
 * `kmeans`) computed. Selecting a tab recolours the same PCA points with that
 * algorithm's stored labels — the alpha-band scatter equivalent of the Recharts
 * ScatterChart is a hand-built inline SVG with native `<title>` tooltips
 * ("Cluster N · PC1 x · PC2 y"), grid, and PC1/PC2 ticks.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { C, SERIES, chartGrid } from "../../utils/theme.js";

const ALGOS = [
  { key: "hybrid", label: "Hybrid", dot: C.success, badge: "badge-success", desc: "Consensus ensemble of K-Means + Agglomerative + DBSCAN noise" },
  { key: "kmeans", label: "K-Means", dot: C.primary, badge: "badge-primary", desc: "Centroid-based partitional clustering" },
  { key: "agglomerative", label: "Agglomerative", dot: C.magenta, badge: "badge-magenta", desc: "Bottom-up hierarchical clustering (Ward linkage)" },
  { key: "dbscan", label: "DBSCAN", dot: C.warning, badge: "badge-warning", desc: "Density-based clustering (handles noise/outliers)" },
];

const COLORS = SERIES.concat(SERIES);

const metricTone = (v) => {
  if (v == null) return "text-muted";
  if (v >= 0.7) return "text-success";
  if (v >= 0.4) return "text-warning";
  return "text-danger";
};

const FMT = new Intl.NumberFormat("en-US");

/** Portal slip on synchronised ticks; PC1 (bottom) and PC2 (left) get six, drawn in the grid's slate. */
const TICK_COLOR = "#7C86A1";

export default function AdminClusters() {
  const st = { viz: null, loading: true, algorithm: "hybrid", running: false, step: "" };
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
      const { data } = await api.get("/admin/visualization");
      if (!ensureAlive()) return;
      st.viz = data;
    } catch {
      if (!ensureAlive()) return;
    }
    st.loading = false;
    paint();
  };

  const run = async () => {
    st.running = true;
    st.step = "Running K-Means, Agglomerative, DBSCAN & Hybrid…";
    paint();
    try {
      await api.post("/ml/run");
      st.step = "Clustering complete.";
      await load();
      clearTimeout(stepTimer);
      stepTimer = setTimeout(() => {
        if (!ensureAlive()) return;
        st.step = "";
        paint();
      }, 3000);
    } catch (err) {
      if (!ensureAlive()) return;
      st.step = err.response?.data?.message || "ML run failed";
    }
    st.running = false;
    paint();
  };

  const runButton = (idleLabel = "Run segmentation") =>
    h(
      "button",
      { type: "button", onClick: run, disabled: st.running, className: "btn-primary" },
      st.running ? icon("Loader2", { size: 15, className: "animate-spin" }) : icon("RefreshCw", { size: 15 }),
      st.running ? " Running…" : ` ${idleLabel}`
    );

  const scatter = (points) => {
    if (points.length === 0) return null;
    const W = 720;
    const H = 420;
    const padL = 42;
    const padR = 14;
    const padT = 14;
    const padB = 28;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (xMax - xMin < 1e-6) {
      xMin -= 1;
      xMax += 1;
    }
    if (yMax - yMin < 1e-6) {
      yMin -= 1;
      yMax += 1;
    }
    const padX = (xMax - xMin) * 0.05;
    const padY = (yMax - yMin) * 0.05;
    xMin -= padX;
    xMax += padX;
    yMin -= padY;
    yMax += padY;

    const L = padL;
    const R = W - padR;
    const T = padT;
    const B = H - padB;
    const mapX = (v) => L + ((v - xMin) / (xMax - xMin)) * (R - L);
    const mapY = (v) => B - ((v - yMin) / (yMax - yMin)) * (B - T);

    const gridLines = [];
    for (let i = 0; i <= 5; i++) {
      const gx = L + (i / 5) * (R - L);
      gridLines.push(h("line", { x1: gx, y1: T, x2: gx, y2: B, stroke: chartGrid.stroke, strokeDasharray: chartGrid.strokeDasharray, strokeOpacity: 0.6, "vector-effect": "non-scaling-stroke" }));
      if (points.length > 0 && i < 5) {
        const v = xMin + (i / 5) * (xMax - xMin);
        gridLines.push(
          h("text", { x: gx, y: H - 8, textAnchor: "middle", fontSize: 9, fill: TICK_COLOR, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }, v.toFixed(1))
        );
      }
    }
    for (let i = 0; i <= 5; i++) {
      const gy = T + (i / 5) * (B - T);
      gridLines.push(h("line", { x1: L, y1: gy, x2: R, y2: gy, stroke: chartGrid.stroke, strokeDasharray: chartGrid.strokeDasharray, strokeOpacity: 0.6, "vector-effect": "non-scaling-stroke" }));
      if (i < 5) {
        const v = yMax - (i / 5) * (yMax - yMin);
        gridLines.push(
          h("text", { x: 8, y: gy + 3, textAnchor: "middle", fontSize: 9, fill: TICK_COLOR, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }, v.toFixed(1))
        );
      }
    }

    const dots = points.map((p) => {
      const fill = p.cluster === -1 ? C.neutral : COLORS[Math.abs(p.cluster) % COLORS.length];
      return h(
        "circle",
        {
          cx: mapX(p.x),
          cy: mapY(p.y),
          r: 3,
          fill,
          fillOpacity: 0.85,
          stroke: "#FFFFFF",
          strokeWidth: 0.5,
        },
        h("title", null, `${p.cluster === -1 ? "Noise / unassigned" : `Cluster ${p.cluster}`}\nPC1 ${p.x.toFixed(2)} \u00B7 PC2 ${p.y.toFixed(2)}`)
      );
    });

    return h(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, width: "100%", height: 420, preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": "PCA scatter plot of the customer feature space" },
      gridLines,
      h("text", { x: R / 2 + L / 2, y: H - 8, textAnchor: "middle", fontSize: 10, fontWeight: 600, fill: TICK_COLOR }, "PC1"),
      h("text", { x: 12, y: (B + T) / 2 + 3, textAnchor: "middle", fontSize: 10, fontWeight: 600, fill: TICK_COLOR, transform: "rotate(-90 12 210)" }, "PC2"),
      dots
    );
  };

  const paint = () => {
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "animate-fade-in space-y-5" },
          h("div", { className: "h-9 w-64 bg-sunken rounded-lg animate-pulse" }),
          h(
            "div",
            { className: "grid lg:grid-cols-3 gap-5" },
            h("div", { className: "lg:col-span-2 h-[460px] rounded-2xl bg-sunken animate-pulse" }),
            h(
              "div",
              { className: "space-y-4" },
              [0, 1, 2, 3].map(() => h("div", { className: "h-36 rounded-2xl bg-sunken animate-pulse" }))
            )
          )
        )
      );
      return;
    }

    const current = st.viz?.[st.algorithm];
    const pca = st.viz?.hybrid?.pcaData || st.viz?.kmeans?.pcaData || null;
    const points = pca?.points
      ? Object.entries(pca.points).map(([uid, pt]) => ({
          x: pt.x,
          y: pt.y,
          uid,
          cluster: current?.labels?.[uid] !== undefined ? current.labels[uid] : -1,
        }))
      : [];
    const clustersFound = new Set(points.map((p) => p.cluster).filter((c) => c !== -1)).size;

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
            h("span", { className: "page-eyebrow" }, icon("Network", { size: 12 }), " Unsupervised learning"),
            h("h1", { className: "page-title" }, "Cluster visualization"),
            h("p", { className: "page-sub" }, "PCA projection of the customer feature space — real pipeline results, not mock data.")
          ),
          h("div", { className: "self-start" }, runButton())
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
        h(
          "div",
          { className: "grid lg:grid-cols-3 gap-5" },
          h(
            "section",
            { className: "panel lg:col-span-2" },
            h(
              "div",
              { className: "panel-head flex-wrap gap-3" },
              h(
                "div",
                { className: "flex items-center gap-2.5" },
                icon("Radar", { size: 16, className: "text-primary" }),
                h(
                  "div",
                  null,
                  h("h2", { className: "panel-title" }, "PCA scatter plot"),
                  h("p", { className: "panel-sub" }, `PC1 vs PC2 \u00B7 ${points.length} customers plotted`)
                )
              ),
              h(
                "div",
                { className: "tab-list" },
                ALGOS.map((a) =>
                  h(
                    "button",
                    { key: a.key, type: "button", onClick: () => { st.algorithm = a.key; paint(); }, className: `tab ${st.algorithm === a.key ? "tab-active" : ""}` },
                    h("span", { className: "w-2 h-2 rounded-full flex-none", style: { background: a.dot } }),
                    h("span", null, a.label)
                  )
                )
              )
            ),
            h(
              "div",
              { className: "panel-body" },
              current
                ? [
                    scatter(points),
                    h(
                      "div",
                      { className: "mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3" },
                      pca?.explainedVariance
                        ? h(
                            "p",
                            { className: "text-2xs text-muted font-mono tabular" },
                            `explained variance \u00B7 PC1 ${(pca.explainedVariance[0] * 100).toFixed(1)}% \u00B7 PC2 ${(pca.explainedVariance[1] * 100).toFixed(1)}%`
                          )
                        : h("span", null),
                      h("span", { className: "badge-neutral" }, icon("Layers", { size: 11 }), ` ${clustersFound} clusters in view`)
                    ),
                  ]
                : h(
                    "div",
                    { className: "py-16 text-center" },
                    h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Network", { size: 20 })),
                    h(
                      "p",
                      { className: "text-sm text-muted max-w-sm mx-auto" },
                      "No clustering results yet. Run segmentation to build the PCA visualization."
                    ),
                    h("div", { className: "mt-5 flex justify-center" }, runButton())
                  )
            )
          ),
          h(
            "aside",
            { className: "space-y-4" },
            ALGOS.map((a) => {
              const r = st.viz?.[a.key];
              const maxCount = r?.distribution?.length ? Math.max(...r.distribution.map((x) => x.count)) : 1;
              return h(
                "section",
                {
                  key: a.key,
                  className: `panel transition-shadow ${st.algorithm === a.key ? "ring-1 ring-brand-200" : ""}`,
                },
                h(
                  "div",
                  { className: "panel-head py-3" },
                  h(
                    "div",
                    { className: "flex items-center gap-2.5" },
                    h(
                      "span",
                      { className: "icon-tile flex-none", style: { background: `${a.dot}1A`, color: a.dot } },
                      icon("Share2", { size: 15 })
                    ),
                    h("h3", { className: "panel-title capitalize" }, a.label)
                  ),
                  h("span", { className: `badge ${a.badge}` }, `${r?.numClusters || 0} clusters`)
                ),
                h(
                  "div",
                  { className: "panel-body py-3.5" },
                  h(
                    "div",
                    { className: "grid grid-cols-3 gap-2 text-center" },
                    h(
                      "div",
                      { className: "sunken-panel p-2" },
                      h("div", { className: "text-[9px] uppercase tracking-[0.08em] font-bold text-muted" }, "Silhouette"),
                      h(
                        "div",
                        { className: `text-xs font-extrabold tabular mt-0.5 ${metricTone(r?.metrics?.silhouette)}` },
                        r?.metrics?.silhouette ?? "\u2014"
                      )
                    ),
                    h(
                      "div",
                      { className: "sunken-panel p-2" },
                      h("div", { className: "text-[9px] uppercase tracking-[0.08em] font-bold text-muted" }, "Davies-Bouldin"),
                      h(
                        "div",
                        { className: "text-xs font-extrabold tabular mt-0.5 text-ink-900" },
                        r?.metrics?.daviesBouldin ?? "\u2014"
                      )
                    ),
                    h(
                      "div",
                      { className: "sunken-panel p-2" },
                      h("div", { className: "text-[9px] uppercase tracking-[0.08em] font-bold text-muted" }, "Calinski-Harabasz"),
                      h(
                        "div",
                        { className: "text-xs font-extrabold tabular mt-0.5 text-ink-900" },
                        r?.metrics?.calinskiHarabasz ? Math.round(r.metrics.calinskiHarabasz) : "\u2014"
                      )
                    )
                  ),
                  a.key === "dbscan" &&
                    r &&
                    h(
                      "div",
                      { className: "mt-2 text-center text-2xs text-muted-soft" },
                      "noise points: ",
                      h("b", { className: "text-warning tabular" }, r.noiseCount)
                    ),
                  r?.distribution?.length > 0 &&
                    h(
                      "div",
                      { className: "mt-3" },
                      h("div", { className: "text-[9px] uppercase tracking-[0.08em] font-bold text-muted mb-1.5" }, "Distribution"),
                      h(
                        "div",
                        { className: "flex items-end gap-1 h-14" },
                        r.distribution.map((d) =>
                          h(
                            "div",
                            {
                              key: d.cluster,
                              className: "flex-1 flex flex-col items-center gap-0.5",
                              title: `Cluster ${d.cluster}: ${d.count} customers`,
                            },
                            h("span", { className: "text-[9px] font-bold text-ink-900 tabular" }, d.count),
                            h("div", {
                              className: "w-full rounded-t-md transition-all duration-500",
                              style: {
                                height: `${Math.max(6, (d.count / maxCount) * 40)}px`,
                                background: d.cluster === -1 ? C.neutral : COLORS[Math.abs(d.cluster) % COLORS.length],
                                opacity: 0.85,
                              },
                            }),
                            h("span", { className: "text-[8px] text-muted-soft font-mono" }, d.cluster === -1 ? "noise" : d.cluster)
                          )
                        )
                      )
                    ),
                  h("p", { className: "text-2xs text-muted-soft mt-2.5 leading-relaxed" }, a.desc)
                )
              );
            })
          )
        )
      )
    );
  };

  paint();
  load();

  return root;
}