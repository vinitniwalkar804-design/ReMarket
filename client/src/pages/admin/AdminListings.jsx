import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, ChevronLeft, ChevronRight, Layers, Search, ShieldAlert, Eye, EyeOff,
  RotateCcw, Trash2, Flag, X, AlertTriangle, History, Info,
} from "lucide-react";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/Loading.jsx";
import { imageProps } from "../../utils/images.js";
import { formatINR, formatDate } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";
import {
  LISTING_STATUS_LABELS,
  MODERATION_REASONS,
  reasonLabel,
} from "../../utils/moderation.js";
import Modal from "../../components/Modal.jsx";

const PAGE_SIZE = 15;

/** Sentinel target for the permanent-delete action, which is not a status change. */
const DELETE_TARGET = "__delete__";

/**
 * The listing's lifecycle, as buttons rather than as one status dropdown.
 *
 * A dropdown would technically be a smaller control, but it is the wrong shape
 * for this decision: five of the seven states need a reason, and a dropdown
 * cannot ask for one. Offering only the transitions that make sense from the
 * current state also removes the possibility of "available -> rejected" being
 * typed by accident. The server re-validates all of this regardless - this is
 * about not offering an admin a mistake in the first place.
 */
const TRANSITIONS = {
  available: [
    { to: "hidden", label: "Hide listing", icon: EyeOff, destructive: true, reason: true },
    { to: "suspended", label: "Suspend", icon: ShieldAlert, destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: X, destructive: true, reason: true },
    { to: "sold", label: "Mark sold", icon: Package, destructive: false, reason: false },
  ],
  hidden: [
    { to: "available", label: "Restore to live", icon: RotateCcw, destructive: false, reason: false },
    { to: "suspended", label: "Suspend", icon: ShieldAlert, destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: X, destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: Trash2, destructive: true, reason: true },
  ],
  suspended: [
    { to: "available", label: "Restore to live", icon: RotateCcw, destructive: false, reason: false },
    { to: "hidden", label: "Hide", icon: EyeOff, destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: X, destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: Trash2, destructive: true, reason: true },
  ],
  rejected: [
    { to: "available", label: "Restore to live", icon: RotateCcw, destructive: false, reason: false },
    { to: "hidden", label: "Hide", icon: EyeOff, destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: Trash2, destructive: true, reason: true },
  ],
  removed: [{ to: "available", label: "Restore to live", icon: RotateCcw, destructive: false, reason: false }],
  reserved: [{ to: "hidden", label: "Hide listing", icon: EyeOff, destructive: true, reason: true }],
  sold: [{ to: "available", label: "Return to live", icon: RotateCcw, destructive: false, reason: false }],
};

