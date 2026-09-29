/**
 * Admin console — Listings.
 *
 * Vanilla port of `pages/admin/AdminListings.jsx`.
 *
 * A paginated, status-facetted listing table with per-row lifecycle transitions,
 * a confirmation dialog (with mandatory reason for destructive transitions), and
 * a wide inspection modal showing references, moderation history and reports.
 *
 * Behavioural details preserved from React:
 *  - search is debounced (300ms) while other parameter changes fire immediately;
 *  - a status chip resets to page one;
 *  - destructive actions always ask for a reason, and the server re-validates;
 *  - the toast auto-dismisses after 4s;
 *  - the two dialogs can legitimately open on top of each other (a transition
 *    launched from the inspection panel), so each lives on its own host.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { imageProps } from "../../utils/images.js";
import { formatINR, formatDate } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";
import { LISTING_STATUS_LABELS, MODERATION_REASONS, reasonLabel } from "../../utils/moderation.js";
import Modal from "../../components/modal.js";

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
    { to: "hidden", label: "Hide listing", icon: "EyeOff", destructive: true, reason: true },
    { to: "suspended", label: "Suspend", icon: "ShieldAlert", destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: "X", destructive: true, reason: true },
    { to: "sold", label: "Mark sold", icon: "Package", destructive: false, reason: false },
  ],
  hidden: [
    { to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false },
    { to: "suspended", label: "Suspend", icon: "ShieldAlert", destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: "X", destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: "Trash2", destructive: true, reason: true },
  ],
  suspended: [
    { to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false },
    { to: "hidden", label: "Hide", icon: "EyeOff", destructive: true, reason: true },
    { to: "rejected", label: "Reject", icon: "X", destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: "Trash2", destructive: true, reason: true },
  ],
  rejected: [
    { to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false },
    { to: "hidden", label: "Hide", icon: "EyeOff", destructive: true, reason: true },
    { to: "removed", label: "Remove permanently", icon: "Trash2", destructive: true, reason: true },
  ],
  removed: [{ to: "available", label: "Restore to live", icon: "RotateCcw", destructive: false, reason: false }],
  reserved: [{ to: "hidden", label: "Hide listing", icon: "EyeOff", destructive: true, reason: true }],
  sold: [{ to: "available", label: "Return to live", icon: "RotateCcw", destructive: false, reason: false }],
};

export default function AdminListings() {
  const st = {
    rows: [], facets: {}, total: 0, page: 1, status: "", search: "",
    loading: true, detail: null, action: null, reason: "policy_violation", note: "",
    busy: false, error: "", toast: "",
  };
  let disposed = false;
  let searchTimer = null;
  let toastTimer = null;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("header", { className: "flex flex-wrap items-end justify-between gap-3" });
  const filtersHost = h("div", { className: "panel p-4 space-y-3" });
  const bodyHost = h("div");
  const toastHost = h("div");
  const actionModalHost = h("div");
  const detailModalHost = h("div");

  root.appendChild(headerHost);
  root.appendChild(filtersHost);
  root.appendChild(bodyHost);
  root.appendChild(actionModalHost);
  root.appendChild(detailModalHost);

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
      h(
        "div",
        { className: "fixed bottom-5 right-5 z-[110] badge badge-success shadow-pop px-4 py-2.5 animate-slide-up" },
        msg
      )
    );
    toastTimer = setTimeout(() => {
      mount(toastHost);
    }, 4000);
  };

  const paintHeader = () => {
    const pages = Math.max(1, Math.ceil(st.total / PAGE_SIZE));
    mount(
      headerHost,
      h(
        "div",
        null,
        h("span", { className: "page-eyebrow" }, icon("Layers", { size: 12 }), " Catalogue & Sales"),
        h("h1", { className: "page-title" }, "Listings"),
        h(
          "p",
          { className: "page-sub" },
          st.loading ? "Loading listings…" : `${st.total} listing${st.total === 1 ? "" : "s"} match the current filter`
        )
      ),
      h(
        "div",
        { className: "flex items-center gap-1.5" },
        h(
          "button",
          {
            type: "button",
            disabled: st.page === 1 || st.loading,
            className: "btn-icon",
            "aria-label": "Previous page",
            onClick: () => {
              st.page = Math.max(1, st.page - 1);
              scheduleLoad();
            },
          },
          icon("ChevronLeft", { size: 15 })
        ),
        h("span", { className: "text-2xs font-bold text-muted tabular px-1" }, `${st.page} / ${pages}`),
        h(
          "button",
          {
            type: "button",
            disabled: st.page === pages || st.loading,
            className: "btn-icon",
            "aria-label": "Next page",
            onClick: () => {
              st.page = Math.min(pages, st.page + 1);
              scheduleLoad();
            },
          },
          icon("ChevronRight", { size: 15 })
        )
      )
    );
  };

  const paintFilters = () => {
    const statusChips = [
      { value: "", label: "All", count: Object.values(st.facets).reduce((a, b) => a + b, 0) },
      ...Object.keys(LISTING_STATUS_LABELS)
        .filter((s) => st.facets[s])
        .map((s) => ({ value: s, label: LISTING_STATUS_LABELS[s], count: st.facets[s] })),
    ];

    const input = h("input", {
      type: "text",
      value: st.search,
      placeholder: "Search listing titles…",
      className: "input-field pl-9",
      "aria-label": "Search listings",
    });
    input.addEventListener("input", (e) => {
      st.search = e.target.value;
      st.page = 1;
      scheduleLoad();
    });

    mount(
      filtersHost,
      h(
        "div",
        { className: "flex flex-wrap items-center gap-2" },
        statusChips.map((chip) =>
          h(
            "button",
            {
              type: "button",
              key: chip.value || "all",
              className: `chip ${st.status === chip.value ? "chip-active" : "chip-idle"}`,
              onClick: () => {
                st.status = chip.value;
                st.page = 1;
                paintFilters();
                paintHeader();
                scheduleLoad();
              },
            },
            chip.label,
            h("span", { className: "ml-1 opacity-60 tabular" }, chip.count)
          )
        )
      ),
      h(
        "div",
        { className: "relative max-w-sm" },
        icon("Search", { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none" }),
        input
      )
    );
  };

  const paintBody = () => {
    const pages = Math.max(1, Math.ceil(st.total / PAGE_SIZE));

    if (st.loading) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "panel p-5 space-y-3" },
          Array(6).fill(0).map((_, i) => h("span", { key: i }, SkeletonRow()))
        )
      );
      return;
    }

    if (st.rows.length === 0) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Package", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "No listings match"),
          h("p", { className: "text-sm text-muted mt-1" }, "Try clearing the filters above.")
        )
      );
      return;
    }

    const table = h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        { className: "data-table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Listing"),
            h("th", null, "Category"),
            h("th", null, "Seller"),
            h("th", { className: "th-num" }, "Price"),
            h("th", { className: "th-num" }, "Views"),
            h("th", null, "Status"),
            h("th", { className: "text-right" }, "Actions")
          )
        ),
        h(
          "tbody",
          null,
          st.rows.map((p) =>
            h(
              "tr",
              { key: p._id },
              h(
                "td",
                null,
                h(
                  "div",
                  { className: "flex items-center gap-3" },
                  h(
                    "div",
                    { className: "w-10 h-10 bg-sunken rounded-lg overflow-hidden flex-none" },
                    h("img", { alt: p.title, ...imageProps(p), className: "w-full h-full object-cover" })
                  ),
                  h("span", { className: "text-sm font-semibold text-ink-900 line-clamp-1 max-w-[260px]" }, p.title),
                  p.openReportCount > 0 &&
                    h(
                      "span",
                      { className: "badge badge-danger flex-none", title: `${p.openReportCount} open report(s)` },
                      icon("Flag", { size: 10 }),
                      " ",
                      p.openReportCount
                    )
                )
              ),
              h("td", { className: "text-muted" }, p.categoryName || "—"),
              h("td", { className: "text-muted" }, p.seller?.name || p.sellerName || "—"),
              h("td", { className: "num" }, formatINR(p.price)),
              h("td", { className: "num" }, p.views ?? 0),
              h(
                "td",
                null,
                h("span", { className: `badge capitalize border ${listingTone(p.status)}` }, LISTING_STATUS_LABELS[p.status] || p.status),
                p.moderationReason &&
                  h("span", { className: "block text-2xs text-muted-soft mt-1 max-w-[160px] truncate" }, reasonLabel(p.moderationReason))
              ),
              h(
                "td",
                null,
                h(
                  "div",
                  { className: "flex items-center justify-end gap-1.5" },
                  h(
                    "button",
                    { type: "button", className: "btn-secondary btn-xs", title: "Inspect this listing", onClick: () => openDetail(p._id) },
                    icon("Eye", { size: 12 }),
                    " Inspect"
                  ),
                  (TRANSITIONS[p.status] || []).slice(0, 1).map((t) =>
                    h(
                      "button",
                      {
                        type: "button",
                        key: t.to,
                        className: t.destructive ? "btn-danger btn-xs" : "btn-secondary btn-xs",
                        onClick: () => openAction(p, t),
                      },
                      icon(t.icon, { size: 12 }),
                      " ",
                      t.label
                    )
                  )
                )
              )
            )
          )
        )
      )
    );

    const footer =
      pages > 1 &&
      h(
        "div",
        { className: "flex items-center justify-between gap-3 px-5 py-3 border-t border-line bg-raised" },
        h(
          "span",
          { className: "text-2xs text-muted" },
          `Showing ${(st.page - 1) * PAGE_SIZE + 1}–${Math.min(st.page * PAGE_SIZE, st.total)} of ${st.total}`
        ),
        h(
          "div",
          { className: "flex items-center gap-1.5" },
          h(
            "button",
            { type: "button", disabled: st.page === 1, className: "btn-secondary btn-sm", onClick: () => { st.page = Math.max(1, st.page - 1); scheduleLoad(); } },
            icon("ChevronLeft", { size: 13 }),
            " Prev"
          ),
          h(
            "button",
            { type: "button", disabled: st.page === pages, className: "btn-secondary btn-sm", onClick: () => { st.page = Math.min(pages, st.page + 1); scheduleLoad(); } },
            "Next ",
            icon("ChevronRight", { size: 13 })
          )
        )
      );

    mount(bodyHost, h("div", { className: "panel" }, table, footer));
  };

  const scheduleLoad = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, st.search ? 300 : 0);
  };

  const load = () => {
    st.loading = true;
    paintHeader();
    paintBody();
    const params = new URLSearchParams({ page: String(st.page), limit: String(PAGE_SIZE) });
    if (st.status) params.set("status", st.status);
    if (st.search.trim()) params.set("search", st.search.trim());
    api
      .get(`/admin/products?${params}`)
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.rows = data.products || [];
        st.total = data.total || 0;
        st.facets = data.facets?.byStatus || {};
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.rows = [];
      })
      .then(() => {
        if (!ensureAlive()) return;
        st.loading = false;
        paintHeader();
        paintFilters();
        paintBody();
      });
  };

  const openDetail = async (id) => {
    st.detail = { loading: true };
    paintDetailModal();
    try {
      const { data } = await api.get(`/admin/products/${id}`);
      if (!ensureAlive()) return;
      st.detail = data;
    } catch {
      if (!ensureAlive()) return;
      st.detail = null;
    }
    paintDetailModal();
  };

  const openAction = (row, transition) => {
    st.error = "";
    st.reason = "policy_violation";
    st.note = "";
    st.action = { row, transition };
    paintActionModal();
  };

  const runAction = async () => {
    if (!st.action) return;
    st.busy = true;
    st.error = "";
    paintActionModal();
    try {
      const targetId = st.action.row._id;
      if (st.action.transition.to === DELETE_TARGET) {
        const { data } = await api.delete(`/admin/products/${targetId}`);
        showToast(data.message || "Listing deleted");
        st.action = null;
        st.detail = null;
        paintActionModal();
        paintDetailModal();
        await load();
        return;
      }
      const { data } = await api.patch(`/admin/products/${targetId}/status`, {
        status: st.action.transition.to,
        reason: st.action.transition.reason ? st.reason : undefined,
        note: st.note.trim() || undefined,
      });
      showToast(data.message || "Listing updated");
      st.action = null;
      paintActionModal();
      await load();
      // A transition can be launched from the inspection modal, which stays open
      // underneath: refresh it so the panel reflects the new state.
      if (st.detail?.product?._id === targetId) openDetail(targetId);
    } catch (err) {
      // The server is the authority on whether an action is allowed - it knows
      // about active orders and reservations that the table cannot show.
      if (!ensureAlive()) return;
      st.error = err.response?.data?.message || "That action could not be completed";
    } finally {
      if (!ensureAlive()) return;
      st.busy = false;
      paintActionModal();
    }
  };

  const paintActionModal = () => {
    const action = st.action;
    if (!action) {
      mount(actionModalHost);
      return;
    }
    const t = action.transition;
    const reasonSelect = h("select", { id: "moderation-reason", className: "select-field", value: st.reason });
    MODERATION_REASONS.forEach((r) => {
      reasonSelect.appendChild(h("option", { value: r }, reasonLabel(r)));
    });
    reasonSelect.addEventListener("change", (e) => {
      st.reason = e.target.value;
    });
    const noteInput = h("textarea", {
      id: "moderation-note",
      className: "textarea-field",
      rows: 3,
      maxLength: 500,
      value: st.note,
      placeholder: "What should the seller change to get this back on the market?",
    });
    noteInput.addEventListener("input", (e) => {
      st.note = e.target.value;
    });

    const content = h("div");
    const errorBlock =
      st.error &&
      h(
        "div",
        { className: "mb-4 flex items-start gap-2 rounded-xl bg-danger-soft border border-danger/25 px-3.5 py-2.5 text-xs font-semibold text-danger" },
        icon("AlertTriangle", { size: 14, className: "mt-px flex-none" }),
        h("span", null, st.error)
      );
    const reasonBlock =
      t.reason &&
      h(
        "div",
        { className: "space-y-1.5 mb-4" },
        h("label", { className: "input-label", for: "moderation-reason" }, " Reason ", h("span", { className: "text-danger" }, "*")),
        reasonSelect,
        h("p", { className: "input-hint" }, "The seller sees this reason on the listing and in their notifications.")
      );
    const noteBlock = h(
      "div",
      { className: "space-y-1.5" },
      h(
        "label",
        { className: "input-label", for: "moderation-note" },
        " Note to the seller ",
        h("span", { className: "text-muted-soft font-normal" }, "(optional)")
      ),
      noteInput
    );
    mount(content, errorBlock, reasonBlock, noteBlock);

    const subtitle =
      t.to === DELETE_TARGET
        ? "This cannot be undone. The listing and its price history are removed for good. Its tracked activity is kept for marketplace reporting."
        : t.destructive
          ? `"${action.row.title}" will stop appearing in search, the catalogue and every public listing feed. The seller is notified and can fix the details, but only an admin can put it back.`
          : `"${action.row.title}" will go live again in search and the catalogue.`;

    const modal = Modal({
      open: true,
      onClose: () => {
        if (!st.busy) {
          st.action = null;
          paintActionModal();
        }
      },
      title: `${t.label}?`,
      subtitle,
      footer: h(
        "div",
        { className: "flex items-center justify-end gap-2.5" },
        h("button", { type: "button", className: "btn-quiet", disabled: st.busy, onClick: () => { st.action = null; paintActionModal(); } }, "Cancel"),
        h(
          "button",
          { type: "button", className: t.destructive ? "btn-danger" : "btn-primary", disabled: st.busy, onClick: runAction },
          st.busy ? "Working…" : t.label
        )
      ),
      children: content,
    });
    mount(actionModalHost, modal);
  };

  const paintDetailModal = () => {
    const detail = st.detail;
    if (!detail) {
      mount(detailModalHost);
      return;
    }

    const body =
      detail?.loading || !detail?.product
        ? h(
            "div",
            { className: "space-y-3" },
            Array(3).fill(0).map((_, i) => h("span", { key: i }, SkeletonRow()))
          )
        : paintDetailContent();

    const modal = Modal({
      open: true,
      onClose: () => {
        st.detail = null;
        paintDetailModal();
      },
      wide: true,
      title: detail?.product?.title || "Listing",
      subtitle: detail?.product
        ? `${detail.product.categoryName} · listed by ${detail.product.seller?.name || detail.product.sellerName} · ${formatDate(detail.product.createdAt)}`
        : undefined,
      footer: detail?.product
        ? h(
            "div",
            { className: "flex flex-wrap items-center justify-end gap-2 w-full" },
            h(
              "button",
              {
                type: "button",
                className: "btn-danger btn-sm mr-auto",
                disabled: detail.canDelete === false,
                title: detail.canDelete === false ? "Blocked by existing orders, offers, reviews or conversations" : "Permanently delete this listing",
                onClick: () =>
                  openAction(detail.product, {
                    to: DELETE_TARGET,
                    label: "Delete listing permanently",
                    destructive: true,
                    reason: false,
                  }),
              },
              icon("Trash2", { size: 13 }),
              " Delete permanently"
            ),
            (TRANSITIONS[detail.product.status] || []).map((t) =>
              h(
                "button",
                {
                  type: "button",
                  key: t.to,
                  className: t.destructive ? "btn-danger btn-sm" : "btn-secondary btn-sm",
                  onClick: () => openAction(detail.product, t),
                },
                icon(t.icon, { size: 13 }),
                " ",
                t.label
              )
            ),
            h("button", { type: "button", className: "btn-primary btn-sm", onClick: () => { st.detail = null; paintDetailModal(); } }, "Done")
          )
        : null,
      children: body,
    });
    mount(detailModalHost, modal);
  };

  const paintDetailContent = () => {
    const d = st.detail;
    const product = d.product;
    const refs = d.references;

    const sections = [
      h(
        "div",
        { className: "flex flex-wrap items-center gap-2" },
        h("span", { className: `badge capitalize border ${listingTone(product.status)}` }, LISTING_STATUS_LABELS[product.status] || product.status),
        h("span", { className: "badge badge-neutral" }, formatINR(product.price)),
        h("span", { className: "badge badge-neutral" }, product.condition),
        h("span", { className: "badge badge-neutral" }, `${product.views || 0} views`)
      ),
    ];

    if (product.moderatedAt) {
      sections.push(
        h(
          "div",
          { className: "rounded-xl border border-warning/25 bg-warning-soft px-4 py-3" },
          h(
            "p",
            { className: "text-xs font-extrabold text-warning flex items-center gap-1.5" },
            icon("ShieldAlert", { size: 13 }),
            ` Moderated ${formatDate(product.moderatedAt)} by ${product.moderatedByName || "an admin"}`
          ),
          h(
            "p",
            { className: "text-xs text-ink-900/80 mt-1" },
            reasonLabel(product.moderationReason),
            product.moderationNote ? ` — ${product.moderationNote}` : ""
          )
        )
      );
    }

    sections.push(
      h(
        "section",
        null,
        h("h4", { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2" }, "Description"),
        h("p", { className: "text-sm text-ink-900/85 whitespace-pre-line leading-relaxed" }, product.description)
      ),
      // Why deletion is or is not possible - the honest answer, stated up front.
      h(
        "section",
        null,
        h(
          "h4",
          { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" },
          icon("Info", { size: 12 }),
          " What references this listing"
        ),
        refs.canDelete
          ? h(
              "p",
              { className: "text-xs text-success font-semibold" },
              "Nothing references this listing, so it can be permanently deleted. Its price history will be removed with it; its tracked events are kept."
            )
          : h(
              "p",
              { className: "text-xs text-danger font-semibold mb-2" },
              "This listing cannot be permanently deleted because of other people's records. Take it off the market instead - that is reversible."
            ),
        h(
          "div",
          { className: "grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2" },
          [...(refs.blockers || []), ...(refs.removable || []), ...(refs.retained || [])].map((r) =>
            h(
              "div",
              { key: r.name, className: "rounded-lg border border-line bg-raised px-3 py-2" },
              h("p", { className: "text-2xs font-bold text-muted-soft uppercase tracking-wide" }, r.tier === "blockers" ? "Blocks deletion" : r.tier === "removable" ? "Removed with it" : "Kept"),
              h("p", { className: "text-sm font-extrabold text-ink-900 tabular" }, r.count),
              h("p", { className: "text-2xs text-muted" }, `${r.label}${r.count === 1 ? "" : "s"}`)
            )
          )
        )
      )
    );

    if (product.moderationHistory?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "h4",
            { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" },
            icon("History", { size: 12 }),
            " Moderation history"
          ),
          h(
            "ol",
            { className: "space-y-2" },
            [...product.moderationHistory].reverse().map((entry, i) =>
              h(
                "li",
                { key: i, className: "rounded-lg border border-line bg-raised px-3.5 py-2.5" },
                h(
                  "p",
                  { className: "text-xs font-bold text-ink-900" },
                  entry.from || "—",
                  " → ",
                  entry.to || "—",
                  h("span", { className: "text-muted-soft font-normal ml-2" }, formatDate(entry.at))
                ),
                h(
                  "p",
                  { className: "text-2xs text-muted mt-0.5" },
                  entry.byName || "system",
                  entry.reason ? ` · ${reasonLabel(entry.reason)}` : "",
                  entry.note ? ` · ${entry.note}` : ""
                )
              )
            )
          )
        )
      );
    }

    if (d.reports?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "h4",
            { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" },
            icon("Flag", { size: 12 }),
            " Customer reports"
          ),
          h(
            "ul",
            { className: "space-y-2" },
            d.reports.map((r) =>
              h(
                "li",
                { key: r._id, className: "rounded-lg border border-line bg-raised px-3.5 py-2.5" },
                h(
                  "p",
                  { className: "text-xs font-bold text-ink-900" },
                  reasonLabel(r.reason),
                  h("span", { className: "text-muted-soft font-normal ml-2" }, formatDate(r.createdAt))
                ),
                h(
                  "p",
                  { className: "text-2xs text-muted mt-0.5" },
                  r.status,
                  " · reported by ",
                  r.reporterName,
                  r.details ? ` · ${r.details}` : ""
                )
              )
            )
          )
        )
      );
    }

    return h("div", { className: "space-y-5" }, sections);
  };

  paintHeader();
  paintFilters();
  paintBody();
  scheduleLoad();

  return root;
}