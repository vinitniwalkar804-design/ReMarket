import { useState, useEffect } from "react";
import {
  Store, MessageSquare, Tag, TrendingUp, Percent, ShoppingCart, Layers,
} from "lucide-react";
import api from "../../services/api.js";
import { timeAgo, formatNumber } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";

const OFFER_TONE = {
  accepted: "badge-success",
  countered: "badge-accent",
  pending: "badge-info",
  offered: "badge-info",
  rejected: "badge-danger",
  declined: "badge-danger",
  withdrawn: "badge-neutral",
  cancelled: "badge-neutral",
};

const attractivenessTone = (pct, discount) => {
  if (pct > 50 && discount > 10) return "badge-success";
  if (pct >= 25) return "badge-warning";
  return "badge-neutral";
};

export default function AdminMarketplace() {
  const [reports, setReports] = useState(null);

  useEffect(() => {
    api.get("/admin/reports").then(({ data }) => setReports(data)).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <Store size={12} /> Marketplace health
          </span>
          <h1 className="page-title">Trust &amp; order flow</h1>
          <p className="page-sub">
            Reviews, negotiation depth and fulfilment across the marketplace.
          </p>
        </div>
      </header>

      {/* ================= REPORTS ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="panel">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <MessageSquare size={16} className="text-primary" />
                <h2 className="panel-title">Latest reviews</h2>
              </div>
              <span className="badge-neutral">{(reports?.reviewsLast7 || []).length}</span>
            </div>
            <div className="panel-body space-y-3">
              {(reports?.reviewsLast7 || []).length === 0 ? (
                <p className="text-sm text-muted-soft py-6 text-center">No reviews yet</p>
              ) : (
                (reports?.reviewsLast7 || []).map((r) => (
                  <div key={r._id} className="sunken-panel p-4">
                    <div className="flex items-center gap-2 text-2xs mb-1.5">
                      <span className="font-bold text-ink-900">{r.userName || "Customer"}</span>
                      <span className="flex items-center gap-0.5 text-rating">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={10}
                            className={i < (r.rating || 0) ? "fill-rating" : "text-line-strong"}
                          />
                        ))}
                      </span>
                      <span className="text-muted-soft ml-auto">{timeAgo(r.createdAt)}</span>
                    </div>
                    <p className="text-sm text-ink-800 leading-relaxed line-clamp-2">
                      {r.comment || "—"}
                    </p>
                    <div className="text-2xs text-muted mt-1.5">on {r.productTitle || "a product"}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="space-y-5">
            <section className="panel">
              <div className="panel-head">
                <div className="flex items-center gap-2.5">
                  <Tag size={16} className="text-primary" />
                  <h2 className="panel-title">Negotiation pipeline</h2>
                </div>
              </div>
              <div className="panel-body">
                <div className="grid grid-cols-2 gap-3">
                  {(reports?.offersByStatus || []).length === 0 ? (
                    <p className="text-sm text-muted-soft py-6 text-center col-span-2">No offers yet</p>
                  ) : (
                    (reports?.offersByStatus || []).map((o) => (
                      <div key={o._id} className="sunken-panel p-4 text-center">
                        <div className={`badge ${OFFER_TONE[o._id] || "badge-neutral"} capitalize`}>{o._id}</div>
                        <div className="metric mt-2">{formatNumber(o.count)}</div>
                        <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-0.5">
                          offers
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-2xs text-muted-soft mt-3 flex items-center gap-1.5">
                  <Percent size={11} /> Track outright buys vs negotiated deals to tune counter-offer guidance.
                </p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="flex items-center gap-2.5">
                  <TrendingUp size={16} className="text-primary" />
                  <h2 className="panel-title">Order fulfilment</h2>
                </div>
              </div>
              <div className="panel-body">
                <div className="grid grid-cols-2 gap-3">
                  {(reports?.ordersByStatus || []).length === 0 ? (
                    <p className="text-sm text-muted-soft py-6 text-center col-span-2">No orders yet</p>
                  ) : (
                    (reports?.ordersByStatus || []).map((o) => (
                      <div key={o._id} className="sunken-panel p-4 text-center">
                        <div className={`badge ${orderTone(o._id)} capitalize`}>{o._id}</div>
                        <div className="metric mt-2">{formatNumber(o.count)}</div>
                        <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-0.5">
                          orders
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>

          <section className="panel lg:col-span-2">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <Layers size={16} className="text-primary" />
                <div>
                  <h2 className="panel-title">Category listing offer-rate</h2>
                  <p className="panel-sub">
                    Share of negotiable listings and average discount depth per category
                  </p>
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="th-num">Listings</th>
                    <th className="th-num">Negotiable</th>
                    <th className="th-num">Avg discount</th>
                    <th className="th-num">Attractiveness</th>
                  </tr>
                </thead>
                <tbody>
                  {(reports?.categoryOfferRate || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted">
                        No category data yet
                      </td>
                    </tr>
                  ) : (
                    (reports?.categoryOfferRate || []).map((c) => {
                      const negotiablePct = Math.round((c.negotiableShare || 0) * 100);
                      const discount = Number(c.avgDiscount || 0);
                      const looks =
                        negotiablePct > 50 && discount > 10
                          ? "High"
                          : negotiablePct >= 25
                            ? "Medium"
                            : "Low";
                      return (
                        <tr key={c._id}>
                          <td className="font-semibold text-ink-900">{c._id}</td>
                          <td className="num text-muted">{formatNumber(c.products)}</td>
                          <td className="num">
                            <span className={`badge ${attractivenessTone(negotiablePct, discount)}`}>
                              {negotiablePct}%
                            </span>
                          </td>
                          <td className="num text-muted">{discount ? `${Math.round(discount)}%` : "—"}</td>
                          <td className="num">
                            <span className={`badge ${attractivenessTone(negotiablePct, discount)}`}>
                              {looks}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
    </div>
  );
}
