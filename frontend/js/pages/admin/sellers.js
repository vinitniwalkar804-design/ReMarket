/**
 * Admin console — Sellers.
 *
 * Vanilla port of `pages/admin/AdminSellers.jsx`.
 *
 * A searchable, filterable seller directory. Verification is a real server
 * action (grant or revoke), and the "is this seller a problem?" question is
 * answered in the detail modal rather than the table.
 *
 * Behavioural details preserved from React:
 *  - search is debounced 300ms; filters reset to page one;
 *  - the "Needs a look" chip shows the flagged count for the *current page*;
 *  - a verify action refreshes the table and, if that seller is open, the modal.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { formatINR, formatDate, formatNumber } from "../../utils/format.js";
import { orderTone, listingTone } from "../../utils/theme.js";
import { SkeletonRow } from "../../components/loading.js";
import { LISTING_STATUS_LABELS, reasonLabel } from "../../utils/moderation.js";
import Modal from "../../components/modal.js";

const PAGE_SIZE = 15;

export default function AdminSellers() {
  const st = {
    sellers: [], total: 0, page: 1, search: "", onlyVerified: false, onlyFlagged: false,
    loading: true, detail: null, busy: false, toast: "",
  };
  let disposed = false;
  let searchTimer = null;
  let toastTimer = null;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("header", { className: "flex flex-wrap items-end justify-between gap-3" });
  const filtersHost = h("div", { className: "panel p-4 space-y-3" });
  const bodyHost = h("div");
  const toastHost = h("div");
  const modalHost = h("div");

  root.appendChild(headerHost);
  root.appendChild(filtersHost);
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
      h(
        "div",
        { className: "fixed bottom-5 right-5 z-[110] badge badge-success shadow-pop px-4 py-2.5 animate-slide-up" },
        msg
      )
    );
    toastTimer = setTimeout(() => mount(toastHost), 4000);
  };

  const paintHeader = () => {
    const pages = Math.max(1, Math.ceil(st.total / PAGE_SIZE));
    mount(
      headerHost,
      h(
        "div",
        null,
        h("span", { className: "page-eyebrow" }, icon("Store", { size: 12 }), " Marketplace Intelligence"),
        h("h1", { className: "page-title" }, "Sellers"),
        h("p", { className: "page-sub" }, st.loading ? "Loading sellers…" : `${st.total} seller account${st.total === 1 ? "" : "s"}`)
      ),
      h(
        "div",
        { className: "flex items-center gap-1.5" },
        h(
          "button",
          { type: "button", disabled: st.page === 1 || st.loading, className: "btn-icon", "aria-label": "Previous page", onClick: () => { st.page = Math.max(1, st.page - 1); scheduleLoad(); } },
          icon("ChevronLeft", { size: 15 })
        ),
        h("span", { className: "text-2xs font-bold text-muted tabular px-1" }, `${st.page} / ${pages}`),
        h(
          "button",
          { type: "button", disabled: st.page === pages || st.loading, className: "btn-icon", "aria-label": "Next page", onClick: () => { st.page = Math.min(pages, st.page + 1); scheduleLoad(); } },
          icon("ChevronRight", { size: 15 })
        )
      )
    );
  };

  const paintFilters = () => {
    const flagged = st.sellers.reduce((n, s) => n + (s.flaggedCount || 0), 0);
    const input = h("input", {
      type: "text",
      value: st.search,
      placeholder: "Search seller names…",
      className: "input-field pl-9",
      "aria-label": "Search sellers",
    });
    input.addEventListener("input", (e) => {
      st.search = e.target.value;
      st.page = 1;
      scheduleLoad();
    });

    const chipBtn = (active, onClick, label, count) =>
      h(
        "button",
        { type: "button", className: `chip ${active ? "chip-active" : "chip-idle"}`, onClick },
        label,
        count > 0 ? h("span", { className: "ml-1 opacity-60 tabular" }, count) : null
      );

    mount(
      filtersHost,
      h(
        "div",
        { className: "flex flex-wrap items-center gap-2" },
        chipBtn(
          !st.onlyVerified && !st.onlyFlagged,
          () => { st.onlyVerified = false; st.onlyFlagged = false; st.page = 1; paintFilters(); paintHeader(); scheduleLoad(); },
          "All sellers",
          0
        ),
        chipBtn(
          st.onlyVerified,
          () => { st.onlyVerified = !st.onlyVerified; st.onlyFlagged = false; st.page = 1; paintFilters(); paintHeader(); scheduleLoad(); },
          "Verified",
          0
        ),
        chipBtn(
          st.onlyFlagged,
          () => { st.onlyFlagged = !st.onlyFlagged; st.onlyVerified = false; st.page = 1; paintFilters(); paintHeader(); scheduleLoad(); },
          "Needs a look",
          flagged
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
        h("div", { className: "panel p-5 space-y-3" }, Array(6).fill(0).map((_, i) => h("span", { key: i }, SkeletonRow())))
      );
      return;
    }

    if (st.sellers.length === 0) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Store", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "No sellers match"),
          h("p", { className: "text-sm text-muted mt-1" }, "Try clearing the filters above.")
        )
      );
      return;
    }

    const star = (cls) => {
      const s = icon("Star", { size: 12, className: cls });
      s.setAttribute("fill", "currentColor");
      return s;
    };

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
            h("th", null, "Seller"),
            h("th", { className: "th-num" }, "Listings"),
            h("th", { className: "th-num" }, "Sold"),
            h("th", { className: "th-num" }, "Orders"),
            h("th", { className: "th-num" }, "Rating"),
            h("th", null, "Standing"),
            h("th", { className: "text-right" }, "Actions")
          )
        ),
        h(
          "tbody",
          null,
          st.sellers.map((s) =>
            h(
              "tr",
              { key: s._id },
              h(
                "td",
                null,
                h(
                  "div",
                  { className: "flex items-center gap-3" },
                  h("span", { className: "avatar w-9 h-9 flex-none" }, s.name?.charAt(0)?.toUpperCase()),
                  h(
                    "div",
                    { className: "min-w-0" },
                    h("p", { className: "text-sm font-semibold text-ink-900 line-clamp-1" }, s.name),
                    h("p", { className: "text-2xs text-muted-soft truncate" }, s.email)
                  )
                )
              ),
              h("td", { className: "num" }, formatNumber(s.listings || 0)),
              h("td", { className: "num" }, formatNumber(s.soldCount || 0)),
              h("td", { className: "num" }, formatNumber(s.orderCount || 0)),
              h(
                "td",
                null,
                h("span", { className: "inline-flex items-center gap-1 text-xs font-bold text-ink-900" }, star("text-warning"), (s.sellerRating ?? 0).toFixed(1))
              ),
              h(
                "td",
                null,
                h(
                  "div",
                  { className: "flex flex-wrap items-center gap-1.5" },
                  s.isVerifiedSeller
                    ? h("span", { className: "badge badge-success" }, icon("ShieldCheck", { size: 10 }), " Verified")
                    : h("span", { className: "badge badge-neutral" }, "Unverified"),
                  s.flaggedCount > 0 && h("span", { className: "badge badge-warning", title: "Moderated listings" }, `${s.flaggedCount} flagged`),
                  s.openReports > 0 && h("span", { className: "badge badge-danger", title: "Open customer reports" }, icon("Flag", { size: 10 }), " ", s.openReports)
                )
              ),
              h(
                "td",
                null,
                h(
                  "div",
                  { className: "flex items-center justify-end gap-1.5" },
                  h("button", { type: "button", className: "btn-secondary btn-xs", onClick: () => openDetail(s._id) }, icon("User", { size: 12 }), " Open"),
                  h(
                    "button",
                    {
                      type: "button",
                      className: s.isVerifiedSeller ? "btn-quiet btn-xs" : "btn-secondary btn-xs",
                      onClick: () => setVerification(s, !s.isVerifiedSeller),
                      disabled: st.busy,
                      title: s.isVerifiedSeller ? "Revoke verified-seller status" : "Grant verified-seller status",
                    },
                    s.isVerifiedSeller ? icon("ShieldX", { size: 12 }) : icon("ShieldCheck", { size: 12 }),
                    s.isVerifiedSeller ? " Revoke" : " Verify"
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
        h("span", { className: "text-2xs text-muted" }, `Showing ${(st.page - 1) * PAGE_SIZE + 1}–${Math.min(st.page * PAGE_SIZE, st.total)} of ${st.total}`),
        h(
          "div",
          { className: "flex items-center gap-1.5" },
          h("button", { type: "button", disabled: st.page === 1, className: "btn-secondary btn-sm", onClick: () => { st.page = Math.max(1, st.page - 1); scheduleLoad(); } }, icon("ChevronLeft", { size: 13 }), " Prev"),
          h("button", { type: "button", disabled: st.page === pages, className: "btn-secondary btn-sm", onClick: () => { st.page = Math.min(pages, st.page + 1); scheduleLoad(); } }, "Next ", icon("ChevronRight", { size: 13 }))
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
    if (st.search.trim()) params.set("search", st.search.trim());
    if (st.onlyVerified) params.set("verified", "true");
    if (st.onlyFlagged) params.set("flagged", "true");
    api
      .get(`/admin/sellers?${params}`)
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.sellers = data.sellers || [];
        st.total = data.total || 0;
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.sellers = [];
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
    paintModal();
    try {
      const { data } = await api.get(`/admin/sellers/${id}`);
      if (!ensureAlive()) return;
      st.detail = data;
    } catch {
      if (!ensureAlive()) return;
      st.detail = null;
    }
    paintModal();
  };

  const setVerification = async (seller, value) => {
    st.busy = true;
    paintBody();
    paintModal();
    try {
      const { data } = await api.patch(`/admin/sellers/${seller._id}`, { isVerifiedSeller: value });
      if (!ensureAlive()) return;
      showToast(data.message);
      await load();
      if (st.detail?.seller?._id === seller._id) openDetail(seller._id);
    } catch (err) {
      if (!ensureAlive()) return;
      showToast(err.response?.data?.message || "That change could not be saved");
    } finally {
      if (ensureAlive()) {
        st.busy = false;
        paintBody();
        paintModal();
      }
    }
  };

  const paintModal = () => {
    const detail = st.detail;
    if (!detail) {
      mount(modalHost);
      return;
    }

    const body =
      detail?.loading || !detail?.seller
        ? h("div", { className: "space-y-3" }, Array(3).fill(0).map((_, i) => h("span", { key: i }, SkeletonRow())))
        : paintModalContent();

    const modal = Modal({
      open: true,
      onClose: () => { st.detail = null; paintModal(); },
      wide: true,
      title: detail?.seller?.name || "Seller",
      subtitle: detail?.seller ? `${detail.seller.email} · joined ${formatDate(detail.seller.createdAt)}` : undefined,
      footer: detail?.seller
        ? h(
            "div",
            { className: "flex items-center justify-end gap-2 w-full" },
            h(
              "button",
              {
                type: "button",
                className: detail.seller.isVerifiedSeller ? "btn-quiet btn-sm mr-auto" : "btn-secondary btn-sm mr-auto",
                onClick: () => setVerification(detail.seller, !detail.seller.isVerifiedSeller),
                disabled: st.busy,
              },
              detail.seller.isVerifiedSeller ? icon("ShieldX", { size: 13 }) : icon("ShieldCheck", { size: 13 }),
              detail.seller.isVerifiedSeller ? " Revoke verification" : " Verify seller"
            ),
            h("button", { type: "button", className: "btn-primary btn-sm", onClick: () => { st.detail = null; paintModal(); } }, "Done")
          )
        : null,
      children: body,
    });
    mount(modalHost, modal);
  };

  const paintModalContent = () => {
    const d = st.detail;
    const seller = d.seller;
    const sections = [
      h(
        "div",
        { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" },
        [
          { label: "Listings", value: Object.values(d.listingBreakdown || {}).reduce((a, b) => a + b, 0) },
          { label: "Sold", value: d.listingBreakdown?.sold || 0 },
          { label: "Orders", value: d.orders?.length || 0 },
          { label: "Revenue", value: formatINR(d.revenue || 0) },
        ].map((card) =>
          h(
            "div",
            { key: card.label, className: "rounded-lg border border-line bg-raised px-3 py-2" },
            h("p", { className: "text-2xs font-bold uppercase tracking-wide text-muted-soft" }, card.label),
            h("p", { className: "text-base font-extrabold text-ink-900 tabular" }, card.value)
          )
        )
      ),
    ];

    if (Object.keys(d.listingBreakdown || {}).length > 0) {
      sections.push(
        h(
          "section",
          null,
          h("h4", { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2" }, "Listings by status"),
          h(
            "div",
            { className: "flex flex-wrap gap-1.5" },
            Object.entries(d.listingBreakdown).map(([status, count]) =>
              h("span", { key: status, className: `badge capitalize border ${listingTone(status)}` }, `${LISTING_STATUS_LABELS[status] || status}: ${count}`)
            )
          )
        )
      );
    }

    if (d.listings?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h("h4", { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2" }, "Their listings"),
          h(
            "ul",
            { className: "space-y-1.5 max-h-64 overflow-y-auto" },
            d.listings.map((p) =>
              h(
                "li",
                { key: p._id, className: "flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3.5 py-2" },
                h(
                  "div",
                  { className: "min-w-0" },
                  h("p", { className: "text-xs font-bold text-ink-900 line-clamp-1" }, p.title),
                  h("p", { className: "text-2xs text-muted-soft" }, `${p.categoryName} · ${formatINR(p.price)}${p.moderationReason ? ` · ${reasonLabel(p.moderationReason)}` : ""}`)
                ),
                h("span", { className: `badge capitalize border flex-none ${listingTone(p.status)}` }, LISTING_STATUS_LABELS[p.status] || p.status)
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
          h("h4", { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2 flex items-center gap-1.5" }, icon("Flag", { size: 12 }), " Reports against this seller"),
          h(
            "ul",
            { className: "space-y-1.5" },
            d.reports.map((r) =>
              h(
                "li",
                { key: r._id, className: "rounded-lg border border-line bg-raised px-3.5 py-2" },
                h("p", { className: "text-xs font-bold text-ink-900" }, reasonLabel(r.reason), h("span", { className: "text-muted-soft font-normal ml-2" }, formatDate(r.createdAt))),
                h("p", { className: "text-2xs text-muted" }, `${r.status} · ${r.productTitle || "listing removed"}`)
              )
            )
          )
        )
      );
    }

    if (d.orders?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h("h4", { className: "text-xs font-extrabold uppercase tracking-wider text-muted-soft mb-2" }, "Recent orders"),
          h(
            "ul",
            { className: "space-y-1.5 max-h-48 overflow-y-auto" },
            d.orders.map((o) =>
              h(
                "li",
                { key: o._id, className: "flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3.5 py-2" },
                h(
                  "div",
                  { className: "min-w-0" },
                  h("p", { className: "text-xs font-bold text-ink-900 line-clamp-1" }, o.productId?.title || "Listing removed"),
                  h("p", { className: "text-2xs text-muted-soft" }, `to ${o.buyerId?.name || "a buyer"} · ${formatDate(o.createdAt)}`)
                ),
                h(
                  "div",
                  { className: "flex items-center gap-2 flex-none" },
                  h("span", { className: `badge ${orderTone(o.status)}` }, o.status),
                  h("span", { className: "text-xs font-bold text-ink-900 tabular" }, formatINR(o.finalPrice))
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