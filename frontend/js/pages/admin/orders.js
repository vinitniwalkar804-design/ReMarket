import { h, mount } from "../../dom.js";
import { icon } from "../../icons.js";
import api from "../../services/api.js";
import Modal from "../../components/modal.js";
import toast from "../../toast.js";
import { SkeletonRow } from "../../components/loading.js";
import { formatINR, timeAgo } from "../../utils/format.js";
import { orderTone } from "../../utils/theme.js";

/**
 * Admin console — Orders.
 *
 * Ported from the React build's `pages/admin/AdminOrders.jsx`. One GET on
 * load, four derived stat cards and a single table. React kept three pieces of
 * state (`orders`, `total`, `loading`) and ran one effect with an empty
 * dependency array. Here the same three live in `st`, the request is fired
 * exactly once at the bottom of the factory, and the repaint is driven by
 * `paintStats()` + `paintBody()`.
 *
 * The three view states React branched on are all a `div.panel`, so the body
 * host is that panel and only its className and children are swapped - the DOM
 * is identical to the JSX version's in all three states, with no wrapper
 * element and no `space-y-5` child introduced between the panel and the root.
 *
 * Failure behaviour on the initial load is React's: `.catch(() => setLoading(false))`
 * swallows the error and falls through to the empty state, so a failed request
 * renders "No orders yet" rather than an error banner. No toast, no retry.
 *
 * ---- Order status management (added after the port) ----
 *
 * The backend has always had a working order state machine at
 * `PUT /api/orders/:id/status` (`backend/controllers/orderController.js`,
 * `updateOrderStatus`). Nothing in the app ever called it, so a real checkout
 * sat at `pending` forever. This page is now the only caller.
 *
 * The server remains the source of truth. `allowedTransitions` below is a
 * verbatim mirror of the map the controller enforces - same targets, same
 * terminal states - used only to decide which buttons to *offer*. Every button
 * is still validated server-side, including the compare-and-swap on the current
 * status, so a stale row that lost a race returns 409 and is reported verbatim
 * rather than optimistically smoothed over. The controller takes no reason field
 * and none is sent.
 *
 * Deliberately not added here: pagination (the endpoint's `page`/`limit` are
 * untouched, so the page still shows the first 20 exactly as before), seller
 * order management, and any automatic/timed transition.
 *
 * Lifecycle follows the Orders/Notifications pattern: one persistent root, a
 * body-level MutationObserver teardown, and `ensureAlive()` guarding every
 * async continuation before it touches the DOM.
 */

/**
 * The order lifecycle, mirroring `allowedTransitions` in the order controller.
 * Each entry lists the statuses reachable in one step from the key, rendered as
 * one button each. `destructive` marks the two targets that hand the listing
 * back to the catalogue and notify the buyer.
 */
const ORDER_TRANSITIONS = {
  pending: [
    { to: "confirmed", label: "Confirm", icon: "CheckCircle2", destructive: false },
    { to: "cancelled", label: "Cancel order", icon: "X", destructive: true },
  ],
  confirmed: [
    { to: "shipped", label: "Mark shipped", icon: "Truck", destructive: false },
    { to: "cancelled", label: "Cancel order", icon: "X", destructive: true },
  ],
  shipped: [
    { to: "delivered", label: "Mark delivered", icon: "PackageCheck", destructive: false },
    { to: "cancelled", label: "Cancel order", icon: "X", destructive: true },
  ],
  delivered: [{ to: "returned", label: "Process return", icon: "RotateCcw", destructive: true }],
  returned: [],
  cancelled: [],
};

/** What each transition does to the listing, shown in the confirmation dialog. */
const TRANSITION_EFFECT = {
  confirmed: "Marks the order as confirmed and lets the seller begin dispatch.",
  shipped: "Marks the order as shipped. The buyer sees an \"on its way\" notice on their orders page.",
  delivered: "Marks the order as delivered. The buyer can now review the product.",
  cancelled: "Cancels the order, puts the listing back on sale and notifies the buyer.",
  returned: "Records the return, puts the listing back on sale and notifies the buyer.",
};

