/**
 * Admin console — marketplace trust & order flow.
 *
 * Vanilla port of `pages/admin/AdminMarketplace.jsx`.
 *
 * Reads `/admin/reports` once: latest-week reviews, offer and order status
 * tallies, and the category offer-rate table (share of negotiable listings and
 * average discount depth per category). Like the React source, this page renders
 * immediately with empty panels — there is no spinner.
 */
import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { timeAgo, formatNumber } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";

const OFFER_TONE = {
  accepted: "badge-success",
  countered: "badge-accent",
  pending: "badge-info",
  offered: "badge-info",
  rejected: "badge-danger",
  declined: "badge-danger",
  withdrawn: "badge-neutral",
  cancelled: "badge-neutral",
};

const attractivenessTone = (pct, discount) => {
  if (pct > 50 && discount > 10) return "badge-success";
  if (pct >= 25) return "badge-warning";
  return "badge-neutral";
};

const stars = (rating) =>
  Array.from({ length: 5 }).map((_, i) =>
    icon("Star", { size: 10, className: i < (rating || 0) ? "fill-rating" : "text-line-strong" })
  );

export default function AdminMarketplace() {
  const st = { reports: null };
  let disposed = false;

  const root = h("div", { className: "animate-fade-in space-y-5" });
  const contentHost = h("div");
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

  api
    .get("/admin/reports")
    .then(({ data }) => {
      if (!ensureAlive()) return;
      st.reports = data;
      paint();
    })
    .catch(() => {});

  const paint = () => {
    const reviews = st.reports?.reviewsLast7 || [];
    const offers = st.reports?.offersByStatus || [];
    const orders = st.reports?.ordersByStatus || [];
    const categories = st.reports?.categoryOfferRate || [];

    mount(
      contentHost,
      h(
        "div",
        { className: "animate-fade-in space-y-5" },
        h(
          "header",
          { className: "flex flex-col lg:flex-row lg:items-end justify-between gap-4" },
          h(
            "div",
            null,
            h("span", { className: "page-eyebrow" }, icon("Store", { size: 12 }), " Marketplace health"),
            h("h1", { className: "page-title" }, "Trust & order flow"),
            h("p", { className: "page-sub" }, "Reviews, negotiation depth and fulfilment across the marketplace.")
          )
        ),
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
                icon("MessageSquare", { size: 16, className: "text-primary" }),
                h("h2", { className: "panel-title" }, "Latest reviews")
              ),
              h("span", { className: "badge-neutral" }, reviews.length)
            ),
            h(
              "div",
              { className: "panel-body space-y-3" },
              reviews.length === 0
                ? h("p", { className: "text-sm text-muted-soft py-6 text-center" }, "No reviews yet")
                : reviews.map((r) =>
                    h(
                      "div",
                      { key: r._id, className: "sunken-panel p-4" },
                      h(
                        "div",
                        { className: "flex items-center gap-2 text-2xs mb-1.5" },
                        h("span", { className: "font-bold text-ink-900" }, r.userName || "Customer"),
                        h("span", { className: "flex items-center gap-0.5 text-rating" }, stars(r.rating)),
                        h("span", { className: "text-muted-soft ml-auto" }, timeAgo(r.createdAt))
                      ),
                      h("p", { className: "text-sm text-ink-800 leading-relaxed line-clamp-2" }, r.comment || "\u2014"),
                      h("div", { className: "text-2xs text-muted mt-1.5" }, `on ${r.productTitle || "a product"}`)
                    )
                  )
            )
          ),
          h(
            "div",
            { className: "space-y-5" },
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
                  h("h2", { className: "panel-title" }, "Negotiation pipeline")
                )
              ),
              h(
                "div",
                { className: "panel-body" },
                h(
                  "div",
                  { className: "grid grid-cols-2 gap-3" },
                  offers.length === 0
                    ? h("p", { className: "text-sm text-muted-soft py-6 text-center col-span-2" }, "No offers yet")
                    : offers.map((o) =>
                        h(
                          "div",
                          { key: o._id, className: "sunken-panel p-4 text-center" },
                          h("div", { className: `badge ${OFFER_TONE[o._id] || "badge-neutral"} capitalize` }, o._id),
                          h("div", { className: "metric mt-2" }, formatNumber(o.count)),
                          h("div", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-0.5" }, "offers")
                        )
                      )
                ),
                h(
                  "p",
                  { className: "text-2xs text-muted-soft mt-3 flex items-center gap-1.5" },
                  icon("Percent", { size: 11 }),
                  " Track outright buys vs negotiated deals to tune counter-offer guidance."
                )
              )
            ),
            h(
              "section",
              { className: "panel" },
              h(
                "div",
                { className: "panel-head" },
                h(
                  "div",
                  { className: "flex items-center gap-2.5" },
                  icon("TrendingUp", { size: 16, className: "text-primary" }),
                  h("h2", { className: "panel-title" }, "Order fulfilment")
                )
              ),
              h(
                "div",
                { className: "panel-body" },
                h(
                  "div",
                  { className: "grid grid-cols-2 gap-3" },
                  orders.length === 0
                    ? h("p", { className: "text-sm text-muted-soft py-6 text-center col-span-2" }, "No orders yet")
                    : orders.map((o) =>
                        h(
                          "div",
                          { key: o._id, className: "sunken-panel p-4 text-center" },
                          h("div", { className: `badge ${orderTone(o._id)} capitalize` }, o._id),
                          h("div", { className: "metric mt-2" }, formatNumber(o.count)),
                          h("div", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-0.5" }, "orders")
                        )
                      )
                )
              )
            )
          ),
          h(
            "section",
            { className: "panel lg:col-span-2" },
            h(
              "div",
              { className: "panel-head" },
              h(
                "div",
                { className: "flex items-center gap-2.5" },
                icon("Layers", { size: 16, className: "text-primary" }),
                h(
                  "div",
                  null,
                  h("h2", { className: "panel-title" }, "Category listing offer-rate"),
                  h("p", { className: "panel-sub" }, "Share of negotiable listings and average discount depth per category")
                )
              )
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
                    h("th", { className: "th-num" }, "Negotiable"),
                    h("th", { className: "th-num" }, "Avg discount"),
                    h("th", { className: "th-num" }, "Attractiveness")
                  )
                ),
                h(
                  "tbody",
                  null,
                  categories.length === 0
                    ? h(
                        "tr",
                        null,
                        h("td", { colSpan: 5, className: "px-4 py-10 text-center text-muted" }, "No category data yet")
                      )
                    : categories.map((c) => {
                        const negotiablePct = Math.round((c.negotiableShare || 0) * 100);
                        const discount = Number(c.avgDiscount || 0);
                        const looks =
                          negotiablePct > 50 && discount > 10
                            ? "High"
                            : negotiablePct >= 25
                              ? "Medium"
                              : "Low";
                        return h(
                          "tr",
                          { key: c._id },
                          h("td", { className: "font-semibold text-ink-900" }, c._id),
                          h("td", { className: "num text-muted" }, formatNumber(c.products)),
                          h(
                            "td",
                            { className: "num" },
                            h("span", { className: `badge ${attractivenessTone(negotiablePct, discount)}` }, `${negotiablePct}%`)
                          ),
                          h("td", { className: "num text-muted" }, discount ? `${Math.round(discount)}%` : "\u2014"),
                          h(
                            "td",
                            { className: "num" },
                            h("span", { className: `badge ${attractivenessTone(negotiablePct, discount)}` }, looks)
                          )
                        );
                      })
                )
              )
            )
          )
        )
      )
    );
  };

  paint();
  return root;
}