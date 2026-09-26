import { useState, useEffect } from "react";
import { ShoppingCart, Receipt, Timer, Users, Wallet } from "lucide-react";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/Loading.jsx";
import { formatINR, timeAgo } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/orders")
      .then(({ data }) => {
        setOrders(data.orders || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const gmv = orders.reduce((s, o) => s + (Number(o.finalPrice) || 0), 0);
  const avgDecision = orders.length
    ? Math.round(orders.reduce((s, o) => s + (Number(o.decisionTimeMinutes) || 0), 0) / orders.length)
    : 0;

  const stats = [
    { icon: Receipt, label: "Total orders", value: loading ? "—" : total },
    { icon: Wallet, label: "Listed GMV", value: loading || !gmv ? "—" : formatINR(gmv) },
    { icon: Timer, label: "Avg decision", value: loading ? "—" : avgDecision ? `${avgDecision} min` : "—" },
    { icon: Users, label: "On this page", value: loading ? "—" : orders.length },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <header>
        <span className="page-eyebrow">
          <ShoppingCart size={12} /> Transactions
        </span>
        <h1 className="page-title">Orders</h1>
        <p className="page-sub">Every completed purchase, newest first.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between">
              <s.icon size={16} className="text-primary" />
              <span className="metric-label">{s.label}</span>
            </div>
            <p className="metric mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="panel p-5 space-y-3">
          {Array(6).fill(0).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <ShoppingCart size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">No orders yet</h3>
          <p className="text-sm text-muted mt-1">Completed purchases will appear here as buyers check out.</p>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Buyer</th>
                  <th>Seller</th>
                  <th className="th-num">Amount</th>
                  <th className="th-num">Decision</th>
                  <th>Placed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td className="font-semibold text-ink-900 line-clamp-1 max-w-[260px]">
                      {o.productTitle || o.productId?.title}
                    </td>
                    <td className="text-muted">{o.buyerId?.name || "—"}</td>
                    <td className="text-muted">{o.sellerId?.name || "—"}</td>
                    <td className="num">{formatINR(o.finalPrice)}</td>
                    <td className="num text-muted">
                      {o.decisionTimeMinutes ? `${o.decisionTimeMinutes} min` : "—"}
                    </td>
                    <td className="text-muted whitespace-nowrap">{timeAgo(o.createdAt)}</td>
                    <td>
                      <span className={`badge capitalize ${orderTone(o.status)}`}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
