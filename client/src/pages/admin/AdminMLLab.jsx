import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FlaskConical, RefreshCw, GitBranch, CheckCircle2, XCircle, Activity, Network,
  BarChart3, Layers, Loader2, Sparkles,
} from "lucide-react";
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/ml/results");
      setData(data);
    } catch {}
    setLoading(false);
  };

  const run = async () => {
    setRunning(true);
    setStep("Building customer features from behavior events…");
    try {
      await api.post("/ml/run");
      setStep("Consensus ensemble complete — personas written.");
      await load();
      setTimeout(() => setStep(""), 4000);
    } catch (err) {
      setStep(err.response?.data?.message || "ML run failed");
    }
    setRunning(false);
  };

  useEffect(() => {
    load();
  }, []);

  const results = data?.results || [];
  const hybrid = results.find((r) => r.algorithm === "hybrid");
  const others = results.filter((r) => r.algorithm !== "hybrid");

  if (loading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="h-9 w-56 bg-sunken rounded-lg animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-5">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-sunken animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <FlaskConical size={12} /> Machine learning
          </span>
          <h1 className="page-title">ML Lab</h1>
          <p className="page-sub">
            Hybrid ensemble segmentation — KMeans · Agglomerative · DBSCAN · weighted consensus.
          </p>
        </div>
        <button onClick={run} disabled={running} className="btn-primary self-start">
          {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {running ? "Running pipeline…" : data?.hasResults ? "Re-run pipeline" : "Run pipeline"}
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

      {!data?.hasResults ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <FlaskConical size={22} />
          </span>
          <h3 className="font-extrabold text-ink-900">No runs yet</h3>
          <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
            Run the pipeline once to build the full customer intelligence suite.
          </p>
          <button onClick={run} disabled={running} className="btn-primary mt-5">
            {running ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
            Run first segmentation
          </button>
        </div>
      ) : hybrid ? (
        <>
          <div className="grid lg:grid-cols-3 gap-5">
            {/* ---------- methodology ---------- */}
            <section className="panel lg:col-span-2">
              <div className="panel-head">
                <div className="flex items-center gap-2.5">
                  <GitBranch size={16} className="text-primary" />
                  <div>
                    <h2 className="panel-title">Methodology</h2>
                    <p className="panel-sub">{hybrid.methodology?.name || "Ensemble consensus clustering"}</p>
                  </div>
                </div>
              </div>
              <div className="panel-body">
                <ol className="space-y-3">
                  {(hybrid.methodology?.steps || []).map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary-soft text-primary text-2xs font-extrabold flex items-center justify-center flex-none mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-ink-700 leading-relaxed">{s}</span>
                    </li>
                  ))}
                  {(hybrid.methodology?.steps || []).length === 0 && (
                    <li className="text-sm text-muted-soft">No methodology steps recorded.</li>
                  )}
                </ol>
                <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
                  <span className="badge-primary">
                    <Layers size={11} /> {hybrid.methodology?.featureCount || 0} features
                  </span>
                  <span className="badge-neutral">{formatDateTime(data.runDate)}</span>
                  <span className="badge-neutral">Run #{data.runId}</span>
                </div>
              </div>
            </section>

            {/* ---------- agreement ---------- */}
            <section className="panel">
              <div className="panel-head">
                <div className="flex items-center gap-2.5">
                  <Activity size={16} className="text-primary" />
                  <h2 className="panel-title">Consensus agreement</h2>
                </div>
              </div>
              <div className="panel-body">
                <div className="space-y-3.5">
                  {[
                    {
                      label: "K-Means ↔ Hybrid (ARI)",
                      value: hybrid.agreement?.ariKmeansVsHybrid,
                      fmt: (v) => (v != null ? v.toFixed(3) : "—"),
                    },
                    {
                      label: "Agglomerative ↔ Hybrid (ARI)",
                      value: hybrid.agreement?.ariAgglomerativeVsHybrid,
                      fmt: (v) => (v != null ? v.toFixed(3) : "—"),
                    },
                    {
                      label: "Consensus strength",
                      value: hybrid.agreement?.consensusStrength,
                      fmt: (v) => (v != null ? `${(v * 100).toFixed(0)}%` : "—"),
                    },
                    {
                      label: "DBSCAN noise",
                      value: hybrid.agreement?.noiseLevel,
                      fmt: (v) => (v != null ? `${v} pts` : "—"),
                    },
                  ].map((row) => {
                    const { bar, tone } = agreementBar(row.value);
                    return (
                      <div key={row.label}>
                        <div className="flex justify-between text-2xs mb-1 gap-2">
                          <span className="text-muted">{row.label}</span>
                          <span className={`font-extrabold tabular ${tone}`}>{row.fmt(row.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${bar}`}
                            style={{ width: `${Math.min(100, Math.max(0, (row.value ?? 0) * 100))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-2xs text-muted-soft mt-4 pt-3 border-t border-line leading-relaxed">
                  ARI ≥ 0.9 means near-identical partitions — strong structural signal in the behavior data.
                </p>
              </div>
            </section>
          </div>

          {/* ---------- algorithm comparison ---------- */}
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <BarChart3 size={16} className="text-primary" />
                <h2 className="panel-title">Algorithm comparison</h2>
              </div>
              <span className="badge-neutral">{others.length} base algorithms</span>
            </div>
            <div className="panel-body">
              <div className="grid sm:grid-cols-3 gap-3">
                {others.map((r, i) => {
                  const meta = ALGO_META[r.algorithm] || { label: r.algorithm, badge: "badge-neutral" };
                  return (
                    <div key={r.algorithm} className="sunken-panel p-4">
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="metric">{r.numClusters ?? r.size ?? "—"}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-none"
                          style={{ background: [C.info, C.primary, C.danger][i % 3] }}
                        />
                      </div>
                      <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-0.5">
                        clusters{typeof r.noiseCount === "number" ? ` · ${r.noiseCount} noise` : ""}
                      </div>
                    </div>
                  );
                })}
                {others.length === 0 && (
                  <p className="text-sm text-muted-soft col-span-3">No base algorithm results recorded.</p>
                )}
              </div>
            </div>
          </section>

          {/* ---------- personas ---------- */}
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <Network size={16} className="text-primary" />
                <h2 className="panel-title">Discovered personas</h2>
              </div>
              <Link to="/admin/personas" className="link-more text-xs">
                <Sparkles size={13} /> Explore personas
              </Link>
            </div>
            <div className="panel-body space-y-4">
              {(data.personas || []).map((p) => (
                <div key={p.personaId} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="w-full sm:max-w-[200px] flex-none">
                    <div className="text-sm font-bold text-ink-900">{p.name}</div>
                    <div className="text-2xs text-muted font-mono">persona #{p.personaId}</div>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="h-3 rounded-full bg-sunken overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.max(4, p.percentage)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-none w-28">
                    <div className="text-sm font-extrabold text-primary tabular">{p.percentage}%</div>
                    <div className="text-2xs text-muted tabular">
                      {formatNumber(p.customerCount)} customers
                    </div>
                  </div>
                </div>
              ))}
              {(data.personas || []).length === 0 && (
                <p className="text-sm text-muted-soft">No personas produced by this run.</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <FlaskConical size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">Run incomplete</h3>
          <p className="text-sm text-muted mt-1">
            Results exist but no hybrid consensus block was produced. Re-run the pipeline.
          </p>
          <button onClick={run} disabled={running} className="btn-primary mt-5">
            {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Re-run pipeline
          </button>
        </div>
      )}
    </div>
  );
}
