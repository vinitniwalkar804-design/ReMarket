import { useState, useEffect } from "react";
import { RefreshCw, Network, Share2, Loader2, CheckCircle2, XCircle, Radar, Layers } from "lucide-react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis, Cell } from "recharts";
import api from "../../services/api.js";
import { C, SERIES, chartAxis, chartGrid } from "../../utils/theme.js";

const ALGOS = [
  { key: "hybrid", label: "Hybrid", dot: C.success, badge: "badge-success", desc: "Consensus ensemble of K-Means + Agglomerative + DBSCAN noise" },
  { key: "kmeans", label: "K-Means", dot: C.primary, badge: "badge-primary", desc: "Centroid-based partitional clustering" },
  { key: "agglomerative", label: "Agglomerative", dot: C.magenta, badge: "badge-magenta", desc: "Bottom-up hierarchical clustering (Ward linkage)" },
  { key: "dbscan", label: "DBSCAN", dot: C.warning, badge: "badge-warning", desc: "Density-based clustering (handles noise/outliers)" },
];

const ALGO_MAP = Object.fromEntries(ALGOS.map((a) => [a.key, a]));
const COLORS = [...SERIES, ...SERIES];

const metricTone = (v) => {
  if (v == null) return "text-muted";
  if (v >= 0.7) return "text-success";
  if (v >= 0.4) return "text-warning";
  return "text-danger";
};

