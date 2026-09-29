import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import toast from "../toast.js";
import ProductCard from "../components/product-card.js";
import EmptyState from "../components/empty-state.js";
import { SkeletonCard } from "../components/loading.js";
import { formatINR } from "../utils/format.js";
import compareStore from "../store/compare.js";

/**
 * Wishlist.
 *
 * Ported from the React build's Wishlist.jsx. Loads the wishlist and the
 * price-watch table together, renders the saved grid with badge overlays
 * (price-drop / save-percentage) and the floating action stack, and owns the
 * four mutations those buttons perform:
 *   - POST /cart
 *   - POST|DELETE /price-watch (target = 90% of list price)
 *   - DELETE /wishlist/:id (fetches the row first, then deletes by its real id)
 * Compare toggling goes through the shared compareStore, which talks to the
 * `/compare` toggle endpoint exactly like useCompare did.
 *
 * Per-card buttons carry their handlers as element props (the ProductDetail
 * pattern). Every card is rebuilt on repaint, so the handlers die with the
 * elements and cannot leak or double-fire.
 */

export default function Wishlist() {
  const st = { products: [], watches: {}, loading: true };

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

  // ---------- persistent header regions ----------
  const countHost = h("span", { className: "badge badge-primary" });
  const totalHost = h("p", { className: "text-lg font-extrabold text-ink-900 tabular" });
  const compareCountHost = h("span", null, compareStore.getState().ids.size);
  const compareLink = h(
    "a",
    { href: "/compare", className: "btn-secondary" },
    icon("Scale", { size: 16 }),
    " Compare (",
    compareCountHost,
    ")"
  );
  const valueWrap = h(
    "div",
    { className: "text-right hidden sm:block" },
    h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, "Total value"),
    totalHost
  );

  const bodyHost = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8" });

  const paintHeader = () => {
    countHost.textContent = st.products.length;
    totalHost.textContent = formatINR(st.products.reduce((sum, p) => sum + (p.price || 0), 0));
    compareCountHost.textContent = compareStore.getState().ids.size;
    const has = st.products.length > 0;
    compareLink.style.display = has ? "" : "none";
    valueWrap.style.display = has ? "" : "none";
  };

  const load = async () => {
    try {
      const [wRes, pwRes] = await Promise.all([
        api.get("/wishlist"),
        api.get("/price-watch").catch(() => null),
      ]);
      if (!ensureAlive()) return;
      st.products = wRes.data.products || [];
      const watchMap = {};
      (pwRes?.data?.watches || []).forEach((w) => {
        watchMap[String(w.product?._id)] = w;
      });
      st.watches = watchMap;
    } catch {
      if (!ensureAlive()) return;
    }
    st.loading = false;
    if (ensureAlive()) repaint();
  };

  const toggleWatch = async (pid, price) => {
    const existing = st.watches[String(pid)];
    try {
      if (existing) {
        await api.delete(`/price-watch/${existing.watchId}`);
        const n = { ...st.watches };
        delete n[String(pid)];
        st.watches = n;
        toast.success("Price watch removed");
        repaint();
      } else {
        await api.post("/price-watch", { productId: pid, targetPrice: Math.round(price * 0.9) });
        toast.success("We'll alert you on price drops");
        await load();
      }
    } catch {
      // React's toggleWatch swallows the failure silently.
    }
  };

  const remove = async (pid) => {
    try {
      const wl = await api.get("/wishlist").catch(() => null);
      const item = (wl?.data?.products || []).find((p) => String(p._id) === String(pid));
      await api.delete(`/wishlist/${item?._id || pid}`);
      st.products = st.products.filter((p) => String(p._id) !== String(pid));
      toast.success("Removed from wishlist");
      repaint();
    } catch {
      // React's remove has no catch on the delete; keep failure silent to match.
    }
  };

  const addToCart = async (pid) => {
    try {
      await api.post("/cart", { productId: pid });
      toast.success("Added to cart");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to add");
    }
  };

  const toggleCompare = (pid) => {
    compareStore.toggle(pid);
    compareCountHost.textContent = compareStore.getState().ids.size;
  };

  const card = (p) => {
    const watch = st.watches[String(p._id)];
    const comparing = compareStore.isComparing(p._id);
    const savedPct =
      p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;

    return h(
      "div",
      { key: String(p._id), className: "group relative" },
      watch?.priceDropped
        ? h(
            "div",
            { className: "absolute top-2.5 left-2.5 z-20" },
            h("span", { className: "badge bg-success text-white shadow-sm" }, icon("TrendingDown", { size: 11 }), " Drop · ", formatINR(p.price))
          )
        : savedPct >= 10
          ? h(
              "div",
              { className: "absolute top-2.5 left-2.5 z-20" },
              h("span", { className: "badge bg-danger text-white shadow-sm" }, `Save ${savedPct}%`)
            )
          : null,
      ProductCard({ product: p }),
      h(
        "div",
        { className: "absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5" },
        h(
          "button",
          {
            type: "button",
            onClick: () => addToCart(p._id),
            title: "Add to cart",
            "aria-label": "Add to cart",
            className:
              "w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border border-line shadow-xs text-ink-700 hover:bg-primary hover:text-white hover:border-primary transition-all",
          },
          icon("ShoppingCart", { size: 14 })
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => toggleCompare(p._id),
            title: comparing ? "Remove from compare" : "Add to compare",
            "aria-label": "Toggle compare",
            className: `w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border shadow-xs flex items-center justify-center transition-all ${
              comparing ? "text-white bg-primary border-primary" : "text-ink-700 border-line hover:bg-primary hover:text-white hover:border-primary"
            }`,
          },
          icon("ArrowLeftRight", { size: 14 })
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => toggleWatch(String(p._id), p.price),
            title: watch ? "Stop watching" : "Watch for price drops",
            "aria-label": "Toggle price watch",
            className: `w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border shadow-xs flex items-center justify-center transition-all ${
              watch ? "text-white bg-accent border-accent" : "text-ink-700 border-line hover:bg-accent hover:text-white hover:border-accent"
            }`,
          },
          icon("Bell", { size: 14, className: watch ? "fill-current" : "" })
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => remove(String(p._id)),
            title: "Remove",
            "aria-label": "Remove from wishlist",
            className:
              "w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border border-line shadow-xs text-danger hover:bg-danger hover:text-white hover:border-danger flex items-center justify-center transition-all",
          },
          icon("Trash2", { size: 14 })
        )
      ),
      watch
        ? h(
            "p",
            { className: "mt-2 text-2xs text-muted flex items-center gap-1.5 px-0.5" },
            icon("Bell", { size: 11, className: "text-accent" }),
            "Watching for ",
            formatINR(watch.targetPrice),
            " or less"
          )
        : null
    );
  };

  const bodyContent = () => {
    if (st.loading) {
      return h(
        "div",
        { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
        ...Array.from({ length: 4 }, () => SkeletonCard())
      );
    }
    if (st.products.length === 0) {
      return h(
        "div",
        { className: "panel" },
        EmptyState({
          iconName: "Heart",
          title: "Your wishlist is empty",
          description: "Tap the heart on any product to save it here — you'll spot price drops and deals fast.",
          action: h("a", { href: "/products", className: "btn-primary" }, icon("ShoppingBag", { size: 16 }), " Browse products"),
        })
      );
    }
    return h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" }, ...st.products.map(card));
  };

  const machine = h(
    "p",
    { className: "page-eyebrow" },
    icon("Heart", { size: 13 }),
    " Saved items"
  );

  const page = () =>
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
            { className: "flex flex-wrap items-end justify-between gap-4" },
            h(
              "div",
              null,
              machine,
              h("div", { className: "flex items-center gap-2.5" }, h("h1", { className: "page-title" }, "Wishlist"), countHost),
              h("p", { className: "page-sub" }, "Items you saved for later — refreshed with real-time prices.")
            ),
            h("div", { className: "flex items-center gap-2.5" }, valueWrap, compareLink)
          )
        )
      ),
      bodyHost
    );

  const repaint = () => {
    if (st.loading) return;
    paintHeader();
    mount(bodyHost, bodyContent());
  };

  // ---------- init ----------
  mount(root, page());
  load();

  return root;
}