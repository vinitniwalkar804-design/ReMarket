import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import { navigate } from "../navigation.js";
import EmptyState from "../components/empty-state.js";
import { formatINR, formatDate, conditionTone } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import { productImg } from "../utils/images.js";

/**
 * Orders (customer purchase history).
 *
 * Ported from `frontend/src/pages/Orders.jsx`: the same masthead with the order
 * count, the same single-column list of order cards, the same EmptyState, the
 * same loading skeleton, and the same two API calls - `GET /orders` on load and
 * `POST /chats` when the buyer messages a seller.
 *
 * This is the smallest page ported so far. React kept two pieces of state
 * (`orders`, `loading`), ran one effect with no dependencies, and defined one
 * callback, so there is no form state, no validation, no derived totals and no
 * status machine to reproduce.
 *
 * What React does NOT do here, and neither does this port:
 *   - no tabs, filters, search, sorting or pagination (`GET /orders` is
 *     unpaginated server-side, and adding paging would change the contract);
 *   - no order-detail page, invoice, tracking or cancel/refund/buy-again
 *     action. "Track deliveries" is subtitle copy only - the `Truck` line is a
 *     static label shown when `status === "shipped"`, and the customer cannot
 *     change any status (`PUT /orders/:id/status` is seller/admin only);
 *   - no toasts and no behaviour tracking. React imports neither, so this port
 *     imports neither. There is no ORDER_VIEW event, and an orders visit is
 *     deliberately untracked.
 *
 * Backend quirks are reproduced rather than corrected, so the two frontends
 * cannot drift apart:
 *   - `o.type === "offer"` can never be true: the Order schema's `type` enum is
 *     `["buy", "exchange"]`, so the "Bought via offer" badge is dead code. Kept
 *     verbatim because React has it.
 *   - `o.finalPrice || o.amount` - there is no `amount` field on Order, and
 *     `finalPrice` is required and always positive, so the fallback is dead too.
 *   - `productId.seller` IS populated as `{ _id, name }` here (the Cart
 *     projection does not do this), which is why the chat button renders. The
 *     seller `name` is fetched and then never displayed anywhere on the page.
 *   - `POST /orders/bulk` creates one flat Order per line item, not one per
 *     seller, so a three-item cart from two sellers lists three cards.
 *
 * Lifecycle follows the Cart/Checkout deal: the root is built once and never
 * replaced, clicks are delegated from it, and a body-level MutationObserver
 * notices the root leaving the document and tears the listener down.
 */

