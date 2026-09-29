import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import ProductCard from "../components/product-card.js";
import { SkeletonCard } from "../components/loading.js";
import { seriesColor } from "../utils/theme.js";
import compareStore from "../store/compare.js";
import auth from "../store/auth.js";

const CATEGORY_ICONS = {
  Laptops: "Laptop",
  Smartphones: "Smartphone",
  Books: "BookOpen",
  Calculators: "Calculator",
  Cycles: "Bike",
  Furniture: "Armchair",
  Electronics: "Zap",
  Gaming: "Gamepad2",
  Accessories: "Package",
};

const CATEGORY_BLURBS = {
  Laptops: "Pre-loved laptops and MacBooks from final-semester students.",
  Smartphones: "Phones with honest condition reports and verified sellers.",
  Books: "Textbooks, novels and notes at a fraction of retail.",
  Calculators: "Scientific & graphing calculators that still crunch everything.",
  Cycles: "Campus commuters to weekend cruisers, recently serviced.",
  Furniture: "Desks, chairs and storage that move out with the batch.",
  Electronics: "Peripherals, audio and gadgets with negotiable prices.",
  Gaming: "Consoles, controllers and rigs for the campus squad.",
  Accessories: "Chargers, bags, stands and everyday college gear.",
};

/**
 * Categories.
 *
 * Ported from the React build's Categories.jsx. Loads the category list plus
 * the wishlist (for per-card heart state), then fetches the four most popular
 * listings per category via allSettled. Renders the tinted category grid
 * (inline brand tint bars and icon chips through seriesColor, with the
 * categoryView behavior beacon on click) and preview rows whose cards get
 * the wishlist / compare toggle props.
 *
 * The wishlist heartbeat reads the same endpoint the React version reads, and
 * writes to the same /wishlist routes. Compare toggling goes through the
 * compareStore shared by every page.
 */

