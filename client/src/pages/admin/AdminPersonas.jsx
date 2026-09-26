import { useState, useEffect } from "react";
import { Brain, Target, Wallet, Timer, Eye, GitCompareArrows, Users, RefreshCw, Loader2 } from "lucide-react";
import api from "../../services/api.js";
import PersonaEvidence from "./PersonaEvidence.jsx";
import { formatINR } from "../../utils/format.js";

export default function AdminPersonas() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/personas");
      setData(data);
    } catch {}
    setLoading(false);
  };

  const run = async () => {
    setRunning(true);
    setStep("Clustering customers…");
    try {
      await api.post("/ml/run");
      setStep("Personas generated!");
      await load();
      setTimeout(() => setStep(""), 3000);
    } catch (err) {
      setStep(err.response?.data?.message || "ML run failed");
      setTimeout(() => setStep(""), 5000);
    }
    setRunning(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="h-9 w-64 bg-sunken rounded-lg animate-pulse" />
        <div className="h-64 rounded-2xl bg-sunken animate-pulse" />
      </div>
    );
  }

  const personas = data?.personas || [];
  const totalCustomers = personas.reduce((s, p) => s + (p.customerCount || 0), 0);

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <Brain size={12} /> Segmentation
          </span>
          <h1 className="page-title">Customer personas</h1>
          <p className="page-sub">
            Personas discovered from behavior patterns — never hardcoded.
          </p>
        </div>
        <button onClick={run} disabled={running} className="btn-primary">
          {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {running ? "Running…" : "Re-run segmentation"}
        </button>
      </header>

      {step && (
        <div className={`alert ${step.includes("!") ? "alert-success" : "alert-info"}`}>
          {running ? <Loader2 size={15} className="animate-spin flex-none" /> : <Brain size={15} className="flex-none" />}
          <span>{step}</span>
        </div>
      )}

      {personas.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <Brain size={22} />
          </span>
          <h3 className="font-extrabold text-ink-900">No personas discovered yet</h3>
          <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
            Run customer segmentation once to discover behavioral personas with signatures and
            confidence scores.
          </p>
          <button onClick={run} disabled={running} className="btn-primary mt-5">
            {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Run segmentation
          </button>
        </div>
      ) : (
        <>
          <div className="surface-panel px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">Discovered</span>
            <span className="text-sm font-extrabold text-ink-900">{personas.length} personas</span>
            <span className="text-sm text-muted">
              covering <span className="font-bold text-ink-800 tabular">{totalCustomers}</span> customers
            </span>
            <div className="flex-1 h-1.5 bg-sunken rounded-full overflow-hidden min-w-[160px]">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div className="grid gap-5">
            {personas.map((p) => {
              const metrics = [
                { icon: Wallet, label: "Avg spending", value: formatINR(p.avgSpending || 0) },
                { icon: Timer, label: "Decision time", value: `${Number(p.avgDecisionTime || 0).toFixed(0)} min` },
                { icon: Eye, label: "Avg views", value: Number(p.avgViews || 0).toFixed(0) },
                { icon: GitCompareArrows, label: "Comparisons", value: Number(p.avgComparisons || 0).toFixed(1) },
              ];
              return (
                <article key={p.personaId} className="card-interactive p-6">
                  <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-2xl leading-none">{p.emoji || "🧑‍💻"}</span>
                        <h2 className="text-base font-extrabold text-ink-900">{p.name}</h2>
                        {p.signature && <span className="badge-accent font-mono">{p.signature}</span>}
                      </div>
                      <p className="text-sm text-muted mt-1.5 max-w-xl">{p.description}</p>
                    </div>
                    <div className="text-right flex-none">
                      <div className="metric">{p.percentage}%</div>
                      <div className="text-2xs text-muted mt-0.5">
                        {p.customerCount} customers
                        {/* `matchScore` is a raw rule score (range depends on the
                            weights) and is not a ratio, so it is not shown as a
                            percentage. `confidence` is the normalised 0-1 measure
                            derived from the margin over the runner-up. */}
                        {p.confidence != null
                          ? ` · ${(p.confidence * 100).toFixed(0)}% confidence`
                          : p.matchScore != null
                            ? ` · score ${Number(p.matchScore).toFixed(1)}`
                            : ""}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    {metrics.map((m) => (
                      <div key={m.label} className="sunken-panel p-3.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <m.icon size={12} className="text-primary" />
                          <span className="text-2xs font-bold uppercase tracking-[0.1em] text-muted">
                            {m.label}
                          </span>
                        </div>
                        <div className="text-sm font-extrabold text-ink-900 tabular">{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {p.dominantCategories?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {p.dominantCategories.map((c) => (
                        <span key={c._id || c} className="badge-primary">
                          {c.name || c}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-primary-soft p-4">
                    <Target size={16} className="text-primary mt-0.5 flex-none" />
                    <div>
                      <p className="text-2xs font-bold uppercase tracking-[0.1em] text-primary mb-0.5">
                        Suggested marketing strategy
                      </p>
                      <p className="text-sm text-ink-700 leading-relaxed">{p.marketingStrategy}</p>
                    </div>
                  </div>

                  <PersonaEvidence persona={p} />
                </article>
              );
            })}
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-line bg-raised p-4">
            <Users size={15} className="text-muted flex-none mt-0.5" />
            <p className="text-2xs text-muted leading-relaxed">
              Personas are recomputed from the behavioral feature store. Re-running segmentation
              replaces the previous assignment — customer profile pages pick up the new clusters
              immediately.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
