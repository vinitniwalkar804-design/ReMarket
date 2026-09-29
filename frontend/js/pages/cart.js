import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import toast from "../toast.js";
import { navigate } from "../navigation.js";
import EmptyState from "../components/empty-state.js";
import { formatINR, conditionTone, initials } from "../utils/format.js";
import { productImg } from "../utils/images.js";
import behavior from "../utils/behavior.js";

/**
 * Cart.
 *
 * Ported from `frontend/src/pages/Cart.jsx`: the same masthead with the item
 * count and the savings badge, the same seller-grouped item list, the same
 * sticky order summary, the same empty state, and the same two API calls -
 * `GET /cart` on load and `DELETE /cart/:id` on remove.
 *
 * There is deliberately NO quantity control. The application model has no
 * quantity: one `Cart` document is one product, quantity is implicitly 1, the
 * `{userId, item.productId}` index makes duplicates impossible, and
 * `createOrders` hardcodes `quantity: 1`. A +/- control here would invent a
 * feature the API, the schema and the React page do not have.
 *
 * The router has no unmount hook, so the teardown deal from Profile/Sell
 * applies: a body-level observer notices this page's root leaving the document
 * and stops the in-flight fetches from painting over the next page.
 *
 * Two behaviours are deliberately NOT byte-identical to React; both are called
 * out in the phase report:
 *
 *   1. `remove()` guards against a second in-flight request. React fires
 *      `DELETE` on every click and swallows the loser of the race, so a
 *      double-click sends two requests. Here the second click is a no-op.
 *   2. Clicks are delegated from the page root, which is built once and never
 *      replaced. Binding a listener per repainted row is exactly what makes a
 *      vanilla port double-fire its handlers.
 *
 * Seller grouping is presentational only - `POST /orders/bulk` creates one
 * Order per item, never one per seller. The grouping key is copied verbatim
 * from the React page, including its `"unknown"` fallback.
 */