export default function Categories() {
  const st = { categories: [], previews: {}, loading: true, wishlistIds: new Set() };

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

  const bodyHost = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10" });

  const toggleWishlist = async (productId) => {
    const present = st.wishlistIds.has(String(productId));
    try {
      if (present) {
        const wishlist = await api.get("/wishlist").catch(() => null);
        const items = wishlist?.data?.wishlist || wishlist?.data?.products || [];
        const item = items.find((w) => String(w.product?._id || w.productId || w._id) === String(productId));
        if (item) await api.delete(`/wishlist/${item._id}`);
        const s = new Set(st.wishlistIds);
        s.delete(String(productId));
        st.wishlistIds = s;
      } else {
        await api.post("/wishlist", { productId });
        st.wishlistIds = new Set(st.wishlistIds).add(String(productId));
      }
      repaint();
    } catch {
      // React's toggleWishlist swallows the failure silently.
    }
  };

  const categoryCard = (cat, ci) => {
    const tint = seriesColor(ci);
    return h(
      "a",
      {
        href: `/products?category=${cat._id}`,
        onClick: () => behavior.categoryView(cat.name),
        className: "card card-hover group relative overflow-hidden p-5",
      },
      h("span", {
        className: "absolute inset-x-0 top-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        style: { backgroundColor: tint },
      }),
      h(
        "span",
        {
          className: "w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110",
          style: { backgroundColor: `${tint}1A`, color: tint },
        },
        icon(CATEGORY_ICONS[cat.name] || "Tag", { size: 20 })
      ),
      h("h2", { className: "font-bold text-ink-900 group-hover:text-primary transition-colors" }, cat.name),
      h("p", { className: "text-xs text-muted mt-1.5 leading-relaxed" }, CATEGORY_BLURBS[cat.name] || "Second-hand finds with tracked history."),
      h(
        "span",
        { className: "link-more mt-3.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1" },
        "Explore",
        icon("ArrowRight", { size: 12 })
      )
    );
  };

  const previewSection = (cat) => {
    const products = st.previews[cat._id] || [];
    const cards = st.loading
      ? [h("div", { className: "col-span-2 lg:col-span-4" }, h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" }, ...Array.from({ length: 4 }, () => SkeletonCard())))]
      : products.map((p) =>
          h(
            "a",
            { key: p._id, href: `/products/${p._id}`, className: "block h-full" },
            ProductCard({
              product: p,
              onWishlist: toggleWishlist,
              wishlisted: st.wishlistIds.has(String(p._id)),
              onCompare: auth.getState().user ? compareStore.toggle : undefined,
              comparing: compareStore.isComparing(p._id),
            })
          )
        );
    if (!st.loading && products.length === 0) {
      cards.push(
        h(
          "div",
          { className: "col-span-2 lg:col-span-4" },
          h(
            "div",
            { className: "sunken-panel py-8 text-center" },
            h("p", { className: "text-sm text-muted" }, "No listed items yet in this category — be the first to sell.")
          )
        )
      );
    }
    return h(
      "section",
      { key: cat._id },
      h(
        "div",
        { className: "flex items-end justify-between gap-4 mb-5" },
        h(
          "div",
          { className: "min-w-0" },
          h("h2", { className: "section-title" }, cat.name),
          h("p", { className: "section-sub" }, CATEGORY_BLURBS[cat.name] || "Popular listings this week")
        ),
        h("a", { href: `/products?category=${cat._id}`, className: "link-more flex-none flex items-center gap-1" }, "View all", icon("ArrowRight", { size: 14 }))
      ),
      h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" }, ...cards)
    );
  };

  const pageContent = () =>
    h(
      "div",
      { className: "animate-fade-in" },
      h(
        "div",
        { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-16" },
        ...st.categories.map((cat, ci) => categoryCard(cat, ci))
      ),
      h("div", { className: "space-y-14" }, ...st.categories.slice(0, 8).map(previewSection))
    );

  const repaint = () => {
    mount(bodyHost, pageContent());
  };

  const page = () =>
    h(
      "div",
      { className: "animate-fade-in" },
      h(
        "header",
        { className: "page-masthead" },
        h(
          "div",
          { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10" },
          h(
            "nav",
            { className: "flex items-center gap-1.5 text-xs font-semibold text-muted mb-4" },
            h("a", { href: "/", className: "hover:text-primary transition-colors" }, "Home"),
            icon("ChevronRight", { size: 12, className: "text-muted-soft" }),
            h("span", { className: "text-ink-900" }, "Categories")
          ),
          h("p", { className: "page-eyebrow" }, icon("LayoutGrid", { size: 13 }), " Departments"),
          h("h1", { className: "page-title text-balance" }, "Browse by category"),
          h(
            "p",
            { className: "page-sub max-w-2xl" },
            "Every department of the campus marketplace — from last-semester laptops to barely-used cycling gear. Pick a category to see its most popular listings, or jump straight into the full catalog."
          )
        )
      ),
      bodyHost
    );

  const load = async () => {
    try {
      const [cRes, wRes] = await Promise.all([
        api.get("/products/categories"),
        api.get("/wishlist").catch(() => null),
      ]);
      if (!ensureAlive()) return;
      const cats = cRes.data.categories || [];
      st.categories = cats;
      st.wishlistIds = new Set((wRes?.data?.wishlist || wRes?.data?.products || []).map((w) => String(w.product?._id || w.productId || w._id)));

      const previewResults = await Promise.allSettled(
        cats.slice(0, 8).map((c) => api.get(`/products?category=${c._id}&limit=4&sort=popular`))
      );
      if (!ensureAlive()) return;
      const map = {};
      previewResults.forEach((r, i) => {
        if (r.status === "fulfilled") map[cats[i]._id] = r.value.data.products || [];
      });
      st.previews = map;
    } catch {
      if (!ensureAlive()) return;
    }
    st.loading = false;
    if (ensureAlive()) repaint();
  };

  // Render header + skeleton body first, load data, then repaint body.
  mount(root, page());
  mount(bodyHost, pageContent());
  load();

  return root;
}