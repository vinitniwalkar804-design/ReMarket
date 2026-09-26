import { useState, useEffect } from "react";
import { Route, ZoomIn, Activity, Users, TrendingDown, TrendingUp, Lightbulb } from "lucide-react";
import api from "../../services/api.js";
import { timeAgo, formatNumber } from "../../utils/format.js";

export default function AdminJourney() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/journey")
      .then(({ data }) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="h-9 w-64 bg-sunken rounded-lg animate-pulse" />
        <div className="h-64 rounded-2xl bg-sunken animate-pulse" />
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-sunken animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const funnel = data?.funnel || [];
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));
  const recent = data?.recentEvents || [];
  const overall = funnel.length
    ? ((funnel[funnel.length - 1]?.count || 0) / Math.max(1, funnel[0]?.count || 1)) * 100
    : 0;

  return (
    <div className="animate-fade-in space-y-5">
      <header>
        <span className="page-eyebrow">
          <Route size={12} /> Behaviour analytics
        </span>
        <h1 className="page-title">Customer journey</h1>
        <p className="page-sub">
          Every stage computed live from stored behavior events — not guesses.
        </p>
      </header>

      {/* ---------- funnel ---------- */}
      <section className="panel">
        <div className="panel-head">
          <div className="flex items-center gap-2.5">
            <ZoomIn size={16} className="text-primary" />
            <div>
              <h2 className="panel-title">Conversion funnel</h2>
              <p className="panel-sub">Stage-by-stage drop-off across all users</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right hidden sm:block">
              <span className="text-2xs font-bold uppercase tracking-[0.1em] text-muted block">Journeys</span>
              <span className="text-sm font-extrabold text-ink-900 tabular">
                {formatNumber(data?.journeys || 0)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xs font-bold uppercase tracking-[0.1em] text-muted block">
                Search → buy
              </span>
              <span
                className={`text-sm font-extrabold tabular ${
                  overall >= 5 ? "text-success" : "text-warning"
                }`}
              >
                {overall.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
        <div className="panel-body space-y-4">
          {funnel.length === 0 ? (
            <p className="text-sm text-muted-soft">No funnel stages computed yet.</p>
          ) : (
            funnel.map((f, i) => {
              const pct = (f.count / maxCount) * 100;
              const prev = i > 0 ? funnel[i - 1].count : null;
              const drop = prev ? (1 - f.count / prev) * 100 : null;
              return (
                <div key={f.stage} className="group">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-sm font-semibold text-ink-800">
                      <span className="text-muted-soft tabular mr-1.5">{i + 1}.</span>
                      {f.stage}
                    </span>
                    <span className="text-2xs flex items-center gap-2 flex-none">
                      {drop !== null && drop > 0 && (
                        <span className="badge-danger">
                          <TrendingDown size={10} /> {drop.toFixed(0)}%
                        </span>
                      )}
                      {drop !== null && drop <= 0 && (
                        <span className="badge-success">
                          <TrendingUp size={10} /> +{(Math.abs(drop)).toFixed(0)}%
                        </span>
                      )}
                      <span className="text-sm font-extrabold text-ink-900 tabular">
                        {formatNumber(f.count)}
                      </span>
                    </span>
                  </div>
                  <div className="h-3.5 rounded-lg bg-sunken overflow-hidden">
                    <div
                      className="h-full rounded-lg bg-primary transition-all duration-500 group-hover:bg-primary-hover"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ---------- recent events ---------- */}
        <section className="panel">
          <div className="panel-head">
            <div className="flex items-center gap-2.5">
              <Activity size={16} className="text-primary" />
              <h2 className="panel-title">Latest behavior events</h2>
            </div>
            <span className="badge-neutral">{recent.length}</span>
          </div>
          <div className="panel-body max-h-[440px] overflow-y-auto">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-soft">No behavior recorded yet.</p>
            ) : (
              <div className="space-y-1">
                {recent.map((e, i) => (
                  <div
                    key={`${e.timestamp}-${i}`}
                    className="flex items-center gap-3 py-2 border-b border-line last:border-0"
                  >
                    <span className="w-2 h-2 rounded-full bg-primary flex-none" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-900 truncate capitalize">
                        {String(e.eventType || "").replace(/_/g, " ")}
                      </div>
                      {e.productId?.title && (
                        <div className="text-2xs text-muted truncate">{e.productId.title}</div>
                      )}
                    </div>
                    <span className="text-2xs text-muted-soft flex-none">{timeAgo(e.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------- insights ---------- */}
        <section className="panel">
          <div className="panel-head">
            <div className="flex items-center gap-2.5">
              <Lightbulb size={16} className="text-rating" />
              <h2 className="panel-title">Funnel insights</h2>
            </div>
          </div>
          <div className="panel-body space-y-3">
            {funnel.length > 1 && (
              <Insight
                icon={overall < 5 ? TrendingDown : TrendingUp}
                tone={overall < 5 ? "danger" : "success"}
                title={
                  overall < 5
                    ? "Big drop between discovery and conversion"
                    : "Healthy discovery-to-purchase rate"
                }
                body={`${funnel[0].stage.toLowerCase()} events (${formatNumber(
                  funnel[0].count
                )}) flow through ${funnel.length} stages to purchase (${formatNumber(
                  funnel[funnel.length - 1].count
                )}). Re-check product page CTA placements if the biggest drop sits between Compare and Cart.`}
              />
            )}
            {data?.journeys > 0 && (
              <Insight
                icon={Users}
                tone="primary"
                title={`${formatNumber(data.journeys)} distinct buyer journeys`}
                body="Each journey is grouped per user from their first to last recorded event — used to power feature engineering and cluster assignment."
              />
            )}
            <Insight
              icon={Activity}
              tone="accent"
              title="Behavior first, analytics second"
              body="Every number here is computed on-the-fly from BehaviorEvent, Order, Offer, Wishlist and PriceWatch documents — nothing hardcoded."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Insight({ icon: Icon, tone = "primary", title, body }) {
  const tones = {
    primary: "border-brand-200 bg-primary-soft text-primary",
    accent: "border-accent/25 bg-accent-soft text-accent",
    success: "border-success/25 bg-success-soft text-success",
    danger: "border-danger/25 bg-danger-soft text-danger",
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${tones[tone]}`}>
      <Icon size={15} className="mt-0.5 flex-none" />
      <div>
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
