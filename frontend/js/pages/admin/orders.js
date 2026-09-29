import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import { SkeletonRow } from "../../components/loading.js";
import { formatINR, timeAgo } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";

/**
 * Admin console — Orders.
 *
 * Ported from the React build's `pages/admin/AdminOrders.jsx`. One GET on
 * load, four derived stat cards and a single read-only table. There is no
 * mutation on this page: no row action, no status change, no bulk operation,
 * so the whole thing is read-once/render-once and the only state transitions
 * are `loading: true -> false` on either resolution branch.
 *
 * React kept three pieces of state (`orders`, `total`, `loading`) and ran one
 * effect with an empty dependency array. Here the same three live in `st`, the
 * request is fired exactly once at the bottom of the factory, and the repaint
 * is driven by `paintStats()` + `paintBody()`.
 *
 * The three view states React branched on are all a `div.panel`, so the body
 * host is that panel and only its className and children are swapped - the DOM
 * is identical to the JSX version's in all three states, with no wrapper
 * element and no `space-y-5` child introduced between the panel and the root.
 *
 * Failure behaviour is React's: `.catch(() => setLoading(false))` swallows the
 * error and falls through to the empty state, so a failed request renders "No
 * orders yet" rather than an error banner. No toast, no retry.
 *
 * Lifecycle is the Orders/Notifications pattern: one persistent root, a
 * body-level MutationObserver teardown, and `ensureAlive()` guarding every
 * async continuation before it touches the DOM.
 */

export default function AdminOrders() {
  const st = { orders: [], total: 0, loading: true };

  // ---------- teardown ----------

  let disposed = false;
  const cleanups = [];

  const root = h("div", null);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---------- derived values (React's per-render computations) ----------

  const gmv = () => st.orders.reduce((s, o) => s + (Number(o.finalPrice) || 0), 0);

  const avgDecision = () =>
    st.orders.length
      ? Math.round(
          st.orders.reduce((s, o) => s + (Number(o.decisionTimeMinutes) || 0), 0) / st.orders.length
        )
      : 0;

  // React's `stats` array literal, re-evaluated on every repaint. The "—"
  // fallbacks are per-stat, not global: GMV hides a real zero and Avg decision
  // hides a real 0, while Total orders and On this page show their numbers.
  const stats = () => {
    const g = gmv();
    const avg = avgDecision();
    return [
      { icon: "Receipt", label: "Total orders", value: st.loading ? "—" : st.total },
      { icon: "Wallet", label: "Listed GMV", value: st.loading || !g ? "—" : formatINR(g) },
      { icon: "Timer", label: "Avg decision", value: st.loading ? "—" : avg ? `${avg} min` : "—" },
      { icon: "Users", label: "On this page", value: st.loading ? "—" : st.orders.length },
    ];
  };

  // ---------- paint regions ----------

  const statsHost = h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" });
  const bodyHost = h("div", { className: "panel p-5 space-y-3" });

  const statCard = (s) =>
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
    );

  const paintStats = () => mount(statsHost, ...stats().map(statCard));

  const orderRow = (o) =>
    h(
      "tr",
      { key: o._id },
      h("td", { className: "font-semibold text-ink-900 line-clamp-1 max-w-[260px]" }, o.productTitle || o.productId?.title),
      h("td", { className: "text-muted" }, o.buyerId?.name || "—"),
      h("td", { className: "text-muted" }, o.sellerId?.name || "—"),
      h("td", { className: "num" }, formatINR(o.finalPrice)),
      h("td", { className: "num text-muted" }, o.decisionTimeMinutes ? `${o.decisionTimeMinutes} min` : "—"),
      h("td", { className: "text-muted whitespace-nowrap" }, timeAgo(o.createdAt)),
      h("td", null, h("span", { className: `badge capitalize ${orderTone(o.status)}` }, o.status))
    );

  const table = () =>
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
            h("th", null, "Product"),
            h("th", null, "Buyer"),
            h("th", null, "Seller"),
            h("th", { className: "th-num" }, "Amount"),
            h("th", { className: "th-num" }, "Decision"),
            h("th", null, "Placed"),
            h("th", null, "Status")
          )
        ),
        h("tbody", null, ...st.orders.map(orderRow))
      )
    );

  // All three branches are the same `div.panel` host with different classes.
  const paintBody = () => {
    if (st.loading) {
      // SkeletonRow() builds its own element, so there is nowhere to pass React's
      // `key` through - `h()` ignores it anyway, being a React-only identity hint.
      bodyHost.className = "panel p-5 space-y-3";
      mount(bodyHost, ...Array.from({ length: 6 }, () => SkeletonRow()));
      return;
    }
    if (st.orders.length === 0) {
      bodyHost.className = "panel p-12 text-center";
      mount(
        bodyHost,
        h("span", { className: "icon-tile-primary mx-auto mb-4" }, icon("ShoppingCart", { size: 20 })),
        h("h3", { className: "font-extrabold text-ink-900" }, "No orders yet"),
        h(
          "p",
          { className: "text-sm text-muted mt-1" },
          "Completed purchases will appear here as buyers check out."
        )
      );
      return;
    }
    bodyHost.className = "panel";
    mount(bodyHost, table());
  };

  const repaint = () => {
    paintStats();
    paintBody();
  };

  // ---------- views ----------

  // The header is static — none of the three state changes touch it — so it is
  // built once and the two hosts below it are the only things repainted.
  const buildPage = () =>
    h(
      "div",
      { className: "animate-fade-in space-y-5" },
      h(
        "header",
        null,
        h("span", { className: "page-eyebrow" }, icon("ShoppingCart", { size: 12 }), " Transactions"),
        h("h1", { className: "page-title" }, "Orders"),
        h("p", { className: "page-sub" }, "Every completed purchase, newest first.")
      ),
      statsHost,
      bodyHost
    );

  // ---------- data ----------

  const load = () =>
    api
      .get("/admin/orders")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.orders = data.orders || [];
        st.total = data.total || 0;
        st.loading = false;
        repaint();
      })
      .catch(() => {
        if (!ensureAlive()) return;
        st.loading = false;
        repaint();
      });

  mount(root, buildPage());
  repaint();
  load();

  return root;
}
