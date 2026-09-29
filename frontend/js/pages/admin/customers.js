/**
 * Admin console — Customers.
 *
 * Vanilla port of `pages/admin/AdminCustomers.jsx`.
 *
 * A search-backed, paginated table over the customer API. React fired its fetch
 * from an effect keyed on `[page, search]`, so every keystroke re-queried and
 * search always resets to page one; that behaviour is preserved exactly, with no
 * debounce introduced. The four stat cards are derived from the current page's
 * rows, as in React ("Spend on page" is deliberately page-scoped).
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { formatINR, formatNumber } from "../../utils/format.js";

const PAGE_SIZE = 15;

const pageNumbers = (totalPages, current) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, current - 1, current, current + 1]);
  return [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
};

export default function AdminCustomers() {
  const st = { customers: [], total: 0, search: "", loading: true, page: 1 };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("header", { className: "flex flex-col sm:flex-row sm:items-end justify-between gap-4" });
  const statsHost = h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" });
  const bodyHost = h("div");

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const paintHeader = () => {
    const input = h("input", {
      value: st.search,
      type: "text",
      placeholder: "Search name or email…",
      className: "input-field pl-10",
      "aria-label": "Search customers",
    });
    input.addEventListener("input", (e) => {
      st.page = 1;
      st.search = e.target.value;
      load();
    });

    mount(
      headerHost,
      h(
        "div",
        null,
        h("span", { className: "page-eyebrow" }, icon("Users", { size: 12 }), " People"),
        h("h1", { className: "page-title" }, "Customers"),
        h(
          "p",
          { className: "page-sub" },
          "Every registered account with its orders, spend and the K-Means persona it falls into. ",
          h("a", link("/admin/personas", { className: "font-bold text-primary hover:underline" }), "See the segmentation"),
          "."
        )
      ),
      h(
        "div",
        { className: "relative w-full sm:w-72" },
        icon("Search", { size: 15, className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }),
        input
      )
    );
  };

  const paintStats = () => {
    const buyers = st.customers.filter((c) => (c.orderCount || 0) > 0).length;
    const sellers = st.customers.filter((c) => c.isVerifiedSeller).length;
    const spend = st.customers.reduce((s, c) => s + (Number(c.totalSpent) || 0), 0);

    const stats = [
      { icon: "Users", label: "Customers", value: st.loading ? "—" : formatNumber(st.total) },
      { icon: "Wallet", label: "Spend on page", value: st.loading ? "—" : formatINR(spend) },
      { icon: "UserCheck", label: "Buyers on page", value: st.loading ? "—" : buyers },
      { icon: "Crown", label: "Verified sellers", value: st.loading ? "—" : sellers },
    ];

    mount(
      statsHost,
      stats.map((s) =>
        h(
          "div",
          { key: s.label, className: "stat-card" },
          h(
            "div",
            { className: "flex items-center justify-between" },
            icon(s.icon, { size: 16, className: "text-primary" }),
            h("span", { className: "metric-label" }, s.label)
          ),
          h("p", { className: "metric mt-2" }, s.value)
        )
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

    if (st.customers.length === 0) {
      mount(
        bodyHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Users", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "No customers found"),
          h(
            "p",
            { className: "text-sm text-muted mt-1" },
            st.search ? `Nothing matched "${st.search}". Try a different search.` : "No accounts registered yet."
          )
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
            h("th", null, "Customer"),
            h("th", null, "Persona"),
            h("th", { className: "th-num" }, "Orders"),
            h("th", { className: "th-num" }, "Spent"),
            h("th", { className: "th-num" }, "Decision"),
            h("th", { className: "th-num" }, "Profile")
          )
        ),
        h(
          "tbody",
          null,
          st.customers.map((c) =>
            h(
              "tr",
              { key: c._id },
              h(
                "td",
                null,
                h(
                  "div",
                  { className: "flex items-center gap-3" },
                  h("span", { className: "avatar w-9 h-9 text-xs" }, c.name?.charAt(0)),
                  h(
                    "div",
                    { className: "min-w-0" },
                    h(
                      "div",
                      { className: "font-semibold text-sm text-ink-900 flex items-center gap-1.5 truncate" },
                      c.name,
                      c.isVerifiedSeller && icon("Crown", { size: 12, className: "text-rating" })
                    ),
                    h("div", { className: "text-2xs text-muted truncate" }, `${c.email} · ${c.location || "no location"}`)
                  )
                )
              ),
              h(
                "td",
                null,
                c.persona
                  ? h("span", { className: "badge-primary" }, c.persona)
                  : /* Not an error: a customer is only clustered once enough
                       behaviour was recorded for their features to be
                       measurable, so absence here is the honest answer. */
                    h(
                      "span",
                      {
                        className: "text-2xs text-muted-soft",
                        title: "Not enough recorded behaviour to cluster this customer",
                      },
                      "Not clustered"
                    )
              ),
              h(
                "td",
                { className: "num" },
                h(
                  "span",
                  { className: "inline-flex items-center gap-1 justify-end" },
                  icon("ShoppingBag", { size: 12, className: "text-muted-soft" }),
                  formatNumber(c.orderCount)
                )
              ),
              h("td", { className: "num" }, formatINR(c.totalSpent)),
              h(
                "td",
                { className: "num text-muted" },
                h(
                  "span",
                  { className: "inline-flex items-center gap-1 justify-end" },
                  icon("Timer", { size: 12, className: "text-muted-soft" }),
                  c.decisionTime ? `${Math.round(c.decisionTime)}m` : "—"
                )
              ),
              h(
                "td",
                { className: "th-num" },
                h("a", link(`/admin/customers/${c._id}`, { className: "btn-secondary btn-sm" }), "View")
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
        h("span", { className: "text-2xs text-muted" }, `Page ${st.page} of ${pages} · ${formatNumber(st.total)} customers`),
        h(
          "div",
          { className: "flex items-center gap-1" },
          pageNumbers(pages, st.page).map((p, idx, arr) =>
            h(
              "span",
              { key: `p-${p}`, className: "flex items-center gap-1" },
              idx > 0 && arr[idx - 1] !== p - 1 && h("span", { className: "text-2xs text-muted-soft px-0.5" }, "…"),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    st.page = p;
                    load();
                  },
                  className: `w-8 h-8 rounded-lg text-2xs font-bold transition-colors ${
                    st.page === p
                      ? "bg-primary text-white shadow-sm"
                      : "bg-white border border-line text-muted hover:border-line-strong hover:text-ink-900"
                  }`,
                },
                p
              )
            )
          )
        )
      );

    mount(
      bodyHost,
      h("div", { className: "panel" }, table, footer)
    );
  };

  const load = () => {
    st.loading = true;
    paintStats();
    paintBody();
    const params = new URLSearchParams({ page: String(st.page), limit: String(PAGE_SIZE) });
    if (st.search) params.set("search", st.search);
    api
      .get(`/admin/customers?${params}`)
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.customers = data.customers || [];
        st.total = data.total || 0;
        st.loading = false;
        paintStats();
        paintBody();
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.loading = false;
        paintStats();
        paintBody();
      });
  };

  root.appendChild(headerHost);
  root.appendChild(statsHost);
  root.appendChild(bodyHost);
  paintHeader();
  paintStats();
  paintBody();
  load();

  return root;
}