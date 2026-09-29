/**
 * Admin console — product intelligence hub.
 *
 * Vanilla port of `pages/admin/AdminProductIntel.jsx`.
 *
 * Four views over two questions ("which listings need attention?" vs "why is
 * this specific listing behaving like this, and who is interested?"):
 *
 *  - Marketplace attraction: the only view needing no prior selection, delegated
 *    to the ported `CatalogueAttraction`. A drilled-into listing is handed to
 *    the workspace by id (component state rather than a `?product=` URL write —
 *    this router remounts on navigation, so the workspace itself owns the URL
 *    contract for the chains *it* starts).
 *  - Listing workspace: the ported `ProductIntelWorkspace`, seeded from
 *    `?product=` on refresh.
 *  - Attention ranking & catalog health: fetched lazily from
 *    `/admin/product-intelligence` — only when one of those tabs is opened —
 *    exactly the "no request nobody is waiting for" intent of the React source.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import { link } from "../../navigation.js";
import api from "../../services/api.js";
import { formatINR, formatNumber } from "../../utils/format.js";
import { C } from "../../utils/theme.js";
import ProductIntelWorkspace from "./intel/product-intelligence-workspace.js";
import CatalogueAttraction from "./intel/catalogue-attraction.js";

const TABS = [
  { key: "marketplace", label: "Marketplace attraction", icon: "Users" },
  { key: "listing", label: "Listing workspace", icon: "BarChart3" },
  { key: "attention", label: "Attention ranking", icon: "TrendingUp" },
  { key: "catalog", label: "Catalog health", icon: "Package" },
];

const SECTIONS = [
  { key: "mostViewed", icon: "Eye", tone: "bg-info-soft text-info", bar: C.info, label: "Most viewed", metric: "views" },
  { key: "mostWishlisted", icon: "Heart", tone: "bg-magenta-soft text-magenta", bar: C.magenta, label: "Most wishlisted", metric: "wishlistCount" },
  { key: "mostCompared", icon: "GitCompareArrows", tone: "bg-primary-soft text-primary", bar: C.primary, label: "Most compared", metric: "compareCount" },
  { key: "mostPurchased", icon: "ShoppingBag", tone: "bg-success-soft text-success", bar: C.success, label: "Best sellers", metric: "orderCount" },
];

const RANKING_TABS = new Set(["attention", "catalog"]);

export default function AdminProductIntel({ location, query: pageQuery } = {}) {
  const st = { data: null, loading: false, attempt: 0, tab: "marketplace", productId: pageQuery?.product || null };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const headerHost = h("div");
  const contentHost = h("div");
  root.appendChild(headerHost);
  root.appendChild(contentHost);

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

  const load = async () => {
    if (!RANKING_TABS.has(st.tab) || st.data) return;
    st.loading = true;
    paint();
    try {
      const { data } = await api.get("/admin/product-intelligence");
      if (!ensureAlive()) return;
      st.data = data;
      st.loading = false;
      paint();
    } catch (err) {
      if (!ensureAlive()) return;
      st.loading = false;
      paint();
    }
  };

  const openListing = (productId) => {
    st.productId = productId;
    st.tab = "listing";
    paintHeader();
    paint();
  };

  const paintHeader = () => {
    mount(
      headerHost,
      h(
        "header",
        { className: "flex flex-col lg:flex-row lg:items-end justify-between gap-4" },
        h(
          "div",
          null,
          h("span", { className: "page-eyebrow" }, icon("Lightbulb", { size: 12 }), " Insights"),
          h("h1", { className: "page-title" }, "Product intelligence"),
          h("p", { className: "page-sub" }, "Who is interested in a listing, how far they get, and what they do instead.")
        ),
        h(
          "div",
          { className: "tab-list self-start max-w-full" },
          TABS.map((t) =>
            h(
              "button",
              {
                key: t.key,
                type: "button",
                onClick: () => {
                  st.tab = t.key;
                  paintHeader();
                  paint();
                  load();
                },
                className: `tab ${st.tab === t.key ? "tab-active" : ""}`,
              },
              icon(t.icon, { size: 14 }),
              ` ${t.label}`
            )
          )
        )
      )
    );
  };

  const paint = () => {
    if (st.tab === "marketplace") {
      mount(contentHost, CatalogueAttraction({ onOpenListing: openListing }));
      return;
    }
    if (st.tab === "listing") {
      // `st.productId` seeds the workspace's selector and first fetch; paged
      // through `query` so a refresh with `?product=` also lands where it did in
      // React while a drilled-into id keeps the workspace mounted underneath.
      mount(contentHost, ProductIntelWorkspace({ location, query: { product: st.productId } }));
      return;
    }
    if (st.loading) {
      mount(
        contentHost,
        h(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in" },
          [0, 1, 2, 3, 4, 5].map(() => h("div", { className: "h-56 rounded-2xl bg-sunken animate-pulse" }))
        )
      );
      return;
    }
    if (!st.data) {
      mount(
        contentHost,
        h(
          "div",
          { className: "panel p-12 text-center" },
          h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("Lightbulb", { size: 20 })),
          h("h3", { className: "font-extrabold text-ink-900" }, "Catalogue ranking unavailable"),
          h("p", { className: "text-sm text-muted mt-1" }, "The catalogue-level ranking could not be loaded. The per-listing workspace is unaffected."),
          h(
            "button",
            { type: "button", onClick: () => { st.attempt += 1; load(); }, className: "btn btn-secondary btn-sm mt-4" },
            "Try again"
          )
        )
      );
      return;
    }

    if (st.tab === "attention") {
      const categories = st.data?.categoryIntelligence || [];
      const maxAttention = Math.max(1, ...(st.data?.mostViewed || []).map((p) => p.attentionRatio || 0));
      const totals = [
        { icon: "Layers", label: "Categories", value: formatNumber(categories.length) },
        { icon: "Package", label: "Listings", value: formatNumber(categories.reduce((sum, c) => sum + (c.products || 0), 0)) },
        { icon: "Eye", label: "Total views", value: formatNumber(categories.reduce((sum, c) => sum + (c.totalViews || 0), 0)) },
        { icon: "ShoppingBag", label: "Total orders", value: formatNumber(categories.reduce((sum, c) => sum + (c.totalOrders || 0), 0)) },
      ];
      mount(
        contentHost,
        h(
          "div",
          { className: "animate-fade-in space-y-5" },
          h(
            "div",
            { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" },
            totals.map((t) =>
              h(
                "div",
                { key: t.label, className: "stat-card" },
                h(
                  "div",
                  { className: "flex items-center justify-between" },
                  icon(t.icon, { size: 16, className: "text-primary" }),
                  h("span", { className: "metric-label" }, t.label)
                ),
                h("p", { className: "metric mt-2" }, t.value)
              )
            )
          ),
          h(
            "div",
            { className: "flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3" },
            icon("Gauge", { size: 15, className: "text-primary flex-none mt-0.5" }),
            h(
              "p",
              { className: "text-xs text-muted leading-relaxed" },
              h("span", { className: "font-bold text-ink-900" }, "Attention ratio"),
              " = orders per 1,000 views. A healthy listing sits above ",
              h("span", { className: "font-extrabold text-primary tabular" }, (maxAttention * 0.4).toFixed(1)),
              " on this catalogue."
            )
          ),
          h(
            "div",
            { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
            SECTIONS.map((s) => {
              const list = st.data[s.key] || [];
              const maxVal = Math.max(1, ...list.map((p) => p[s.metric] || 0));
              return h(
                "section",
                { key: s.key, className: "panel" },
                h(
                  "div",
                  { className: "panel-head" },
                  h(
                    "div",
                    { className: "flex items-center gap-2.5" },
                    h("span", { className: `icon-tile flex-none ${s.tone}` }, icon(s.icon, { size: 16 })),
                    h("h2", { className: "panel-title" }, s.label)
                  ),
                  h("span", { className: "badge-neutral" }, list.length)
                ),
                h(
                  "div",
                  { className: "panel-body space-y-2" },
                  list.length === 0
                    ? h("p", { className: "text-sm text-muted-soft py-6 text-center" }, "No data yet")
                    : list.map((p, i) => {
                        const value = p[s.metric] || 0;
                        return h(
                          "a",
                          link(`/products/${p._id}`, { className: "block sunken-panel p-3 hover:bg-primary-soft hover:border-brand-200 transition-colors group" }),
                          h(
                            "div",
                            { className: "flex items-center gap-3" },
                            h(
                              "span",
                              {
                                className: `w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-extrabold flex-none ${i < 3 ? "bg-primary text-white" : "bg-white border border-line text-muted"}`,
                              },
                              i + 1
                            ),
                            h(
                              "div",
                              { className: "flex-1 min-w-0" },
                              h("div", { className: "font-semibold text-sm text-ink-900 group-hover:text-primary truncate" }, p.title),
                              h("div", { className: "text-2xs text-muted" }, `${p.categoryName || "Uncategorized"} \u00B7 ${formatINR(p.price)}`),
                              h(
                                "div",
                                { className: "mt-1.5 h-1.5 bg-line rounded-full overflow-hidden" },
                                h("div", { className: "h-full rounded-full transition-all duration-500", style: { width: `${(value / maxVal) * 100}%`, background: i < 3 ? s.bar : C.neutral } })
                              )
                            ),
                            h(
                              "div",
                              { className: "text-right flex-none" },
                              h("div", { className: "text-base font-extrabold text-ink-900 tabular" }, formatNumber(value)),
                              h("div", { className: "text-2xs text-muted-soft tabular" }, `attn ${Number(p.attentionRatio || 0).toFixed(1)}/1k`)
                            )
                          )
                        );
                      })
                )
              );
            })
          )
        )
      );
      return;
    }

    // catalog tab
    const categories = st.data?.categoryIntelligence || [];
    const maxBand = Math.max(1, ...(st.data?.priceBands || []).map((x) => x.products));
    mount(
      contentHost,
      h(
        "div",
        { className: "grid grid-cols-1 lg:grid-cols-2 gap-5" },
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h(
              "div",
              { className: "flex items-center gap-2.5" },
              icon("Tag", { size: 16, className: "text-primary" }),
              h(
                "div",
                null,
                h("h2", { className: "panel-title" }, "Discount depth"),
                h("p", { className: "panel-sub" }, "How listings are priced vs their list price")
              )
            )
          ),
          h(
            "div",
            { className: "panel-body space-y-3" },
            (st.data.priceBands || []).length === 0
              ? h("p", { className: "text-sm text-muted-soft py-6 text-center" }, "No data yet")
              : (st.data.priceBands || []).map((b) => {
                  const conv = b.views > 0 ? (b.orders / Math.max(b.views, 1)) * 1000 : 0;
                  return h(
                    "div",
                    { key: b._id, className: "sunken-panel p-4" },
                    h(
                      "div",
                      { className: "flex items-center justify-between gap-2 mb-1.5" },
                      h("span", { className: "text-sm font-bold text-ink-900" }, b._id),
                      h("span", { className: "text-2xs text-muted tabular" }, `${b.products} listings`)
                    ),
                    h("div", { className: "h-2 bg-line rounded-full overflow-hidden mb-2.5" }, h("div", { className: "h-full rounded-full bg-primary transition-all duration-500", style: { width: `${(b.products / maxBand) * 100}%` } })),
                    h(
                      "div",
                      { className: "flex items-center gap-3 text-2xs flex-wrap" },
                      h("span", { className: "text-muted" }, h("b", { className: "text-ink-900 tabular" }, formatNumber(b.views)), " views"),
                      h("span", { className: "text-muted" }, h("b", { className: "text-ink-900 tabular" }, formatNumber(b.orders)), " orders"),
                      h("span", { className: "text-muted" }, h("b", { className: "text-ink-900 tabular" }, formatNumber(b.wishlists)), " wishlists"),
                      h("span", { className: `tabular font-bold ${conv > 2 ? "text-success" : "text-muted"}` }, `attn ${conv.toFixed(1)}/1k`)
                    )
                  );
                })
          )
        ),
        h(
          "section",
          { className: "panel" },
          h(
            "div",
            { className: "panel-head" },
            h("h2", { className: "panel-title" }, "Category performance"),
            h("span", { className: "badge-neutral" }, categories.length)
          ),
          h(
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
                  h("th", null, "Category"),
                  h("th", { className: "th-num" }, "Listings"),
                  h("th", { className: "th-num" }, "Views"),
                  h("th", { className: "th-num" }, "Orders"),
                  h("th", { className: "th-num" }, "Conv/1k"),
                  h("th", { className: "th-num" }, "Avg price")
                )
              ),
              h(
                "tbody",
                null,
                categories.length === 0
                  ? h("tr", null, h("td", { colSpan: 6, className: "px-4 py-10 text-center text-muted" }, "No category data yet"))
                  : categories.map((c) => {
                      const conv = c.totalViews > 0 ? ((c.totalOrders / Math.max(c.totalViews, 1)) * 1000).toFixed(1) : "0";
                      return h(
                        "tr",
                        { key: c._id },
                        h("td", { className: "font-semibold text-ink-900" }, c._id),
                        h("td", { className: "num text-muted" }, formatNumber(c.products)),
                        h("td", { className: "num text-muted" }, formatNumber(c.totalViews)),
                        h("td", { className: "num text-muted" }, formatNumber(c.totalOrders)),
                        h("td", { className: "num text-primary" }, conv),
                        h("td", { className: "num text-muted" }, formatINR(c.avgPrice))
                      );
                    })
              )
            )
          )
        )
      )
    );
  };

  paintHeader();
  paint();

  return root;
}