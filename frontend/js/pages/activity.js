import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import { formatINR, timeAgo } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import ProductCard from "../components/product-card.js";
import EmptyState from "../components/empty-state.js";
import { imageProps } from "../utils/images.js";

const STAT_DEFS = [
  { icon: "Eye", label: "Products viewed" },
  { icon: "Search", label: "Searches" },
  { icon: "GitCompareArrows", label: "Compared" },
  { icon: "Heart", label: "Saved" },
  { icon: "BellRing", label: "Price watches" },
  { icon: "Tag", label: "Offers sent" },
  { icon: "ShoppingBag", label: "Purchases" },
];

/**
 * Activity ("Your shopping insights").
 *
 * Ported from the React build's Activity.jsx. Fires eight read-only endpoints
 * in parallel (every one individually caught, exactly like the source) and
 * renders the stat band plus the per-topic sections: continue searches,
 * recent searches, viewed products, comparisons, price watches, offers,
 * orders and recommendations. The React version imports EmptyState from
 * Loading.jsx which merely re-exports the shared EmptyState, so the vanilla
 * component is the same one used everywhere else.
 *
 * Wishlist toggling on product cards mirrors the Categories handler and hits
 * the same /wishlist endpoints.
 */

export default function Activity() {
  const st = { data: null, loading: true, wishlistIds: new Set() };

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

  const bodyHost = h("div", { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14" });

  const toggleWishlist = async (productId) => {
    const present = st.wishlistIds.has(String(productId));
    try {
      if (present) {
        const wishlistData = await api.get("/wishlist").catch(() => null);
        const items = wishlistData?.data?.wishlist || wishlistData?.data?.products || [];
        const item = items.find((w) => String(w.product?._id || w.productId || w._id) === String(productId));
        if (item) await api.delete(`/wishlist/${item._id}`);
        const s = new Set(st.wishlistIds);
        s.delete(String(productId));
        st.wishlistIds = s;
      } else {
        await api.post("/wishlist", { productId });
        st.wishlistIds = new Set(st.wishlistIds).add(String(productId));
      }
    } catch {
      // React swallows the failure silently.
    }
  };

  const load = async () => {
    try {
      const [timeline, wishlist, compare, watches, offers, orders, recommended, continueRes] =
        await Promise.all([
          api.get("/behavior/timeline?limit=120").catch(() => null),
          api.get("/wishlist").catch(() => null),
          api.get("/compare").catch(() => null),
          api.get("/price-watch").catch(() => null),
          api.get("/offers/my").catch(() => null),
          api.get("/orders").catch(() => null),
          api.get("/products/recommended?limit=6").catch(() => null),
          api.get("/search/continue").catch(() => null),
        ]);
      if (!ensureAlive()) return;
      st.data = {
        events: timeline?.data?.events || [],
        wishlist: wishlist?.data?.wishlist || wishlist?.data?.products || [],
        compare: compare?.data?.products || [],
        watches: watches?.data?.watches || [],
        offers: offers?.data?.offers || offers?.data || [],
        orders: orders?.data?.orders || orders?.data || [],
        recommended: recommended?.data || null,
        continue: continueRes?.data?.items || [],
      };
      st.wishlistIds = new Set(
        (wishlist?.data?.wishlist || wishlist?.data?.products || []).map((w) => String(w.product?._id || w.productId || w._id))
      );
    } catch {}
    st.loading = false;
    if (ensureAlive()) {
      mount(root, page());
      mount(bodyHost, bodyContent());
    }
  };

  const productGrid = (products, withWishlist = false) =>
    h(
      "div",
      { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
      ...products.map((p) =>
        h(
          "a",
          { key: p._id, href: `/products/${p._id}`, className: "block h-full" },
          ProductCard(
            withWishlist
              ? {
                  product: p,
                  onWishlist: toggleWishlist,
                  wishlisted: st.wishlistIds.has(String(p._id)),
                }
              : { product: p }
          )
        )
      )
    );

  const bodyContent = () => {
    const {
      events = [], wishlist = [], compare = [], watches = [],
      offers = [], orders = [], recommended = null, continue: continueItems = [],
    } = st.data || {};

    const views = events.filter((e) => e.eventType === "PRODUCT_VIEW");
    const searches = events.filter((e) => e.eventType === "SEARCH");
    const recentSearches = [...new Set(searches.map((s) => s.metadata?.query).filter(Boolean))].slice(0, 8);
    const viewedProducts = views
      .filter((v) => v.productId)
      .reduce((acc, v) => {
        const id = String(v.productId._id || v.productId);
        if (!acc.some((x) => String(x.productId._id || x.productId) === id)) acc.push(v);
        return acc;
      }, [])
      .slice(0, 6);
    const offersPending = offers.filter((o) => o.status === "pending" || o.status === "countered").length;

    const values = [views.length, searches.length, compare.length, wishlist.length, watches.length, offers.length, orders.length];
    const sections = [];

    if (continueItems.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h("h2", { className: "section-title" }, "Pick up where you left off"),
          h("p", { className: "section-sub mb-4" }, "Matches for your most recent searches"),
          h(
            "div",
            { className: "space-y-6" },
            ...continueItems.map((item) =>
              h(
                "div",
                { key: item.query },
                h("a", { href: `/products?search=${encodeURIComponent(item.query)}`, className: "group inline-flex items-center gap-2 text-sm font-bold text-primary mb-3 hover:underline" },
                  icon("Search", { size: 13 }),
                  ` "${item.query}"`,
                  icon("ArrowRight", { size: 13, className: "group-hover:translate-x-0.5 transition-transform" })
                ),
                productGrid(item.products.map((p) => ({ ...p, seller: p.seller || {} })), true)
              )
            )
          )
        )
      );
    }

    if (recentSearches.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h("h2", { className: "section-title" }, "Recent searches"),
          h("p", { className: "section-sub mb-4" }, "Tap to jump back into the search"),
          h(
            "div",
            { className: "flex flex-wrap gap-2" },
            ...recentSearches.map((q) =>
              h("a", { key: q, href: `/products?search=${encodeURIComponent(q)}`, className: "chip" }, icon("Search", { size: 12 }), " ", q)
            )
          )
        )
      );
    }

    if (viewedProducts.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "div",
            { className: "flex items-end justify-between gap-3 mb-4" },
            h(
              "div",
              null,
              h("h2", { className: "section-title" }, "Recently viewed"),
              h("p", { className: "section-sub" }, "Your browsing trail, kept short and simple")
            ),
            h("a", { href: "/products", className: "link-more flex-none" }, "Browse more ", icon("ArrowRight", { size: 14 }))
          ),
          h(
            "div",
            { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" },
            ...viewedProducts.map((v) => {
              const p = v.productId;
              return h(
                "a",
                { key: String(p._id || p), href: `/products/${p._id || p}`, className: "surface-panel p-4 flex items-center gap-4 card-hover" },
                h("div", { className: "w-14 h-14 rounded-xl bg-sunken flex items-center justify-center overflow-hidden flex-none" },
                  h("img", { ...imageProps(p), alt: "", className: "w-full h-full object-cover" })
                ),
                h(
                  "div",
                  { className: "min-w-0 flex-1" },
                  h("p", { className: "text-sm font-bold text-ink-800 truncate" }, p.title),
                  h("p", { className: "text-2xs text-muted mt-0.5" }, `${p.categoryName || ""} · ${timeAgo(v.timestamp)}`)
                ),
                h("span", { className: "text-sm font-extrabold text-primary tabular flex-none" }, formatINR(p.price))
              );
            })
          )
        )
      );
    }

    if (compare.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "div",
            { className: "flex items-end justify-between gap-3 mb-4" },
            h(
              "div",
              null,
              h("h2", { className: "section-title flex items-center gap-2" }, icon("GitCompareArrows", { size: 19, className: "text-primary" }), " Your comparisons"),
              h("p", { className: "section-sub" }, "Products you put side by side this session")
            ),
            h("a", { href: "/compare", className: "link-more flex-none" }, "Open compare ", icon("ArrowRight", { size: 14 }))
          ),
          productGrid(compare)
        )
      );
    }

    if (watches.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "div",
            { className: "flex items-end justify-between gap-3 mb-4" },
            h(
              "div",
              null,
              h("h2", { className: "section-title flex items-center gap-2" }, icon("BellRing", { size: 19, className: "text-primary" }), " Price watches"),
              h("p", { className: "section-sub" }, "We'll nudge you the moment these drop to your target")
            ),
            h("a", { href: "/wishlist", className: "link-more flex-none" }, "Manage ", icon("ArrowRight", { size: 14 }))
          ),
          h(
            "div",
            { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" },
            ...watches.map((w) =>
              h(
                "a",
                { key: w.watchId, href: `/products/${w.product?._id}`, className: "surface-panel p-4 flex items-center gap-4 card-hover" },
                h("div", { className: "w-12 h-12 rounded-xl bg-sunken flex items-center justify-center overflow-hidden flex-none" },
                  h("img", { ...imageProps(w.product), alt: w.product?.title || "", className: "w-full h-full object-cover" })
                ),
                h(
                  "div",
                  { className: "min-w-0 flex-1" },
                  h("p", { className: "text-sm font-bold text-ink-800 truncate" }, w.product?.title || "Product"),
                  h(
                    "p",
                    { className: "text-2xs text-muted mt-0.5" },
                    "Now ",
                    h("span", { className: "font-bold text-primary tabular" }, formatINR(w.product?.price)),
                    w.targetPrice ? h("span", { className: "text-muted-soft" }, ` → target ${formatINR(w.targetPrice)}`) : null
                  )
                ),
                w.priceDropped ? h("span", { className: "badge bg-success-soft text-success border-success/20 flex-none" }, "Drop!") : null
              )
            )
          )
        )
      );
    }

    if (offers.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "div",
            { className: "flex items-end justify-between gap-3 mb-4" },
            h(
              "div",
              null,
              h("h2", { className: "section-title flex items-center gap-2" }, icon("Tag", { size: 19, className: "text-primary" }), " Your offers"),
              h("p", { className: "section-sub" }, `${offersPending} awaiting a seller response`)
            ),
            h("a", { href: "/offers", className: "link-more flex-none" }, "All offers ", icon("ArrowRight", { size: 14 }))
          ),
          h(
            "div",
            { className: "space-y-2" },
            ...offers.slice(0, 5).map((o) =>
              h(
                "a",
                { key: o._id, href: `/products/${o.productId?._id}`, className: "surface-panel p-4 flex items-center gap-4 card-hover" },
                h(
                  "div",
                  { className: "flex-1 min-w-0" },
                  h("p", { className: "text-sm font-bold text-ink-800 truncate" }, o.productId?.title || "Product"),
                  h("p", { className: "text-2xs text-muted mt-0.5" }, `Listed ${formatINR(o.listedPrice)} · offered ${formatINR(o.offerAmount)} · ${timeAgo(o.createdAt)}`)
                ),
                h("span", { className: `badge capitalize ${orderTone(o.status)}` }, o.status)
              )
            )
          )
        )
      );
    }

    if (orders.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h(
            "div",
            { className: "flex items-end justify-between gap-3 mb-4" },
            h(
              "div",
              null,
              h("h2", { className: "section-title flex items-center gap-2" }, icon("ShoppingBag", { size: 19, className: "text-primary" }), " Your purchases"),
              h("p", { className: "section-sub" }, "Recently bought on the marketplace")
            ),
            h("a", { href: "/orders", className: "link-more flex-none" }, "All orders ", icon("ArrowRight", { size: 14 }))
          ),
          h(
            "div",
            { className: "space-y-2" },
            ...orders.slice(0, 5).map((o) =>
              h(
                "a",
                { key: o._id, href: `/products/${o.productId?._id}`, className: "surface-panel p-4 flex items-center gap-4 card-hover" },
                h(
                  "div",
                  { className: "flex-1 min-w-0" },
                  h("p", { className: "text-sm font-bold text-ink-800 truncate" }, o.productTitle || o.productId?.title),
                  h("p", { className: "text-2xs text-muted mt-0.5" }, `${timeAgo(o.createdAt)} · ${o.purchaseReason || "buy"}`)
                ),
                h("span", { className: "text-sm font-extrabold text-primary tabular flex-none" }, formatINR(o.finalPrice))
              )
            )
          )
        )
      );
    }

    if (recommended?.recommendations?.length > 0) {
      sections.push(
        h(
          "section",
          null,
          h("h2", { className: "section-title flex items-center gap-2" }, icon("Sparkles", { size: 19, className: "text-primary" }), " Recommended for you"),
          h("p", { className: "section-sub mb-4" },
            recommended.strategy === "discount_focused" ? "Deep deals matched to your negotiation style" : "Top-rated picks in your favorite categories"
          ),
          h(
            "div",
            { className: "grid grid-cols-2 lg:grid-cols-3 gap-4" },
            ...recommended.recommendations.map((p) =>
              h(
                "a",
                { key: p._id, href: `/products/${p._id}`, className: "block h-full" },
                ProductCard({ product: p, onWishlist: toggleWishlist, wishlisted: st.wishlistIds.has(String(p._id)) })
              )
            )
          )
        )
      );
    }

    const hasAny =
      events.length > 0 || wishlist.length > 0 || compare.length > 0 || offers.length > 0 || orders.length > 0;

    if (!hasAny) {
      sections.push(
        h(
          "div",
          { className: "panel" },
          EmptyState({
            iconName: "TrendingUp",
            title: "No activity yet",
            description: "Your shopping trail will appear here as you explore. Search, view and compare a few products and this space will fill up with useful insights.",
            action: h("a", { href: "/products", className: "btn-primary" }, "Start exploring"),
          })
        )
      );
    }

    sections.push(
      h(
        "section",
        { className: "flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-brand-200 bg-primary-soft p-6" },
        h("span", { className: "w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center flex-none" }, icon("Timer", { size: 18 })),
        h(
          "div",
          { className: "flex-1" },
          h("h3", { className: "font-extrabold text-ink-900 text-sm" }, "How your activity helps (without stalking you)"),
          h("p", { className: "text-xs text-ink-600 mt-1 leading-relaxed" },
            "Every view, search and comparison quietly shapes your recommendations and the \"For you\" feed. You only ever see your own aggregate numbers here — the marketplace never shows your activity to others."
          )
        )
      )
    );

    return sections;
  };

  const repaint = () => {
    if (st.loading) return;
    mount(bodyHost, bodyContent());
  };

  const skeleton = () =>
    h(
      "div",
      { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4" },
      h("div", { className: "h-10 bg-sunken rounded-lg animate-pulse w-1/2" }),
      h(
        "div",
        { className: "grid grid-cols-2 md:grid-cols-4 gap-3" },
        ...Array.from({ length: 6 }, () => h("div", { className: "h-24 bg-surface border border-line rounded-2xl animate-pulse" }))
      ),
      h("div", { className: "h-96 bg-sunken rounded-2xl animate-pulse" })
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
          { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10" },
          h(
            "nav",
            { className: "flex items-center gap-1.5 text-xs font-semibold text-muted mb-4" },
            h("a", { href: "/profile", className: "hover:text-primary transition-colors" }, "Profile"),
            icon("ChevronRight", { size: 12, className: "text-muted-soft" }),
            h("span", { className: "text-ink-900" }, "Shopping insights")
          ),
          h(
            "div",
            { className: "flex flex-col sm:flex-row sm:items-end gap-4" },
            h(
              "div",
              { className: "flex-1" },
              h("h1", { className: "page-title text-balance" }, "Your shopping insights"),
              h("p", { className: "page-sub max-w-2xl" },
                "A quiet look at your own activity — what you've viewed, compared and saved. This is how the marketplace learns your style and personalizes the home feed for you."
              )
            ),
            h(
              "span",
              { className: "badge bg-primary-soft text-primary border-brand-200 flex-none" },
              icon("ShieldCheck", { size: 13 }),
              " Private to you"
            )
          ),
          st.data
            ? h(
                "div",
                { className: "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-8" },
                ...STAT_DEFS.map((s, i) => {
                  const v = [
                    (st.data.events || []).filter((e) => e.eventType === "PRODUCT_VIEW").length,
                    (st.data.events || []).filter((e) => e.eventType === "SEARCH").length,
                    (st.data.compare || []).length,
                    (st.data.wishlist || []).length,
                    (st.data.watches || []).length,
                    (st.data.offers || []).length,
                    (st.data.orders || []).length,
                  ][i];
                  return h(
                    "div",
                    { key: s.label, className: "surface-panel p-4 flex flex-col gap-2" },
                    icon(s.icon, { size: 17, className: "text-primary" }),
                    h("span", { className: "text-xl font-extrabold tabular text-ink-900" }, String(v)),
                    h("span", { className: "text-2xs font-semibold text-muted" }, s.label)
                  );
                })
              )
            : null
        )
      ),
      bodyHost
    );

  // ---------- init ----------
  mount(root, skeleton());
  load();

  return root;
}