export default function AdminListings() {
  const [rows, setRows] = useState([]);
  const [facets, setFacets] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("policy_violation");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    return api
      .get(`/admin/products?${params}`)
      .then(({ data }) => {
        setRows(data.products || []);
        setTotal(data.total || 0);
        setFacets(data.facets?.byStatus || {});
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [page, status, search]);

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
      const { data } = await api.get(`/admin/products/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    }
  };

  const openAction = (row, transition) => {
    setError("");
    setReason("policy_violation");
    setNote("");
    setAction({ row, transition });
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      if (action.transition.to === DELETE_TARGET) {
        const { data } = await api.delete(`/admin/products/${action.row._id}`);
        setToast(data.message || "Listing deleted");
        setAction(null);
        setDetail(null);
        await load();
        return;
      }
      const { data } = await api.patch(`/admin/products/${action.row._id}/status`, {
        status: action.transition.to,
        reason: action.transition.reason ? reason : undefined,
        note: note.trim() || undefined,
      });
      setToast(data.message || "Listing updated");
      setAction(null);
      await load();
      if (detail?.product?._id === action.row._id) openDetail(action.row._id);
    } catch (err) {
      // The server is the authority on whether an action is allowed - it knows
      // about active orders and reservations that the table cannot show.
      setError(err.response?.data?.message || "That action could not be completed");
    } finally {
      setBusy(false);
    }
  };

  const statusChips = useMemo(    () => [
      { value: "", label: "All", count: Object.values(facets).reduce((a, b) => a + b, 0) },
      ...Object.keys(LISTING_STATUS_LABELS)
        .filter((s) => facets[s])
        .map((s) => ({ value: s, label: LISTING_STATUS_LABELS[s], count: facets[s] })),
    ],
    [facets]
  );

  const references = detail?.references;

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="page-eyebrow">
            <Layers size={12} /> Catalogue &amp; Sales
          </span>
          <h1 className="page-title">Listings</h1>
          <p className="page-sub">
            {loading ? "Loading listings…" : `${total} listing${total === 1 ? "" : "s"} match the current filter`}
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

      {/* Filters */}
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {statusChips.map((chip) => (
            <button
              key={chip.value || "all"}
              onClick={() => {
                setStatus(chip.value);
                setPage(1);
              }}
              className={`chip ${status === chip.value ? "chip-active" : "chip-idle"}`}
            >
              {chip.label}
              <span className="ml-1 opacity-60 tabular">{chip.count}</span>
            </button>
          ))}
        </div>
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search listing titles…"
            className="input-field pl-9"
            aria-label="Search listings"
          />
        </div>
      </div>

      {loading ? (
        <div className="panel p-5 space-y-3">
          {Array(6).fill(0).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel p-12 text-center">
          <span className="icon-tile-primary mx-auto mb-4">
            <Package size={20} />
          </span>
          <h3 className="font-extrabold text-ink-900">No listings match</h3>
          <p className="text-sm text-muted mt-1">Try clearing the filters above.</p>
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Category</th>
                  <th>Seller</th>
                  <th className="th-num">Price</th>
                  <th className="th-num">Views</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-sunken rounded-lg overflow-hidden flex-none">
                          <img alt={p.title} {...imageProps(p)} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-sm font-semibold text-ink-900 line-clamp-1 max-w-[260px]">
                          {p.title}
                        </span>
                        {p.openReportCount > 0 && (
                          <span className="badge badge-danger flex-none" title={`${p.openReportCount} open report(s)`}>
                            <Flag size={10} /> {p.openReportCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-muted">{p.categoryName || "—"}</td>
                    <td className="text-muted">{p.seller?.name || p.sellerName || "—"}</td>
                    <td className="num">{formatINR(p.price)}</td>
                    <td className="num">{p.views ?? 0}</td>
                    <td>
                      <span className={`badge capitalize border ${listingTone(p.status)}`}>
                        {LISTING_STATUS_LABELS[p.status] || p.status}
                      </span>
                      {p.moderationReason && (
                        <span className="block text-2xs text-muted-soft mt-1 max-w-[160px] truncate">
                          {reasonLabel(p.moderationReason)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openDetail(p._id)} className="btn-secondary btn-xs" title="Inspect this listing">
                          <Eye size={12} /> Inspect
                        </button>
                        {(TRANSITIONS[p.status] || []).slice(0, 1).map((t) => (
                          <button
                            key={t.to}
                            onClick={() => openAction(p, t)}
                            className={t.destructive ? "btn-danger btn-xs" : "btn-secondary btn-xs"}
                          >
                            <t.icon size={12} /> {t.label}
                          </button>
                        ))}
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

      {/* ---------- Action confirmation ---------- */}
      <Modal
        open={Boolean(action)}
        onClose={() => !busy && setAction(null)}
        title={action ? `${action.transition.label}?` : ""}
        subtitle={
          !action
            ? undefined
            : action.transition.to === DELETE_TARGET
              ? "This cannot be undone. The listing and its price history are removed for good. Its tracked activity is kept for marketplace reporting."
              : action.transition.destructive
                ? `"${action.row.title}" will stop appearing in search, the catalogue and every public listing feed. The seller is notified and can fix the details, but only an admin can put it back.`
                : `"${action.row.title}" will go live again in search and the catalogue.`
        }
        footer={
          <>
            <button className="btn-quiet" onClick={() => setAction(null)} disabled={busy}>
              Cancel
            </button>
            <button
              className={action?.transition.destructive ? "btn-danger" : "btn-primary"}
              onClick={runAction}
              disabled={busy}
            >
              {busy ? "Working…" : action?.transition.label}
            </button>
          </>
        }
      >
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft border border-danger/25 px-3.5 py-2.5 text-xs font-semibold text-danger">
            <AlertTriangle size={14} className="mt-px flex-none" />
            <span>{error}</span>
          </div>
        )}
        {action?.transition.reason && (
          <div className="space-y-1.5 mb-4">
            <label className="input-label" htmlFor="moderation-reason">
              Reason <span className="text-danger">*</span>
            </label>
            <select
              id="moderation-reason"
              className="select-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {MODERATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {reasonLabel(r)}
                </option>
              ))}
            </select>
            <p className="input-hint">The seller sees this reason on the listing and in their notifications.</p>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="input-label" htmlFor="moderation-note">
            Note to the seller <span className="text-muted-soft font-normal">(optional)</span>
          </label>
          <textarea
            id="moderation-note"
            className="textarea-field"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should the seller change to get this back on the market?"
          />
        </div>
      </Modal>

      {/* ---------- Inspection panel ---------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        wide
        title={detail?.product?.title || "Listing"}
        subtitle={
          detail?.product
            ? `${detail.product.categoryName} · listed by ${detail.product.seller?.name || detail.product.sellerName} · ${formatDate(detail.product.createdAt)}`
            : undefined
        }
        footer={
          detail?.product && (
            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
              <button
                className="btn-danger btn-sm mr-auto"
                onClick={() =>
                  openAction(detail.product, {
                    to: DELETE_TARGET,
                    label: "Delete listing permanently",
                    destructive: true,
                    reason: false,
                  })
                }
                disabled={detail.canDelete === false}
                title={
                  detail.canDelete === false
                    ? "Blocked by existing orders, offers, reviews or conversations"
                    : "Permanently delete this listing"
                }
              >
                <Trash2 size={13} /> Delete permanently
              </button>
              {(TRANSITIONS[detail.product.status] || []).map((t) => (
                <button
                  key={t.to}
                  className={t.destructive ? "btn-danger btn-sm" : "btn-secondary btn-sm"}
                  onClick={() => openAction(detail.product, t)}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
              <button className="btn-primary btn-sm" onClick={() => setDetail(null)}>
                Done
              </button>
            </div>
          )
        }
      >
        {detail?.loading || !detail?.product ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge capitalize border ${listingTone(detail.product.status)}`}>
                {LISTING_STATUS_LABELS[detail.product.status] || detail.product.status}
              </span>
              <span className="badge badge-neutral">{formatINR(detail.product.price)}</span>
              <span className="badge badge-neutral">{detail.product.condition}</span>
              <span className="badge badge-neutral">{detail.product.views || 0} views</span>
            </div>

            {detail.product.moderatedAt && (
              <div className="rounded-xl border border-warning/25 bg-warning-soft px-4 py-3">
                <p className="text-xs font-extrabold text-warning flex items-center gap-1.5">
                  <ShieldAlert size={13} /> Moderated {formatDate(detail.product.moderatedAt)} by {detail.product.moderatedByName || "an admin"}
                </p>
                <p className="text-xs text-ink-900/80 mt-1">
                  {reasonLabel(detail.product.moderationReason)}
                  {detail.product.moderationNote ? ` — ${detail.product.moderationNote}` : ""}
                </p>
              </div>
            )}

            <section>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2">Description</h4>
              <p className="text-sm text-ink-900/85 whitespace-pre-line leading-relaxed">{detail.product.description}</p>
            </section>

            {/* Why deletion is or is not possible - the honest answer, stated up front. */}
            <section>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5">
                <Info size={12} /> What references this listing
              </h4>
              {references.canDelete ? (
                <p className="text-xs text-success font-semibold">
                  Nothing references this listing, so it can be permanently deleted. Its price history will be removed with it; its tracked events are kept.
                </p>
              ) : (
                <p className="text-xs text-danger font-semibold mb-2">
                  This listing cannot be permanently deleted because of other people&rsquo;s records. Take it off the market instead - that is reversible.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {[...(references.blockers || []), ...(references.removable || []), ...(references.retained || [])].map((r) => (
                  <div key={r.name} className="rounded-lg border border-line bg-raised px-3 py-2">
                    <p className="text-2xs font-bold text-muted-soft uppercase tracking-wide">
                      {r.tier === "blockers" ? "Blocks deletion" : r.tier === "removable" ? "Removed with it" : "Kept"}
                    </p>
                    <p className="text-sm font-extrabold text-ink-900 tabular">{r.count}</p>
                    <p className="text-2xs text-muted">{r.label}{r.count === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
            </section>

            {detail.product.moderationHistory?.length > 0 && (
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5">
                  <History size={12} /> Moderation history
                </h4>
                <ol className="space-y-2">
                  {[...detail.product.moderationHistory].reverse().map((entry, i) => (
                    <li key={i} className="rounded-lg border border-line bg-raised px-3.5 py-2.5">
                      <p className="text-xs font-bold text-ink-900">
                        {entry.from || "—"} → {entry.to || "—"}
                        <span className="text-muted-soft font-normal ml-2">{formatDate(entry.at)}</span>
                      </p>
                      <p className="text-2xs text-muted mt-0.5">
                        {entry.byName || "system"}
                        {entry.reason ? ` · ${reasonLabel(entry.reason)}` : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {detail.reports?.length > 0 && (
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5">
                  <Flag size={12} /> Customer reports
                </h4>
                <ul className="space-y-2">
                  {detail.reports.map((r) => (
                    <li key={r._id} className="rounded-lg border border-line bg-raised px-3.5 py-2.5">
                      <p className="text-xs font-bold text-ink-900">
                        {reasonLabel(r.reason)}
                        <span className="text-muted-soft font-normal ml-2">{formatDate(r.createdAt)}</span>
                      </p>
                      <p className="text-2xs text-muted mt-0.5">
                        {r.status} · reported by {r.reporterName}
                        {r.details ? ` · ${r.details}` : ""}
                      </p>
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
