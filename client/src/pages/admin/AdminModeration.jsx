import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, Flag, EyeOff, Eye, X, Trash2, RotateCcw, ShieldAlert, Search,
  AlertTriangle, CheckCircle2, ChevronRight, Package,
} from "lucide-react";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/Loading.jsx";
import { imageProps } from "../../utils/images.js";
import { formatINR, formatDate } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";
import { LISTING_STATUS_LABELS, REASON_LABELS, reasonLabel } from "../../utils/moderation.js";
import Modal from "../../components/Modal.jsx";

const STATUS_TABS = [
  { value: "", label: "Needs attention" },
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

/**
 * What an admin can do with a report, and what it does to the listing.
 *
 * Every option except the first two also moderates the listing, and that happens
 * server-side through the same code path the Listings page uses. The table says so
 * explicitly, because "dismiss this report" and "dismiss this report and take
 * the listing down" are very different things to click and must not look alike.
 */
const RESOLUTIONS = [
  { action: "dismiss", label: "Dismiss report", listing: null, hint: "The listing stays live. Use when the report is not justified.", icon: CheckCircle2 },
  { action: "resolve", label: "Mark resolved", listing: null, hint: "Already handled another way. The listing is untouched.", icon: CheckCircle2 },
  { action: "hide_listing", label: "Hide listing", listing: "hidden", hint: "Takes it off the market until the seller fixes it.", icon: EyeOff },
  { action: "suspend_listing", label: "Suspend listing", listing: "suspended", hint: "Same, but signals the seller is under review.", icon: ShieldAlert },
  { action: "reject_listing", label: "Reject listing", listing: "rejected", hint: "The listing broke a policy and must be corrected.", icon: X },
  { action: "remove_listing", label: "Remove listing", listing: "removed", hint: "Take it down for good. Prefer Hide or Reject.", icon: Trash2 },
  { action: "restore_listing", label: "Restore listing", listing: "available", hint: "Put a moderated listing back on the market.", icon: RotateCcw },
];

export default function AdminModeration() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [choice, setChoice] = useState(RESOLUTIONS[2]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "20" });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    return Promise.all([
      api.get(`/admin/moderation/reports?${params}`),
      api.get("/admin/moderation/stats"),
    ])
      .then(([queue, statRes]) => {
        setData(queue.data);
        setStats(statRes.data);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [status, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openResolve = (report) => {
    // Preselect the action that matches what the listing already is, so the
    // common "this is still up, take it down" case is one click.
    const suggested = report.productId?.status === "available" ? RESOLUTIONS[2] : RESOLUTIONS[6];
    setChoice(suggested);
    setNote("");
    setError("");
    setResolving(report);
  };

  const submit = async () => {
    if (!resolving || !choice) return;
    setBusy(true);
    setError("");
    try {
      const { data: result } = await api.patch(`/admin/moderation/reports/${resolving._id}`, {
        action: choice.action,
        note: note.trim() || undefined,
      });
      setToast(result.message || "Report closed");
      setResolving(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "That action could not be completed");
    } finally {
      setBusy(false);
    }
  };

  const reports = data?.reports || [];
  const flagged = data?.flaggedListings || [];
  const unresolved = reports.filter((r) => r.status === "open" || r.status === "reviewing");

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="page-eyebrow">
            <ShieldCheck size={12} /> Moderation
          </span>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">
            {loading
              ? "Loading the queue…"
              : unresolved.length
                ? `${unresolved.length} report${unresolved.length === 1 ? "" : "s"} waiting on a decision`
                : "Nothing is waiting on a decision"}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings, sellers, reporters…"
            className="input-field pl-9"
            aria-label="Search reports"
          />
        </div>
      </header>

      {/* Counts, from the stats endpoint rather than the queue page, so the
          header shows the whole picture rather than the current filter. */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Open reports", value: stats.openReports, tone: stats.openReports > 0 ? "text-danger" : "text-success" },
            { label: "Listings moderated", value: stats.moderatedListings, tone: "text-ink-900" },
            { label: "Resolved this month", value: stats.resolvedThisMonth, tone: "text-success" },
            { label: "Live listings", value: stats.byStatus?.available ?? 0, tone: "text-ink-900" },
          ].map((card) => (
            <div key={card.label} className="stat-card">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-soft">{card.label}</p>
              <p className={`text-2xl font-extrabold tabular mt-1 ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || "active"}
            onClick={() => setStatus(tab.value)}
            className={`chip ${status === tab.value ? "chip-active" : "chip-idle"}`}
          >
            {tab.label}
            {tab.value === "open" && stats?.openReports ? (
              <span className="ml-1 opacity-60 tabular">{stats.openReports}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel p-5 space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          {/* ---------------- the queue ---------------- */}
          <div className="lg:col-span-2 space-y-3">
            {reports.length === 0 ? (
              <div className="panel p-12 text-center">
                <span className="icon-tile-primary mx-auto mb-4">
                  <ShieldCheck size={20} />
                </span>
                <h3 className="font-extrabold text-ink-900">Nothing to review</h3>
                <p className="text-sm text-muted mt-1">
                  No customer reports match this filter. The queue is clear.
                </p>
              </div>
            ) : (
              reports.map((report) => {
                const listing = report.productId;
                const isOpen = report.status === "open" || report.status === "reviewing";
                return (
                  <article key={report._id} className="panel p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-sunken rounded-lg overflow-hidden flex-none">
                        {listing?.images?.length ? (
                          <img alt={listing.title} {...imageProps(listing)} className="w-full h-full object-cover" />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-muted-soft">
                            <Package size={16} />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {listing ? (
                            <h3 className="text-sm font-extrabold text-ink-900 line-clamp-1">
                              {listing.title}
                            </h3>
                          ) : (
                            <h3 className="text-sm font-extrabold text-muted line-through">
                              {report.productTitle || "Listing no longer exists"}
                            </h3>
                          )}
                          {!isOpen && (
                            <span className={`badge ${report.status === "resolved" ? "badge-success" : "badge-neutral"}`}>
                              {report.status}
                            </span>
                          )}
                        </div>

                        <p className="text-2xs text-muted mt-0.5">
                          {reasonLabel(report.reason)} · reported by {report.reporterName} · {formatDate(report.createdAt)}
                        </p>
                        {report.details && (
                          <p className="text-xs text-ink-900/75 mt-1.5 italic">&ldquo;{report.details}&rdquo;</p>
                        )}
                        {listing && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className={`badge capitalize border ${listingTone(listing.status)}`}>
                              {LISTING_STATUS_LABELS[listing.status] || listing.status}
                            </span>
                            <span className="badge badge-neutral">{formatINR(listing.price)}</span>
                            <span className="badge badge-neutral">seller: {listing.sellerName || report.sellerName}</span>
                          </div>
                        )}
                        {!isOpen && report.resolutionAction && (
                          <p className="text-2xs text-muted-soft mt-2">
                            Closed as {report.resolutionAction.replace(/_/g, " ")} by {report.resolvedByName} on{" "}
                            {formatDate(report.resolvedAt)}
                            {report.resolutionNote ? ` — ${report.resolutionNote}` : ""}
                          </p>
                        )}
                      </div>

                      {isOpen && (
                        <button className="btn-primary btn-sm flex-none" onClick={() => openResolve(report)}>
                          Review <ChevronRight size={13} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* ---------------- currently moderated listings ---------------- */}
          <aside className="space-y-3">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Currently moderated</h3>
                  <p className="panel-sub">Listings an admin has taken off the market</p>
                </div>
              </div>
              <div className="panel-body space-y-2">
                {flagged.length === 0 ? (
                  <p className="text-xs text-muted text-center py-6">Nothing is currently moderated.</p>
                ) : (
                  flagged.map((p) => (
                    <div key={p._id} className="rounded-lg border border-line bg-raised px-3 py-2.5">
                      <p className="text-xs font-bold text-ink-900 line-clamp-1">{p.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className={`badge capitalize border ${listingTone(p.status)}`}>
                          {LISTING_STATUS_LABELS[p.status] || p.status}
                        </span>
                        {p.moderationReason && (
                          <span className="text-2xs text-muted">{REASON_LABELS[p.moderationReason] || p.moderationReason}</span>
                        )}
                      </div>
                      <p className="text-2xs text-muted-soft mt-1">
                        {p.moderatedByName || "admin"} · {formatDate(p.moderatedAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[110] badge badge-success shadow-pop px-4 py-2.5 animate-slide-up">
          {toast}
        </div>
      )}

      {/* ---------------- resolve ---------------- */}
      <Modal
        open={Boolean(resolving)}
        onClose={() => !busy && setResolving(null)}
        title="Resolve this report"
        subtitle={
          resolving
            ? `${reasonLabel(resolving.reason)} on "${resolving.productId?.title || resolving.productTitle}"${
                resolving.productId?.status ? ` — currently ${LISTING_STATUS_LABELS[resolving.productId.status] || resolving.productId.status}` : ""
              }.`
            : undefined
        }
        footer={
          <>
            <button className="btn-quiet" onClick={() => setResolving(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy || !choice}>
              {busy ? "Working…" : "Confirm"}
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

        <div className="space-y-1.5">
          {RESOLUTIONS.map((option) => (
            <label
              key={option.action}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-colors ${
                choice?.action === option.action
                  ? "border-primary bg-primary-soft"
                  : "border-line bg-card hover:bg-raised"
              }`}
            >
              <input
                type="radio"
                name="resolution"
                className="mt-0.5"
                checked={choice?.action === option.action}
                onChange={() => setChoice(option)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                  <option.icon size={13} /> {option.label}
                </span>
                <span className="block text-2xs text-muted mt-0.5">{option.hint}</span>
                {option.listing && (
                  <span className="block text-2xs text-primary font-bold mt-0.5">
                    This also changes the listing to &ldquo;{LISTING_STATUS_LABELS[option.listing]}&rdquo;.
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="space-y-1.5 mt-4">
          <label className="input-label" htmlFor="resolve-note">
            Note <span className="text-muted-soft font-normal">(optional, shown to the seller)</span>
          </label>
          <textarea
            id="resolve-note"
            className="textarea-field"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was wrong, and what does the seller need to do?"
          />
        </div>
      </Modal>
    </div>
  );
}
