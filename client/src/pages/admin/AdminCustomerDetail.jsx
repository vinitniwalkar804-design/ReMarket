import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Brain, Search, Eye, Clock, Heart, Gift, Tags, ShoppingBag, Wallet,
  Hexagon, UserCheck, Activity, Package,
} from "lucide-react";
import api from "../../services/api.js";
import { fallbackFor } from "../../utils/images.js";
import { formatINR } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";

export default function AdminCustomerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/admin/customers/${id}`)
      .then(({ data }) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="h-9 w-40 bg-sunken rounded-lg animate-pulse" />
        <div className="h-36 rounded-2xl bg-sunken animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-2xl border border-line bg-surface animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel p-12 text-center">
        <span className="icon-tile-primary mx-auto mb-4">
          <UserCheck size={20} />
        </span>
        <h3 className="font-extrabold text-ink-900">Customer not found</h3>
        <p className="text-sm text-muted mt-1">This profile may have been removed, or the link is stale.</p>
        <Link to="/admin/customers" className="btn-primary mt-5">
          <ArrowLeft size={15} /> Back to customers
        </Link>
      </div>
    );
  }

  const {
    user, features, persona, clusterId, timeline = [], orders = [], purchaseCount,
    totalSpending, searchBehavior, viewedCategories, wishlistCount, priceWatches, offers = [],
  } = data;

  const featureRows = features
    ? Object.entries(features).filter(([k, v]) => typeof v === "number" && k !== "_id").slice(0, 25)
    : [];
  const topSearches = searchBehavior ? searchBehavior.slice(0, 4).map((s) => s._id) : [];
  const topCategories = viewedCategories ? viewedCategories.slice(0, 4).map((c) => c._id) : [];

  const stats = [
    { icon: ShoppingBag, label: "Purchases", value: purchaseCount ?? 0 },
    {
      icon: Wallet,
      label: "Total spending",
      value: totalSpending >= 0 ? formatINR(totalSpending) : "—",
      tone: "text-success",
    },
    { icon: Hexagon, label: "Cluster", value: clusterId === undefined || clusterId === null ? "—" : `#${clusterId}` },
    { icon: UserCheck, label: "Account", value: user.isActive ? "Active" : "Inactive" },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <Link to="/admin/customers" className="link-more text-xs">
        <ArrowLeft size={13} /> Back to customers
      </Link>

      {/* ---------- identity ---------- */}
      <header className="relative overflow-hidden rounded-3xl mesh-primary text-white p-6 sm:p-7">
        <div className="absolute inset-0 bg-dots opacity-25" />
        <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-24 w-56 h-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/12 backdrop-blur border border-white/20 text-lg font-extrabold flex items-center justify-center flex-none">
            {user.name?.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold truncate">{user.name}</h1>
            <p className="text-sm text-white/65 truncate font-mono">{user.email}</p>
            <p className="text-2xs text-white/45 mt-0.5">{user.location || "No location set"}</p>
          </div>
          {persona && (
            <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur px-5 py-3 text-center flex-none">
              <div className="text-2xs text-white/55 uppercase tracking-[0.12em] font-bold">Persona</div>
              <div className="font-bold text-sm mt-0.5">{persona.name}</div>
              {persona.signature && (
                <div className="text-2xs font-mono text-accent-200 mt-0.5">{persona.signature}</div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ---------- metrics ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between">
              <s.icon size={16} className="text-primary" />
              <span className="metric-label">{s.label}</span>
            </div>
            <p className={`metric mt-2 ${s.tone || ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ---------- persona rationale ---------- */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title flex items-center gap-2">
              <Brain size={16} className="text-primary" /> Why this persona
            </h2>
            <p className="panel-sub">The signals the segmentation model used to assign this cluster</p>
          </div>
          {clusterId !== -1 && clusterId != null && <span className="badge-accent">Cluster #{clusterId}</span>}
        </div>
        <div className="panel-body">
          {persona ? (
            <div className="grid lg:grid-cols-4 gap-5">
              <div className="rounded-2xl border border-brand-200 bg-primary-soft p-5 text-center flex flex-col justify-center">
                <div className="text-3xl mb-2">{persona.emoji || "🧑‍💻"}</div>
                <div className="font-extrabold text-primary">{persona.name}</div>
                {persona.signature && (
                  <div className="text-2xs font-mono text-primary/70 mt-0.5">{persona.signature}</div>
                )}
                <div className="text-2xs text-muted mt-2">
                  {persona.percentage ?? "—"}% of customers
                </div>
              </div>

              <div className="lg:col-span-3 grid sm:grid-cols-2 gap-5">
                <div>
                  <p className="input-label flex items-center gap-1.5">
                    <Search size={11} /> Top searches
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {topSearches.length ? (
                      topSearches.map((s) => (
                        <span key={s} className="chip-idle">{s}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-soft">No searches yet</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="input-label flex items-center gap-1.5">
                    <Eye size={11} /> Viewed categories
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {topCategories.length ? (
                      topCategories.map((s) => (
                        <span key={s} className="chip-idle">{s}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-soft">No views yet</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="input-label flex items-center gap-1.5">
                    <Activity size={11} /> Engagement signals
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="chip-idle"><Heart size={11} className="text-magenta" /> {wishlistCount ?? 0} wishlist</span>
                    <span className="chip-idle"><Gift size={11} className="text-rating" /> {priceWatches ?? 0} watches</span>
                    <span className="chip-idle"><Tags size={11} className="text-primary" /> {offers.length} offers</span>
                    <span className="chip-idle">
                      <Clock size={11} className="text-info" />
                      {features?.decisionTime ? `${Math.round(features.decisionTime)}m` : "—"} decision
                    </span>
                  </div>
                </div>
                <div>
                  <p className="input-label">Profile</p>
                  <p className="text-sm text-muted leading-relaxed">
                    {persona.description || "This customer matches a behavior pattern learned from the model."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {persona === null && clusterId !== -1
                ? "Run segmentation to discover this customer's persona."
                : "This customer is not assigned to any persona yet — run segmentation from Personas."}
            </p>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ---------- features ---------- */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Feature values</h2>
              <p className="panel-sub">Built from raw behavior data</p>
            </div>
            <span className="badge-neutral">{featureRows.length} signals</span>
          </div>
          <div className="panel-body">
            {featureRows.length ? (
              <div className="grid grid-cols-2 gap-x-5">
                {featureRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-line py-2 text-xs">
                    <span className="text-muted capitalize truncate">{k.replace(/([A-Z])/g, " $1")}</span>
                    <span className="font-bold text-ink-900 tabular flex-none">{v.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-soft">No numeric features computed yet.</p>
            )}
          </div>
        </section>

        {/* ---------- timeline ---------- */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Behavioral timeline</h2>
              <p className="panel-sub">Most recent first</p>
            </div>
            <span className="badge-neutral">{timeline.length} events</span>
          </div>
          <div className="panel-body max-h-[420px] overflow-y-auto">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-soft">No recorded behavior</p>
            ) : (
              <div className="space-y-0">
                {timeline.map((e, i) => (
                  <div key={`${e.timestamp}-${i}`} className="flex gap-3 relative pb-4 last:pb-0">
                    {i < timeline.length - 1 && (
                      <div className="absolute left-[5px] top-4 bottom-0 w-px bg-line" />
                    )}
                    <span
                      className={`w-3 h-3 rounded-full mt-1.5 flex-none border-2 ${
                        i === 0 ? "bg-primary border-brand-200" : "bg-line-strong border-line"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-900 capitalize">
                        {String(e.eventType || "").replace(/_/g, " ")}
                      </div>
                      <div className="text-2xs text-muted">
                        {new Date(e.timestamp).toLocaleString()}
                        {e.productId ? ` · ${e.productId.title || "product"}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---------- orders ---------- */}
        <section className="panel lg:col-span-2">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Purchase history</h2>
              <p className="panel-sub">Completed checkouts by this customer</p>
            </div>
            <span className="badge-neutral">{orders.length} orders</span>
          </div>
          <div className="panel-body">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-soft">No purchases yet</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div
                    key={o._id}
                    className="flex items-center gap-3 border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <div className="w-10 h-10 bg-sunken rounded-lg overflow-hidden flex-none">
                      {o.productId?.images?.[0] ? (
                        <img
                          src={o.productId.images[0]}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = fallbackFor(o.productId);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-soft">
                          <Package size={14} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-900 truncate">
                        {o.productId?.title || o.productTitle || "Product"}
                      </div>
                      <div className="text-2xs text-muted">
                        {new Date(o.createdAt).toLocaleDateString()} · Decision: {o.decisionTimeMinutes} min
                      </div>
                    </div>
                    <span className="font-extrabold text-sm text-ink-900 tabular flex-none">
                      {formatINR(o.finalPrice)}
                    </span>
                    <span className={`badge capitalize ${orderTone(o.status)}`}>{o.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