export default function Cart() {
  const st = {
    items: [],
    count: 0,
    // cartIds with a DELETE in flight, so a double-click cannot fire twice.
    removing: new Set(),
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

  const priceOf = (item) => item.product?.price || 0;

  const total = () => st.items.reduce((s, i) => s + priceOf(i), 0);

  const savings = () =>
    st.items.reduce(
      (s, i) => s + Math.max(0, (i.product?.originalPrice || 0) - priceOf(i)),
      0
    );

  const sellerCount = () =>
    new Set(st.items.map((i) => i.product?.seller?._id).filter(Boolean)).size;

  // React: items.reduce((groups, item) => { const sid = item.product?.seller?._id || "unknown"; ... })
  const groups = () => {
    const out = {};
    for (const item of st.items) {
      const sid = item.product?.seller?._id || "unknown";
      if (!out[sid]) out[sid] = { seller: item.product?.seller || null, items: [] };
      out[sid].items.push(item);
    }
    return Object.values(out);
  };

  // ---------- paint regions ----------
  // Created once, outside buildPage(), so the repaint helpers and the
  // delegated click handler can reach them. buildPage() only wires them in.

  const badgeHost = h("span", { className: "badge badge-primary" });
  const extrasHost = h("span", { className: "contents" });
  const bodyHost = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8" });

  const paintBadge = () => mount(badgeHost, st.count);

  const paintExtras = () => {
    const save = savings();
    mount(
      extrasHost,
      st.items.length > 0 && save > 0
        ? h(
            "span",
            { className: "badge bg-success-soft text-success border-success/20" },
            icon("ShieldCheck", { size: 12 }),
            ` You're saving ${formatINR(save)} vs original`
          )
        : null
    );
  };

  const paintBody = () => mount(bodyHost, bodyContent());

  const repaint = () => {
    paintBadge();
    paintExtras();
    paintBody();
  };

  // ---------- views ----------

  const skeleton = () =>
    h(
      "div",
      { className: "page-container" },
      h("div", { className: "h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" }),
      h(
        "div",
        { className: "grid lg:grid-cols-3 gap-6" },
        h(
          "div",
          { className: "lg:col-span-2 space-y-3" },
          ...Array.from(
            { length: 3 },
            (_, i) => h("div", { key: i, className: "h-24 bg-sunken rounded-2xl animate-pulse" })
          )
        ),
        h("div", { className: "h-64 bg-sunken rounded-2xl animate-pulse" })
      )
    );

  const itemRow = (item) => {
    const p = item.product;
    return h(
      "div",
      { className: "flex items-center gap-4 p-4" },
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
          "a",
          {
            href: `/products/${p?._id}`,
            className:
              "font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors",
          },
          p?.title
        ),
        h(
          "div",
          { className: "flex items-center flex-wrap gap-2 mt-1.5" },
          h("span", { className: `badge ${conditionTone(p?.condition)}` }, p?.condition || "—"),
          p?.negotiable
            ? h(
                "span",
                { className: "badge bg-accent-soft text-accent border-accent/20" },
                icon("Tag", { size: 10 }),
                " Negotiable"
              )
            : null
        ),
        h(
          "div",
          { className: "flex items-baseline gap-2 mt-1.5" },
          h("span", { className: "font-extrabold text-ink-900" }, formatINR(priceOf(item))),
          p?.originalPrice > p?.price
            ? h(
                "span",
                { className: "text-xs text-muted-soft line-through" },
                formatINR(p.originalPrice)
              )
            : null
        )
      ),
      // data-cart-id is what the delegated handler keys off. The button is
      // rebuilt on every repaint, so it must never own its own listener.
      h(
        "button",
        {
          type: "button",
          dataset: { cartId: String(item.cartId) },
          disabled: st.removing.has(item.cartId),
          className:
            "btn-ghost p-2 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-all flex-none",
          title: "Remove",
          "aria-label": `Remove ${p?.title} from cart`,
        },
        icon("Trash2", { size: 16 })
      )
    );
  };

  const sellerGroup = (group) => {
    const seller = group.seller;
    const groupTotal = group.items.reduce((s, i) => s + priceOf(i), 0);
    return h(
      "section",
      { className: "card overflow-hidden" },
      h(
        "header",
        { className: "flex items-center gap-3 px-5 py-3.5 bg-raised border-b border-line" },
        h(
          "span",
          {
            className: `w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold text-white flex-none ${
              seller?.isVerifiedSeller ? "bg-primary" : "bg-ink-700"
            }`,
          },
          initials(seller?.name || "Store")
        ),
        h(
          "div",
          { className: "min-w-0 flex-1" },
          h(
            "div",
            { className: "flex items-center gap-1.5" },
            icon("Store", { size: 13, className: "text-muted flex-none" }),
            h(
              "a",
              {
                href: seller?._id ? `/products?seller=${seller._id}` : "/products",
                className:
                  "text-sm font-bold text-ink-900 hover:text-primary line-clamp-1 transition-colors",
              },
              seller?.name || "Marketplace seller"
            ),
            seller?.isVerifiedSeller
              ? h(
                  "span",
                  { className: "badge bg-primary-soft text-primary border-brand-200" },
                  icon("ShieldCheck", { size: 10 }),
                  " Verified"
                )
              : null
          ),
          h(
            "p",
            { className: "text-2xs text-muted mt-0.5" },
            `${group.items.length} item${group.items.length === 1 ? "" : "s"} · ${formatINR(
              groupTotal
            )}`
          )
        )
      ),
      h("div", { className: "divide-y divide-line" }, ...group.items.map(itemRow))
    );
  };

  const summary = () => {
    const t = total();
    const save = savings();
    const sellers = sellerCount();
    return h(
      "aside",
      { className: "panel p-6 sticky top-24" },
      h("h2", { className: "text-base font-extrabold text-ink-900 mb-4" }, "Order summary"),
      h(
        "div",
        { className: "space-y-2.5 text-sm" },
        h(
          "div",
          { className: "flex justify-between text-ink-600" },
          h("span", null, `Subtotal (${st.count} ${st.count === 1 ? "item" : "items"})`),
          h("span", { className: "font-bold text-ink-900 tabular" }, formatINR(t))
        ),
        h(
          "div",
          { className: "flex justify-between text-ink-600" },
          h("span", null, "You save"),
          h(
            "span",
            { className: "font-bold text-success tabular" },
            save > 0 ? `−${formatINR(save)}` : "—"
          )
        ),
        h(
          "div",
          { className: "flex justify-between text-ink-600" },
          h("span", null, "Platform fee"),
          h("span", { className: "font-bold text-success" }, "Free")
        ),
        sellers > 0
          ? h(
              "div",
              { className: "flex justify-between text-ink-600" },
              h("span", null, "Sellers"),
              h("span", { className: "font-bold text-ink-900" }, sellers)
            )
          : null
      ),
      h(
        "div",
        { className: "border-t border-line pt-3.5 mt-3.5 mb-5" },
        h(
          "div",
          { className: "flex justify-between items-baseline" },
          h("span", { className: "font-bold text-ink-900" }, "Total"),
          h("span", { className: "font-extrabold text-2xl text-ink-900 tabular" }, formatINR(t))
        )
      ),
      h(
        "button",
        { type: "button", dataset: { checkout: "true" }, className: "btn-primary w-full" },
        "Proceed to checkout ",
        icon("ArrowRight", { size: 16 })
      ),
      h(
        "p",
        { className: "flex items-start gap-1.5 text-2xs text-muted mt-3.5" },
        icon("Sparkles", { size: 12, className: "flex-none mt-px text-accent" }),
        "Secure checkout · money-back guarantee on damaged items"
      )
    );
  };

  const bodyContent = () => {
    if (st.items.length === 0) {
      return h(
        "div",
        { className: "panel" },
        EmptyState({
          iconName: "ShoppingBag",
          title: "Your cart is empty",
          description: "Add items you'd like to buy — cart prices stay locked till checkout.",
          action: h("a", { href: "/products", className: "btn-primary" }, "Browse products"),
        })
      );
    }
    return h(
      "div",
      { className: "grid lg:grid-cols-3 gap-6 items-start" },
      h("div", { className: "lg:col-span-2 space-y-5" }, ...groups().map(sellerGroup)),
      summary()
    );
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
            "div",
            { className: "flex flex-wrap items-end justify-between gap-3" },
            h(
              "div",
              null,
              h(
                "p",
                { className: "page-eyebrow" },
                icon("ShoppingBag", { size: 13 }),
                " Your selection"
              ),
              h(
                "div",
                { className: "flex items-center gap-2.5" },
                h("h1", { className: "page-title" }, "Cart"),
                badgeHost
              ),
              h(
                "p",
                { className: "page-sub" },
                "Review your selection before checkout — prices are live."
              )
            ),
            extrasHost
          )
        )
      ),
      bodyHost
    );

  // ---------- data ----------

  const showEmpty = () => {
    st.items = [];
    st.count = 0;
    mount(root, buildPage());
    repaint();
  };

  const load = () =>
    api
      .get("/cart")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.items = data.products;
        st.count = data.count;
        mount(root, buildPage());
        repaint();
      })
      .catch(() => {
        // React swallows this too (`catch {}`) and falls through to the empty
        // view; the page must not get stuck on the skeleton either way.
        if (!ensureAlive()) return;
        showEmpty();
      });

  const remove = async (cartId) => {
    if (st.removing.has(cartId)) return;
    st.removing.add(cartId);
    paintBody();
    try {
      await api.delete(`/cart/${cartId}`);
      st.items = st.items.filter((i) => i.cartId !== cartId);
      st.count = Math.max(0, st.count - 1);
      toast.success("Removed from cart");
    } catch {
      // React's remove() has a bare `catch {}`: a failure leaves the row in
      // place and says nothing. Kept identical on purpose.
    }
    st.removing.delete(cartId);
    if (!ensureAlive()) return;
    repaint();
  };

  const goCheckout = () => {
    behavior.checkoutStart("cart", total());
    navigate("/checkout");
  };

  // ---------- delegated handlers, bound once ----------

  const onRootClick = (event) => {
    const removeBtn = event.target.closest?.("[data-cart-id]");
    if (removeBtn) {
      event.preventDefault();
      remove(removeBtn.dataset.cartId);
      return;
    }
    if (event.target.closest?.("[data-checkout]")) {
      event.preventDefault();
      goCheckout();
    }
  };

  root.addEventListener("click", onRootClick);
  cleanups.push(() => root.removeEventListener("click", onRootClick));
  cleanups.push(() => st.removing.clear());

  mount(root, skeleton());
  load();
  behavior.cartView();

  return root;
}
