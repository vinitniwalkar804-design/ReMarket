/**
 * Admin console — Moderation (reports queue).
 *
 * Vanilla port of `pages/admin/AdminModeration.jsx`.
 *
 * The report queue loads reports and the queue-wide stats in parallel (the stats
 * drive the header cards, which show the whole picture rather than the current
 * filter). Each open report offers the choose-your-own-resolution dialog, where
 * every listing-affecting resolution says what it does to the listing, because
 * "dismiss" and "take down" must not look alike.
 *
 * The resolve dialog rotates only its inner content (resolution radios + error
 * block + footer buttons) so the choices do not replay the slide-up animation;
 * the note textarea is a stable node that survives repaints, so typed text is
 * never lost by clicking a radio.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { imageProps } from "../../utils/images.js";
import { formatINR, formatDate } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";
import { LISTING_STATUS_LABELS, REASON_LABELS, reasonLabel } from "../../utils/moderation.js";
import Modal from "../../components/modal.js";

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
  { action: "dismiss", label: "Dismiss report", listing: null, hint: "The listing stays live. Use when the report is not justified.", icon: "CheckCircle2" },
  { action: "resolve", label: "Mark resolved", listing: null, hint: "Already handled another way. The listing is untouched.", icon: "CheckCircle2" },
  { action: "hide_listing", label: "Hide listing", listing: "hidden", hint: "Takes it off the market until the seller fixes it.", icon: "EyeOff" },
  { action: "suspend_listing", label: "Suspend listing", listing: "suspended", hint: "Same, but signals the seller is under review.", icon: "ShieldAlert" },
  { action: "reject_listing", label: "Reject listing", listing: "rejected", hint: "The listing broke a policy and must be corrected.", icon: "X" },
  { action: "remove_listing", label: "Remove listing", listing: "removed", hint: "Take it down for good. Prefer Hide or Reject.", icon: "Trash2" },
  { action: "restore_listing", label: "Restore listing", listing: "available", hint: "Put a moderated listing back on the market.", icon: "RotateCcw" },
];

export default function AdminModeration() {
  const st = {
    data: null, stats: null, status: "", search: "", loading: true,
    resolving: null, choice: RESOLUTIONS[2], note: "", busy: false, error: "", toast: "",
  };
  let disposed = false;
  let searchTimer = null;
  let toastTimer = null;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const subHost = h("p", { className: "page-sub" });
  const statsHost = h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" });
  const tabsHost = h("div", { className: "flex flex-wrap items-center gap-2" });
  const bodyHost = h("div");
  const toastHost = h("div");
  const modalHost = h("div");

  const headerHost = h(
    "header",
    { className: "flex flex-wrap items-end justify-between gap-3" },
    h(
      "div",
      null,
      h("span", { className: "page-eyebrow" }, icon("ShieldCheck", { size: 12 }), " Moderation"),
      h("h1", { className: "page-title" }, "Reports"),
      subHost
    ),
    (() => {
      const input = h("input", {
        type: "text",
        value: st.search,
        placeholder: "Search listings, sellers, reporters…",
        className: "input-field pl-9",
        "aria-label": "Search reports",
      });
      input.addEventListener("input", (e) => {
        st.search = e.target.value;
        scheduleLoad();
      });
      return h(
        "div",
        { className: "relative w-full sm:w-72" },
        icon("Search", { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" }),
        input
      );
    })()
  );

  root.appendChild(headerHost);
  root.appendChild(statsHost);
  root.appendChild(tabsHost);
  root.appendChild(bodyHost);
  root.appendChild(toastHost);
  root.appendChild(modalHost);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      clearTimeout(searchTimer);
      clearTimeout(toastTimer);
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const showToast = (msg) => {
    st.toast = msg;
    clearTimeout(toastTimer);
    mount(
      toastHost,
      h("div", { className: "fixed bottom-5 right-5 z-[110] badge badge-success shadow-pop px-4 py-2.5 animate-slide-up" }, msg)
    );
    toastTimer = setTimeout(() => mount(toastHost), 4000);
  };

  const paintSub = () => {
    const unresolved = st.data?.reports?.filter((r) => r.status === "open" || r.status === "reviewing") || [];
    mount(
      subHost,
      st.loading
        ? "Loading the queue…"
        : unresolved.length
          ? `${unresolved.length} report${unresolved.length === 1 ? "" : "s"} waiting on a decision`
          : "Nothing is waiting on a decision"
    );
  };

  const paintStats = () => {
    if (!st.stats) {
      mount(statsHost);
      return;
    }
    const stats = st.stats;
    mount(
      statsHost,
      [
        { label: "Open reports", value: stats.openReports, tone: stats.openReports > 0 ? "text-danger" : "text-success" },
        { label: "Listings moderated", value: stats.moderatedListings, tone: "text-ink-900" },
        { label: "Resolved this month", value: stats.resolvedThisMonth, tone: "text-success" },
        { label: "Live listings", value: stats.byStatus?.available ?? 0, tone: "text-ink-900" },
      ].map((card) =>
        h(
          "div",
          { key: card.label, className: "stat-card" },
          h("p", { className: "text-2xs font-bold uppercase tracking-wider text-muted-soft" }, card.label),
          h("p", { className: `text-2xl font-extrabold tabular mt-1 ${card.tone}` }, card.value)
        )
      )
    );
  };

  const paintTabs = () => {
    mount(
      tabsHost,
      STATUS_TABS.map((tab) =>
        h(
          "button",
          {
            type: "button",
            key: tab.value || "active",
            className: `chip ${st.status === tab.value ? "chip-active" : "chip-idle"}`,
            onClick: () => {
              st.status = tab.value;
              paintTabs();
              scheduleLoad();
            },
          },
          tab.label,
          tab.value === "open" && st.stats?.openReports
            ? h("span", { className: "ml-1 opacity-60 tabular" }, st.stats.openReports)
            : null
        )
      )
    );
  };

  const paintBody = () => {
    if (st.loading) {
      mount(
        bodyHost,
        h("div", { className: "panel p-5 space-y-3" }, Array(4).fill(0).map((_, i) => h("span", { key: i }, SkeletonRow())))
      );
      return;
    }

    const reports = st.data?.reports || [];
    const flagged = st.data?.flaggedListings || [];

    const queue =
      reports.length === 0
        ? h(
            "div",
            { className: "panel p-12 text-center" },
            h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("ShieldCheck", { size: 20 })),
            h("h3", { className: "font-extrabold text-ink-900" }, "Nothing to review"),
            h("p", { className: "text-sm text-muted mt-1" }, "No customer reports match this filter. The queue is clear.")
          )
        : h(
            "div",
            { className: "lg:col-span-2 space-y-3" },
            reports.map((report) => {
              const listing = report.productId;
              const isOpen = report.status === "open" || report.status === "reviewing";
              return h(
                "article",
                { key: report._id, className: "panel p-4" },
                h(
                  "div",
                  { className: "flex items-start gap-3" },
                  h(
                    "div",
                    { className: "w-12 h-12 bg-sunken rounded-lg overflow-hidden flex-none" },
                    listing?.images?.length
                      ? h("img", { alt: listing.title, ...imageProps(listing), className: "w-full h-full object-cover" })
                      : h("span", { className: "w-full h-full flex items-center justify-center text-muted-soft" }, icon("Package", { size: 16 }))
                  ),
                  h(
                    "div",
                    { className: "min-w-0 flex-1" },
                    h(
                      "div",
                      { className: "flex flex-wrap items-center gap-2" },
                      listing
                        ? h("h3", { className: "text-sm font-extrabold text-ink-900 line-clamp-1" }, listing.title)
                        : h("h3", { className: "text-sm font-extrabold text-muted line-through" }, report.productTitle || "Listing no longer exists"),
                      !isOpen &&
                        h("span", { className: `badge ${report.status === "resolved" ? "badge-success" : "badge-neutral"}` }, report.status)
                    ),
                    h(
                      "p",
                      { className: "text-2xs text-muted mt-0.5" },
                      `${reasonLabel(report.reason)} · reported by ${report.reporterName} · ${formatDate(report.createdAt)}`
                    ),
                    report.details && h("p", { className: "text-xs text-ink-900/75 mt-1.5 italic" }, `\u201c${report.details}\u201d`),
                    listing &&
                      h(
                        "div",
                        { className: "flex flex-wrap items-center gap-1.5 mt-2" },
                        h("span", { className: `badge capitalize border ${listingTone(listing.status)}` }, LISTING_STATUS_LABELS[listing.status] || listing.status),
                        h("span", { className: "badge badge-neutral" }, formatINR(listing.price)),
                        h("span", { className: "badge badge-neutral" }, `seller: ${listing.sellerName || report.sellerName}`)
                      ),
                    !isOpen && report.resolutionAction &&
                      h(
                        "p",
                        { className: "text-2xs text-muted-soft mt-2" },
                        `Closed as ${report.resolutionAction.replace(/_/g, " ")} by ${report.resolvedByName} on ${formatDate(report.resolvedAt)}`,
                        report.resolutionNote ? ` — ${report.resolutionNote}` : ""
                      )
                  ),
                  isOpen &&
                    h(
                      "button",
                      { type: "button", className: "btn-primary btn-sm flex-none", onClick: () => openResolve(report) },
                      "Review ",
                      icon("ChevronRight", { size: 13 })
                    )
                )
              );
            })
          );

    const aside = h(
      "aside",
      { className: "space-y-3" },
      h(
        "div",
        { className: "panel" },
        h(
          "div",
          { className: "panel-head" },
          h("div", null, h("h3", { className: "panel-title" }, "Currently moderated"), h("p", { className: "panel-sub" }, "Listings an admin has taken off the market"))
        ),
        h(
          "div",
          { className: "panel-body space-y-2" },
          flagged.length === 0
            ? h("p", { className: "text-xs text-muted text-center py-6" }, "Nothing is currently moderated.")
            : flagged.map((p) =>
                h(
                  "div",
                  { key: p._id, className: "rounded-lg border border-line bg-raised px-3 py-2.5" },
                  h("p", { className: "text-xs font-bold text-ink-900 line-clamp-1" }, p.title),
                  h(
                    "div",
                    { className: "flex flex-wrap items-center gap-1.5 mt-1.5" },
                    h("span", { className: `badge capitalize border ${listingTone(p.status)}` }, LISTING_STATUS_LABELS[p.status] || p.status),
                    p.moderationReason && h("span", { className: "text-2xs text-muted" }, REASON_LABELS[p.moderationReason] || p.moderationReason)
                  ),
                  h("p", { className: "text-2xs text-muted-soft mt-1" }, `${p.moderatedByName || "admin"} · ${formatDate(p.moderatedAt)}`)
                )
              )
        )
      )
    );

    mount(bodyHost, h("div", { className: "grid lg:grid-cols-3 gap-4 items-start" }, queue, aside));
  };

  const scheduleLoad = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, st.search ? 300 : 0);
  };

  const load = () => {
    st.loading = true;
    paintSub();
    paintBody();
    const params = new URLSearchParams({ limit: "20" });
    if (st.status) params.set("status", st.status);
    if (st.search.trim()) params.set("search", st.search.trim());
    Promise.all([
      api.get(`/admin/moderation/reports?${params}`),
      api.get("/admin/moderation/stats"),
    ])
      .then(([queue, statRes]) => {
        if (!ensureAlive()) return;
        st.data = queue.data;
        st.stats = statRes.data;
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.data = null;
      })
      .then(() => {
        if (!ensureAlive()) return;
        st.loading = false;
        paintSub();
        paintStats();
        paintTabs();
        paintBody();
      });
  };

  const openResolve = (report) => {
    // Preselect the action that matches what the listing already is, so the
    // common "this is still up, take it down" case is one click.
    st.choice = report.productId?.status === "available" ? RESOLUTIONS[2] : RESOLUTIONS[6];
    st.note = "";
    st.error = "";
    st.resolving = report;
    initResolveModal();
  };

  const submit = async () => {
    if (!st.resolving || !st.choice) return;
    st.busy = true;
    st.error = "";
    paintResolve();
    try {
      const { data: result } = await api.patch(`/admin/moderation/reports/${st.resolving._id}`, {
        action: st.choice.action,
        note: st.note.trim() || undefined,
      });
      if (!ensureAlive()) return;
      showToast(result.message || "Report closed");
      st.resolving = null;
      st.busy = false;
      mount(modalHost);
      await load();
      return;
    } catch (err) {
      if (!ensureAlive()) return;
      st.error = err.response?.data?.message || "That action could not be completed";
    }
    st.busy = false;
    paintResolve();
  };

  let errorHost = null;
  let radioHost = null;
  let noteInput = null;
  let footerHost = null;

  const paintResolve = () => {
    mount(
      errorHost,
      st.error
        ? h(
            "div",
            { className: "mb-4 flex items-start gap-2 rounded-xl bg-danger-soft border border-danger/25 px-3.5 py-2.5 text-xs font-semibold text-danger" },
            icon("AlertTriangle", { size: 14, className: "mt-px flex-none" }),
            h("span", null, st.error)
          )
        : null
    );

    mount(
      radioHost,
      RESOLUTIONS.map((option) =>
        h(
          "label",
          {
            key: option.action,
            className: `flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-colors ${
              st.choice?.action === option.action ? "border-primary bg-primary-soft" : "border-line bg-card hover:bg-raised"
            }`,
          },
          h("input", {
            type: "radio",
            name: "resolution",
            className: "mt-0.5",
            checked: st.choice?.action === option.action,
            onChange: () => {
              st.choice = option;
              paintResolve();
            },
          }),
          h(
            "span",
            { className: "min-w-0" },
            h("span", { className: "flex items-center gap-1.5 text-sm font-bold text-ink-900" }, icon(option.icon, { size: 13 }), option.label),
            h("span", { className: "block text-2xs text-muted mt-0.5" }, option.hint),
            option.listing &&
              h(
                "span",
                { className: "block text-2xs text-primary font-bold mt-0.5" },
                `This also changes the listing to \u201c${LISTING_STATUS_LABELS[option.listing]}\u201d.`
              )
          )
        )
      )
    );

    mount(
      footerHost,
      h(
        "div",
        { className: "flex items-center justify-end gap-2.5" },
        h("button", { type: "button", className: "btn-quiet", disabled: st.busy, onClick: () => { st.resolving = null; st.busy = false; mount(modalHost); } }, "Cancel"),
        h("button", { type: "button", className: "btn-primary", disabled: st.busy || !st.choice, onClick: submit }, st.busy ? "Working…" : "Confirm")
      )
    );
  };

  const initResolveModal = () => {
    errorHost = h("div");
    radioHost = h("div");
    noteInput = h("textarea", {
      id: "resolve-note",
      className: "textarea-field",
      rows: 3,
      maxLength: 500,
      placeholder: "What was wrong, and what does the seller need to do?",
    });
    noteInput.addEventListener("input", (e) => {
      st.note = e.target.value;
    });
    footerHost = h("div");

    const resolving = st.resolving;
    const listingStatus = resolving.productId?.status
      ? ` — currently ${LISTING_STATUS_LABELS[resolving.productId.status] || resolving.productId.status}`
      : "";

    const modal = Modal({
      open: true,
      onClose: () => {
        if (!st.busy) {
          st.resolving = null;
          mount(modalHost);
        }
      },
      title: "Resolve this report",
      subtitle: `${reasonLabel(resolving.reason)} on "${resolving.productId?.title || resolving.productTitle}"${listingStatus}.`,
      footer: footerHost,
      children: h(
        "div",
        null,
        errorHost,
        radioHost,
        h(
          "div",
          { className: "space-y-1.5 mt-4" },
          h("label", { className: "input-label", for: "resolve-note" }, " Note ", h("span", { className: "text-muted-soft font-normal" }, "(optional, shown to the seller)")),
          noteInput
        )
      ),
    });

    mount(modalHost, modal);
    paintResolve();
  };

  paintSub();
  paintStats();
  paintTabs();
  paintBody();
  scheduleLoad();

  return root;
}