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
 *
 * The inspect panel, the confirmation dialog and the calls behind them live in
 * `./product-actions.js` now, because the catalogue table on the Products page
 * drives the same three endpoints. This page hands it a reload callback and is
 * otherwise unchanged.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { imageProps } from "../../utils/images.js";
import { formatINR } from "../../utils/format.js";
import { listingTone } from "../../utils/theme.js";
import { LISTING_STATUS_LABELS, reasonLabel } from "../../utils/moderation.js";
import { createProductActions } from "./product-actions.js";

const PAGE_SIZE = 15;

export default function AdminListings() {
  const st = {
    rows: [], facets: {}, total: 0, page: 1, status: "", search: "", loading: true,
  };
  let disposed = false;
  let searchTimer = null;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("header", { className: "flex flex-wrap items-end justify-between gap-3" });
  const filtersHost = h("div", { className: "panel p-4 space-y-3" });
  const bodyHost = h("div");

  /** Inspect panel + confirmation dialog, shared with the catalogue table. */
  const desk = createProductActions({ isAlive: () => ensureAlive(), onChanged: () => load() });

  root.appendChild(headerHost);
  root.appendChild(filtersHost);
  root.appendChild(bodyHost);
  for (const host of desk.hosts) root.appendChild(host);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      clearTimeout(searchTimer);
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

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
              desk.actionsCell(p)
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

  paintHeader();
  paintFilters();
  paintBody();
  scheduleLoad();

  return root;
}