export default function AdminOrders() {
  const st = { orders: [], total: 0, loading: true, action: null, busy: false, error: "" };

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
  /** Holds the single status-confirmation dialog. */
  const modalHost = h("div");

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

  /** The valid next steps for one order; empty for terminal statuses. */
  const actionsFor = (o) => ORDER_TRANSITIONS[o.status] || [];

  /**
   * The row's only interactive cell. Buttons are the affordance the rest of the
   * admin console already uses (see `admin/listings.js`), so a destructive step
   * is a `btn-danger` next to a neutral one rather than a hidden select.
   */
  const actionsCell = (o) => {
    const next = actionsFor(o);
    if (!next.length) {
      return h("td", { className: "text-right" }, h("span", { className: "text-2xs text-muted-soft" }, "—"));
    }
    return h(
      "td",
      null,
      h(
        "div",
        { className: "flex items-center justify-end gap-1.5" },
        next.map((t) =>
          h(
            "button",
            {
              type: "button",
              key: t.to,
              className: `${t.destructive ? "btn-danger" : "btn-secondary"} btn-xs`,
              disabled: st.busy,
              title: TRANSITION_EFFECT[t.to],
              onClick: () => openAction(o, t),
            },
            icon(t.icon, { size: 12 }),
            " ",
            t.label
          )
        )
      )
    );
  };

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
      h("td", null, h("span", { className: `badge capitalize ${orderTone(o.status)}` }, o.status)),
      actionsCell(o)
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
            h("th", null, "Status"),
            h("th", { className: "text-right" }, "Actions")
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
      bodyHost,
      modalHost
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

  // ---------- order status ----------

  const closeAction = () => {
    st.action = null;
    st.busy = false;
    st.error = "";
    mount(modalHost);
    repaint();
  };

  /**
   * One dialog for every transition. The destructive two get the warning banner
   * because they hand the listing back to the catalogue and notify the buyer -
   * the admin should see that before confirming, not after.
   */
  const paintActionModal = () => {
    const a = st.action;
    if (!a) {
      mount(modalHost);
      return;
    }
    mount(
      modalHost,
      Modal({
        open: true,
        onClose: () => {
          if (!st.busy) closeAction();
        },
        title: `${a.label}?`,
        subtitle: `${a.order.productTitle || a.order.productId?.title || "Order"} — currently ${a.order.status}.`,
        footer: h(
          "div",
          { className: "flex items-center justify-end gap-2.5" },
          h("button", { type: "button", className: "btn-quiet", disabled: st.busy, onClick: closeAction }, "Cancel"),
          h(
            "button",
            {
              type: "button",
              className: a.destructive ? "btn-danger" : "btn-primary",
              disabled: st.busy,
              onClick: submitAction,
            },
            st.busy ? "Working…" : a.label
          )
        ),
        children: h(
          "div",
          { className: "space-y-3" },
          h("p", { className: "text-sm text-muted leading-relaxed" }, TRANSITION_EFFECT[a.to]),
          a.destructive
            ? h(
                "div",
                { className: "flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3" },
                icon("AlertTriangle", { size: 15, className: "text-danger flex-none mt-0.5" }),
                h(
                  "p",
                  { className: "text-xs text-ink-800 leading-relaxed" },
                  "The listing goes back on sale and the buyer is notified. This cannot be undone from here."
                )
              )
            : null,
          st.error
            ? h(
                "div",
                { className: "flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3" },
                icon("AlertTriangle", { size: 15, className: "text-danger flex-none mt-0.5" }),
                h("p", { className: "text-xs text-ink-800 leading-relaxed" }, st.error)
              )
            : null
        ),
      })
    );
  };

  const openAction = (order, t) => {
    if (st.busy) return;
    st.action = { order, ...t };
    st.error = "";
    paintActionModal();
  };

  /**
   * `PUT /orders/:id/status` - the endpoint the backend has always exposed. The
   * response carries the saved order, so the row is updated from the server's
   * own value before the list is re-read; a failed reload then cannot leave the
   * table showing a status the server rejected. A failure leaves the dialog open
   * with the server's message and changes nothing.
   */
  const submitAction = () => {
    const a = st.action;
    if (!a || st.busy) return;
    st.busy = true;
    st.error = "";
    // Both regions repaint: the dialog swaps to its working state, and the table
    // greys out every row button so the whole page reads as busy, not just the
    // dialog. `openAction` also bails while `st.busy`, so a double click is a
    // no-op rather than a second PUT.
    paintActionModal();
    repaint();
    api
      .put(`/orders/${a.order._id}/status`, { status: a.to })
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.busy = false;
        const saved = data?.order;
        if (saved?.status) {
          const row = st.orders.find((o) => String(o._id) === String(a.order._id));
          if (row) row.status = saved.status;
        }
        closeAction();
        toast.success(`Order ${a.to}`);
        load();
      })
      .catch((err) => {
        if (!ensureAlive()) return;
        st.busy = false;
        st.error = err?.response?.data?.message || err?.message || "The order status could not be updated.";
        paintActionModal();
        toast.error(st.error, { duration: 4000 });
      });
  };

  mount(root, buildPage());
  repaint();
  load();

  return root;
}
