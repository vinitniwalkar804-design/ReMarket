import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Store, Search, Star, ShieldCheck, ShieldX, Flag, ChevronLeft, ChevronRight, User,
} from "lucide-react";
import api from "../../services/api.js";
import { formatINR, formatDate, formatNumber } from "../../utils/format.js";
import { orderTone, listingTone } from "../../utils/theme.js";
import { SkeletonRow } from "../../components/Loading.jsx";
import { LISTING_STATUS_LABELS, reasonLabel } from "../../utils/moderation.js";
import Modal from "../../components/Modal.jsx";

const PAGE_SIZE = 15;

/**
 * The seller directory, split out of the old "Sellers & Reports" page.
 *
 * Two decisions live here that used to be nowhere. Verification is the admin's
 * to grant or revoke, so it is a real action against the server rather than a
 * read-only badge. And "is this seller a problem?" is answered by opening the
 * seller, because a seller with three moderated listings is a different situation
 * from one with a single rejected typo - the table can show the count, only the
 * detail can show the pattern.
 */
export default function AdminSellers() {
  const [sellers, setSellers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search.trim()) params.set("search", search.trim());
    if (onlyVerified) params.set("verified", "true");
    if (onlyFlagged) params.set("flagged", "true");
    return api
      .get(`/admin/sellers?${params}`)
      .then(({ data }) => {
        setSellers(data.sellers || []);
        setTotal(data.total || 0);
      })
      .catch(() => setSellers([]))
      .finally(() => setLoading(false));
  }, [page, search, onlyVerified, onlyFlagged]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openDetail = async (id) => {
    setDetail({ loading: true });
    try {
      const { data } = await api.get(`/admin/sellers/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    }
  };

  const setVerification = async (seller, value) => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/admin/sellers/${seller._id}`, { isVerifiedSeller: value });
      setToast(data.message);
      await load();
      if (detail?.seller?._id === seller._id) openDetail(seller._id);
    } catch (err) {
      setToast(err.response?.data?.message || "That change could not be saved");
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(
    () => ({
      listings: sellers.reduce((n, s) => n + (s.listings || 0), 0),
      sold: sellers.reduce((n, s) => n + (s.soldCount || 0), 0),
      flagged: sellers.reduce((n, s) => n + (s.flaggedCount || 0), 0),
    }),
    [sellers]
  );

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="page-eyebrow">
            <Store size={12} /> Marketplace Intelligence
          </span>
          <h1 className="page-title">Sellers</h1>
          <p className="page-sub">
            {loading ? "Loading sellers…" : `${total} seller account${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading} className="btn-icon" aria-label="Previous page">
            <ChevronLeft size={15} />
          </button>
          <span className="text-2xs font-bold text-muted tabular px-1">
            {page} / {pages}
          </span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages || loading} className="btn-icon" aria-label="Next page">
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setOnlyVerified(false);
              setOnlyFlagged(false);
              setPage(1);
            }}
            className={`chip ${!onlyVerified && !onlyFlagged ? "chip-active" : "chip-idle"}`}
          >
            All sellers
          </button>
          <button
            onClick={() => {
              setOnlyVerified(!onlyVerified);
              setOnlyFlagged(false);
              setPage(1);
            }}
            className={`chip ${onlyVerified ? "chip-active" : "chip-idle"}`}
          >
            Verified
          </button>
          <button
            onClick={() => {
              setOnlyFlagged(!onlyFlagged);
              setOnlyVerified(false);
              setPage(1);
            }}
            className={`chip ${onlyFlagged ? "chip-active" : "chip-idle"}`}
          >
            Needs a look
            {totals.flagged > 0 && <span className="ml-1 opacity-60 tabular">{totals.flagged}</span>}
          </button>
        </div>
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search seller names…"
            className="input-field pl-9"
            aria-label="Search sellers"
          />
        </div>
      </div>

      {loading ? (
        <div className="panel p-5 space-y-3">
          {Array(6).fill(0).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : sellers.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <Store size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">No sellers match</h3>
          <p className="text-sm text-muted mt-1">Try clearing the filters above.</p>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th className="th-num">Listings</th>
                  <th className="th-num">Sold</th>
                  <th className="th-num">Orders</th>
                  <th className="th-num">Rating</th>
                  <th>Standing</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="avatar w-9 h-9 flex-none">{s.name?.charAt(0)?.toUpperCase()}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-900 line-clamp-1">{s.name}</p>
                          <p className="text-2xs text-muted-soft truncate">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="num">{formatNumber(s.listings || 0)}</td>
                    <td className="num">{formatNumber(s.soldCount || 0)}</td>
                    <td className="num">{formatNumber(s.orderCount || 0)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-900">
                        <Star size={12} className="text-warning" fill="currentColor" />
                        {(s.sellerRating ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.isVerifiedSeller ? (
                          <span className="badge badge-success">
                            <ShieldCheck size={10} /> Verified
                          </span>
                        ) : (
                          <span className="badge badge-neutral">Unverified</span>
                        )}
                        {s.flaggedCount > 0 && (
                          <span className="badge badge-warning" title="Moderated listings">
                            {s.flaggedCount} flagged
                          </span>
                        )}
                        {s.openReports > 0 && (
                          <span className="badge badge-danger" title="Open customer reports">
                            <Flag size={10} /> {s.openReports}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn-secondary btn-xs" onClick={() => openDetail(s._id)}>
                          <User size={12} /> Open
                        </button>
                        <button
                          className={s.isVerifiedSeller ? "btn-quiet btn-xs" : "btn-secondary btn-xs"}
                          onClick={() => setVerification(s, !s.isVerifiedSeller)}
                          disabled={busy}
                          title={s.isVerifiedSeller ? "Revoke verified-seller status" : "Grant verified-seller status"}
                        >
                          {s.isVerifiedSeller ? <ShieldX size={12} /> : <ShieldCheck size={12} />}
                          {s.isVerifiedSeller ? "Revoke" : "Verify"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line bg-raised">
              <span className="text-2xs text-muted">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary btn-sm">
                  <ChevronLeft size={13} /> Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn-secondary btn-sm">
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[110] badge badge-success shadow-pop px-4 py-2.5 animate-slide-up">
          {toast}
        </div>
      )}

      {/* ---------- seller detail ---------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        wide
        title={detail?.seller?.name || "Seller"}
        subtitle={
          detail?.seller
            ? `${detail.seller.email} · joined ${formatDate(detail.seller.createdAt)}`
            : undefined
        }
        footer={
          detail?.seller && (
            <div className="flex items-center justify-end gap-2 w-full">
              <button
                className={detail.seller.isVerifiedSeller ? "btn-quiet btn-sm mr-auto" : "btn-secondary btn-sm mr-auto"}
                onClick={() => setVerification(detail.seller, !detail.seller.isVerifiedSeller)}
                disabled={busy}
              >
                {detail.seller.isVerifiedSeller ? <ShieldX size={13} /> : <ShieldCheck size={13} />}
                {detail.seller.isVerifiedSeller ? "Revoke verification" : "Verify seller"}
              </button>
              <button className="btn-primary btn-sm" onClick={() => setDetail(null)}>
                Done
              </button>
            </div>
          )
        }
      >
        {detail?.loading || !detail?.seller ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Listings", value: Object.values(detail.listingBreakdown || {}).reduce((a, b) => a + b, 0) },
                { label: "Sold", value: detail.listingBreakdown?.sold || 0 },
                { label: "Orders", value: detail.orders?.length || 0 },
                { label: "Revenue", value: formatINR(detail.revenue || 0) },
              ].map((card) => (
                <div key={card.label} className="rounded-lg border border-line bg-raised px-3 py-2">
                  <p className="text-2xs font-bold uppercase tracking-wide text-muted-soft">{card.label}</p>
                  <p className="text-base font-extrabold text-ink-900 tabular">{card.value}</p>
                </div>
              ))}
            </div>

            {Object.keys(detail.listingBreakdown || {}).length > 0 && (
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2">
                  Listings by status
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(detail.listingBreakdown).map(([status, count]) => (
                    <span key={status} className={`badge capitalize border ${listingTone(status)}`}>
                      {LISTING_STATUS_LABELS[status] || status}: {count}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {detail.listings?.length > 0 && (
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2">
                  Their listings
                </h4>
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {detail.listings.map((p) => (
                    <li
                      key={p._id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ink-900 line-clamp-1">{p.title}</p>
                        <p className="text-2xs text-muted-soft">
                          {p.categoryName} · {formatINR(p.price)}
                          {p.moderationReason ? ` · ${reasonLabel(p.moderationReason)}` : ""}
                        </p>
                      </div>
                      <span className={`badge capitalize border flex-none ${listingTone(p.status)}`}>
                        {LISTING_STATUS_LABELS[p.status] || p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.reports?.length > 0 && (
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5">
                  <Flag size={12} /> Reports against this seller
                </h4>
                <ul className="space-y-1.5">
                  {detail.reports.map((r) => (
                    <li key={r._id} className="rounded-lg border border-line bg-raised px-3.5 py-2">
                      <p className="text-xs font-bold text-ink-900">
                        {reasonLabel(r.reason)}
                        <span className="text-muted-soft font-normal ml-2">{formatDate(r.createdAt)}</span>
                      </p>
                      <p className="text-2xs text-muted">
                        {r.status} · {r.productTitle || "listing removed"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.orders?.length > 0 && (
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2">
                  Recent orders
                </h4>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {detail.orders.map((o) => (
                    <li
                      key={o._id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ink-900 line-clamp-1">
                          {o.productId?.title || "Listing removed"}
                        </p>
                        <p className="text-2xs text-muted-soft">
                          to {o.buyerId?.name || "a buyer"} · {formatDate(o.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-none">
                        <span className={`badge ${orderTone(o.status)}`}>{o.status}</span>
                        <span className="text-xs font-bold text-ink-900 tabular">{formatINR(o.finalPrice)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
