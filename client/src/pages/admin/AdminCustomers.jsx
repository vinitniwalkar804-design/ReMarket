import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Users, Search, Crown, ShoppingBag, Timer, Wallet, UserCheck } from "lucide-react";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/Loading.jsx";
import { formatINR, formatNumber } from "../../utils/format.js";

const PAGE_SIZE = 15;

const pageNumbers = (totalPages, current) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, current - 1, current, current + 1]);
  return [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    api
      .get(`/admin/customers?${params}`)
      .then(({ data }) => {
        setCustomers(data.customers || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, search]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const buyers = customers.filter((c) => (c.orderCount || 0) > 0).length;
  const sellers = customers.filter((c) => c.isVerifiedSeller).length;
  const spend = customers.reduce((s, c) => s + (Number(c.totalSpent) || 0), 0);

  const stats = [
    { icon: Users, label: "Customers", value: loading ? "—" : formatNumber(total) },
    { icon: Wallet, label: "Spend on page", value: loading ? "—" : formatINR(spend) },
    { icon: UserCheck, label: "Buyers on page", value: loading ? "—" : buyers },
    { icon: Crown, label: "Verified sellers", value: loading ? "—" : sellers },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="page-eyebrow">
            <Users size={12} /> People
          </span>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">
            Every registered account with its behavior profile, spend and clustering persona.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search name or email…"
            className="input-field pl-10"
          />
        </div>
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
      ) : customers.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <Users size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">No customers found</h3>
          <p className="text-sm text-muted mt-1">
            {search ? `Nothing matched "${search}". Try a different search.` : "No accounts registered yet."}
          </p>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Persona</th>
                  <th className="th-num">Orders</th>
                  <th className="th-num">Spent</th>
                  <th className="th-num">Decision</th>
                  <th className="th-num">Profile</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="avatar w-9 h-9 text-xs">{c.name?.charAt(0)}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-ink-900 flex items-center gap-1.5 truncate">
                            {c.name}
                            {c.isVerifiedSeller && <Crown size={12} className="text-rating" />}
                          </div>
                          <div className="text-2xs text-muted truncate">
                            {c.email} · {c.location || "no location"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.persona ? (
                        <span className="badge-primary">{c.persona}</span>
                      ) : (
                        <span className="text-2xs text-muted-soft">Not clustered</span>
                      )}
                    </td>
                    <td className="num">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <ShoppingBag size={12} className="text-muted-soft" />
                        {formatNumber(c.orderCount)}
                      </span>
                    </td>
                    <td className="num">{formatINR(c.totalSpent)}</td>
                    <td className="num text-muted">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Timer size={12} className="text-muted-soft" />
                        {c.decisionTime ? `${Math.round(c.decisionTime)}m` : "—"}
                      </span>
                    </td>
                    <td className="th-num">
                      <Link to={`/admin/customers/${c._id}`} className="btn-secondary btn-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line bg-raised">
              <span className="text-2xs text-muted">
                Page {page} of {pages} · {formatNumber(total)} customers
              </span>
              <div className="flex items-center gap-1">
                {pageNumbers(pages, page).map((p, idx, arr) => (
                  <span key={`p-${p}`} className="flex items-center gap-1">
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-2xs text-muted-soft px-0.5">…</span>}
                    <button
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-2xs font-bold transition-colors ${
                        page === p
                          ? "bg-primary text-white shadow-sm"
                          : "bg-white border border-line text-muted hover:border-line-strong hover:text-ink-900"
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