export default function Orders() {
  const st = {
    orders: [],
    loading: true,
  };

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

  // React: const p = o.productId;  const canReview = o.status === "delivered";
  const productOf = (o) => o.productId;
  const canReview = (o) => o.status === "delivered";

  // ---------- paint regions ----------
  // Created once, outside buildPage(), so the repaint helpers can reach them.
  // buildPage() only wires them in.

  const countHost = h("span", { className: "badge badge-primary" });
  const bodyHost = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8" });

  const paintCount = () => mount(countHost, st.orders.length);

  const paintBody = () => mount(bodyHost, bodyContent());

  const repaint = () => {
    paintCount();
    paintBody();
  };

  // ---------- views ----------

  // React's `if (loading) return <skeleton>` - an early return, so the masthead
  // is not rendered at all while the request is in flight.
  const skeleton = () =>
    h(
      "div",
      { className: "page-container" },
      h("div", { className: "h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" }),
      ...Array.from(
        { length: 5 },
        (_, i) => h("div", { key: i, className: "h-24 bg-sunken rounded-2xl animate-pulse mb-3" })
      )
    );

  const orderCard = (o) => {
    const p = productOf(o);
    return h(
      "article",
      { key: o._id, className: "card p-4 card-hover" },
      h(
        "div",
        { className: "flex flex-col sm:flex-row sm:items-center gap-4" },
        h(
          "a",
          {
            href: `/products/${p?._id}`,
            className: "w-16 h-16 rounded-xl bg-sunken overflow-hidden flex-none",
          },
          productImg(p, { className: "w-full h-full object-cover", alt: p?.title || "" })
        ),
        h(
          "div",
          { className: "flex-1 min-w-0" },
          h(
            "div",
            { className: "flex items-center flex-wrap gap-2" },
            h(
              "a",
              {
                href: `/products/${p?._id}`,
                className:
                  "font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors",
              },
              o.productTitle || p?.title
            ),
            p?.condition
              ? h("span", { className: `badge ${conditionTone(p.condition)}` }, p.condition)
              : null,
            // Dead branch: Order.type is "buy" | "exchange", never "offer".
            // Kept verbatim from the React page.
            o.type === "offer"
              ? h("span", { className: "badge bg-accent-soft text-accent border-accent/20" }, "Bought via offer")
              : null
          ),
          h(
            "div",
            { className: "flex items-center flex-wrap gap-x-3 gap-y-1 text-2xs text-muted mt-1.5" },
            h(
              "span",
              { className: "font-mono" },
              "Order ",
              String(o._id).slice(-6).toUpperCase()
            ),
            h("span", null, "· ", formatDate(o.createdAt)),
            o.shippingAddress?.city
              ? h("span", null, "· ", o.shippingAddress.city)
              : null
          ),
          o.purchaseReason
            ? h("p", { className: "text-2xs text-muted-soft mt-1" }, "Reason: ", o.purchaseReason)
            : null
        ),
        h(
          "div",
          { className: "flex items-center gap-3 sm:flex-col sm:items-end gap-y-1.5 flex-none" },
          h("span", { className: "font-extrabold text-ink-900 tabular" }, formatINR(o.finalPrice || o.amount)),
          h(
            "span",
            { className: `badge ${orderTone(o.status)} capitalize` },
            o.status
          )
        )
      ),
      h(
        "div",
        { className: "mt-3.5 pt-3.5 border-t border-line flex items-center gap-2 flex-wrap" },
        o.status === "shipped"
          ? h(
              "span",
              { className: "text-2xs inline-flex items-center gap-1.5 font-bold text-accent" },
              icon("Truck", { size: 13 }),
              " On its way to you"
            )
          : null,
        canReview(o)
          ? h(
              "a",
              { href: `/products/${p?._id}?review=1`, className: "btn-accent btn-sm" },
              icon("Star", { size: 13 }),
              " Review this product"
            )
          : null,
        p?.seller?._id
          ? h(
              "button",
              {
                type: "button",
                // data-order-id is what the delegated handler keys off. The
                // button is rebuilt on every repaint, so it must never own its
                // own listener.
                dataset: { orderId: String(o._id) },
                className: "btn-secondary btn-sm",
              },
              icon("MessageCircle", { size: 13 }),
              " Chat with seller"
            )
          : null,
        h(
          "a",
          { href: `/products/${p?._id}`, className: "link-more ml-auto" },
          "View product ",
          icon("ArrowRight", { size: 12 })
        )
      )
    );
  };

  const bodyContent = () => {
    if (st.orders.length === 0) {
      return h(
        "div",
        { className: "panel" },
        EmptyState({
          iconName: "Package",
          title: "No orders yet",
          description:
            "Once you purchase something, you'll find the whole trail here — order, tracking and returns.",
          action: h("a", { href: "/products", className: "btn-primary" }, "Start shopping"),
        })
      );
    }
    return h("div", { className: "space-y-3" }, ...st.orders.map(orderCard));
  };

  const buildPage = () =>
    h(
      "div",
      { className: "animate-fade-in" },
      h(
        "header",
        { className: "page-masthead" },
        h(
          "div",
          { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8" },
          h(
            "p",
            { className: "page-eyebrow" },
            icon("Package", { size: 13 }),
            " Purchase history"
          ),
          h(
            "div",
            { className: "flex items-center gap-2.5" },
            h("h1", { className: "page-title" }, "My Orders"),
            countHost
          ),
          h("p", { className: "page-sub" }, "Track deliveries and re-connect with sellers.")
        )
      ),
      bodyHost
    );

  // ---------- data ----------

  const showEmpty = () => {
    st.orders = [];
    mount(root, buildPage());
    repaint();
  };

  const load = () =>
    api
      .get("/orders")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.orders = data.orders || [];
        st.loading = false;
        mount(root, buildPage());
        repaint();
      })
      .catch(() => {
        // React's `.catch(() => setLoading(false))` swallows the error and falls
        // through to the empty view. No toast, no error banner, no retry.
        if (!ensureAlive()) return;
        st.loading = false;
        showEmpty();
      });

  const chatSeller = async (o) => {
    try {
      const { data } = await api.post("/chats", {
        otherUserId: o.productId?.seller?._id || o.sellerId,
        productId: o.productId?._id,
        text: "Hi! Following up on my order.",
      });
      // Messages is not migrated yet, so `/messages/:id` is still a commented-out
      // route and the router will render its not-found (an empty div) until that
      // phase lands. React did a full-page `window.open(..., "_self")` here; the
      // SPA-native `navigate` is the equivalent for this build. The POST above
      // has already had its real side effect (find-or-create the chat, append the
      // message, record CHAT_STARTED) either way.
      navigate("/messages/" + data.chatId);
    } catch {
      // React's chatSeller has a bare `catch {}` - a failure says nothing.
      // Kept identical on purpose.
    }
  };

  // ---------- delegated handlers, bound once ----------

  const onRootClick = (event) => {
    const chatBtn = event.target.closest?.("[data-order-id]");
    if (!chatBtn) return;
    event.preventDefault();
    const order = st.orders.find((x) => String(x._id) === chatBtn.dataset.orderId);
    if (order) chatSeller(order);
  };

  root.addEventListener("click", onRootClick);
  cleanups.push(() => root.removeEventListener("click", onRootClick));

  mount(root, skeleton());
  load();

  return root;
}