export default function AdminClusters() {
  const [viz, setViz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [algorithm, setAlgorithm] = useState("hybrid");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/visualization");
      setViz(data);
    } catch {}
    setLoading(false);
  };

  const run = async () => {
    setRunning(true);
    setStep("Running K-Means, Agglomerative, DBSCAN & Hybrid…");
    try {
      await api.post("/ml/run");
      setStep("Clustering complete.");
      await load();
      setTimeout(() => setStep(""), 3000);
    } catch (err) {
      setStep(err.response?.data?.message || "ML run failed");
    }
    setRunning(false);
  };

  useEffect(() => {
    load();
  }, []);

  const current = viz?.[algorithm];
  const pca = viz?.hybrid?.pcaData || viz?.kmeans?.pcaData || null;

  const points = (() => {
    if (!pca?.points) return [];
    return Object.entries(pca.points).map(([uid, pt]) => ({
      x: pt.x,
      y: pt.y,
      uid,
      cluster: current?.labels?.[uid] !== undefined ? current.labels[uid] : -1,
    }));
  })();

  const clustersFound = new Set(points.map((p) => p.cluster).filter((c) => c !== -1)).size;

  if (loading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="h-9 w-64 bg-sunken rounded-lg animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 h-[460px] rounded-2xl bg-sunken animate-pulse" />
          <div className="space-y-4">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-sunken animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <Network size={12} /> Unsupervised learning
          </span>
          <h1 className="page-title">Cluster visualization</h1>
          <p className="page-sub">
            PCA projection of the customer feature space — real pipeline results, not mock data.
          </p>
        </div>
        <button onClick={run} disabled={running} className="btn-primary self-start">
          {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {running ? "Running…" : "Run segmentation"}
        </button>
      </header>

      {step && (
        <div
          className={`alert animate-fade-in ${
            running ? "alert-info" : step.includes("complete") ? "alert-success" : "alert-danger"
          }`}
        >
          {running ? (
            <Loader2 size={15} className="animate-spin flex-none" />
          ) : step.includes("complete") ? (
            <CheckCircle2 size={15} className="flex-none" />
          ) : (
            <XCircle size={15} className="flex-none" />
          )}
          <span>{step}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ---------------- scatter ---------------- */}
        <section className="panel lg:col-span-2">
          <div className="panel-head flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <Radar size={16} className="text-primary" />
              <div>
                <h2 className="panel-title">PCA scatter plot</h2>
                <p className="panel-sub">PC1 vs PC2 · {points.length} customers plotted</p>
              </div>
            </div>
            <div className="tab-list">
              {ALGOS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAlgorithm(a.key)}
                  className={`tab ${algorithm === a.key ? "tab-active" : ""}`}
                >
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: a.dot }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-body">
            {current ? (
              <>
                <ResponsiveContainer width="100%" height={420}>
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                    <CartesianGrid {...chartGrid} />
                    <XAxis type="number" dataKey="x" name="PC1" {...chartAxis} />
                    <YAxis type="number" dataKey="y" name="PC2" {...chartAxis} />
                    <ZAxis range={[50, 60]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3", stroke: C.grid }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-elevated">
                            <div className="font-bold text-ink-900">
                              {d.cluster === -1 ? "Noise / unassigned" : `Cluster ${d.cluster}`}
                            </div>
                            <div className="text-muted font-mono mt-0.5 tabular">
                              PC1 {Number(d.x).toFixed(2)} · PC2 {Number(d.y).toFixed(2)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={points}>
                      {points.map((d, i) => (
                        <Cell
                          key={d.uid || i}
                          fill={d.cluster === -1 ? C.neutral : COLORS[Math.abs(d.cluster) % COLORS.length]}
                          fillOpacity={0.85}
                          stroke="#FFFFFF"
                          strokeWidth={0.5}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  {pca?.explainedVariance ? (
                    <p className="text-2xs text-muted font-mono tabular">
                      explained variance · PC1 {(pca.explainedVariance[0] * 100).toFixed(1)}% · PC2{" "}
                      {(pca.explainedVariance[1] * 100).toFixed(1)}%
                    </p>
                  ) : (
                    <span />
                  )}
                  <span className="badge-neutral">
                    <Layers size={11} /> {clustersFound} clusters in view
                  </span>
                </div>
              </>
            ) : (
              <div className="py-16 text-center">
                <span className="icon-tile-primary mx-auto mb-4">
                  <Network size={20} />
                </span>
                <p className="text-sm text-muted max-w-sm mx-auto">
                  No clustering results yet. Run segmentation to build the PCA visualization.
                </p>
                <button onClick={run} disabled={running} className="btn-primary mt-5">
                  {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Run segmentation
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ---------------- algorithm cards ---------------- */}
        <div className="space-y-4">
          {ALGOS.map((a) => {
            const r = viz?.[a.key];
            const maxCount = r?.distribution?.length
              ? Math.max(...r.distribution.map((x) => x.count))
              : 1;
            return (
              <section
                key={a.key}
                className={`panel transition-shadow ${algorithm === a.key ? "ring-1 ring-brand-200" : ""}`}
              >
                <div className="panel-head py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="icon-tile flex-none"
                      style={{ background: `${a.dot}1A`, color: a.dot }}
                    >
                      <Share2 size={15} />
                    </span>
                    <h3 className="panel-title capitalize">{a.label}</h3>
                  </div>
                  <span className={`badge ${a.badge}`}>{r?.numClusters || 0} clusters</span>
                </div>
                <div className="panel-body py-3.5">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="sunken-panel p-2">
                      <div className="text-[9px] uppercase tracking-[0.08em] font-bold text-muted">Silhouette</div>
                      <div className={`text-xs font-extrabold tabular mt-0.5 ${metricTone(r?.metrics?.silhouette)}`}>
                        {r?.metrics?.silhouette ?? "—"}
                      </div>
                    </div>
                    <div className="sunken-panel p-2">
                      <div className="text-[9px] uppercase tracking-[0.08em] font-bold text-muted">
                        Davies-Bouldin
                      </div>
                      <div className="text-xs font-extrabold tabular mt-0.5 text-ink-900">
                        {r?.metrics?.daviesBouldin ?? "—"}
                      </div>
                    </div>
                    <div className="sunken-panel p-2">
                      <div className="text-[9px] uppercase tracking-[0.08em] font-bold text-muted">
                        Calinski-Harabasz
                      </div>
                      <div className="text-xs font-extrabold tabular mt-0.5 text-ink-900">
                        {r?.metrics?.calinskiHarabasz ? Math.round(r.metrics.calinskiHarabasz) : "—"}
                      </div>
                    </div>
                  </div>

                  {a.key === "dbscan" && r && (
                    <div className="mt-2 text-center text-2xs text-muted-soft">
                      noise points: <b className="text-warning tabular">{r.noiseCount}</b>
                    </div>
                  )}

                  {r?.distribution?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[9px] uppercase tracking-[0.08em] font-bold text-muted mb-1.5">
                        Distribution
                      </div>
                      <div className="flex items-end gap-1 h-14">
                        {r.distribution.map((d) => (
                          <div
                            key={d.cluster}
                            className="flex-1 flex flex-col items-center gap-0.5"
                            title={`Cluster ${d.cluster}: ${d.count} customers`}
                          >
                            <span className="text-[9px] font-bold text-ink-900 tabular">{d.count}</span>
                            <div
                              className="w-full rounded-t-md transition-all duration-500"
                              style={{
                                height: `${Math.max(6, (d.count / maxCount) * 40)}px`,
                                background: d.cluster === -1 ? C.neutral : COLORS[Math.abs(d.cluster) % COLORS.length],
                                opacity: 0.85,
                              }}
                            />
                            <span className="text-[8px] text-muted-soft font-mono">
                              {d.cluster === -1 ? "noise" : d.cluster}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-2xs text-muted-soft mt-2.5 leading-relaxed">{a.desc}</p>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
