import { h } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import auth from "../store/auth.js";
import compareStore from "../store/compare.js";
import behavior from "../utils/behavior.js";
import ProductCard from "../components/product-card.js";
import { SkeletonCard } from "../components/loading.js";
import { initials } from "../utils/format.js";
import { seriesColor } from "../utils/theme.js";
import { navigate } from "../navigation.js";

/**
 * MERIDIAN storefront home.
 *
 * Ported line for line from `frontend/src/pages/Home.jsx`. Every section, API
 * call, state transition and behaviour event in the React page is here, in the
 * same order, because the page is the customer's first screen and the
 * segmentation model reads what they do on it.
 *
 * The one structural difference is how re-rendering works. React re-ran the whole
 * component on every state change and reconciled the result, so the hero's search
 * input, the section headings and the focus/caret inside a card button all
 * survived. This build has no reconciler, so the page shell - including the
 * search input and the three hero feature cards - is created once and only its
 * data regions are replaced. That produces the same DOM React ended up with, and
 * it means a wishlist click cannot steal focus out of the button that was
 * pressed.
 */

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

const PROMISES = [
  {
    icon: "MapPin",
    title: "Local & campus pickups",
    desc: "Buy from verified sellers nearby and skip the shipping wait entirely.",
    to: "/products",
  },
  {
    icon: "Heart",
    title: "Prices that make you smile",
    desc: "Sellers set honest prices — most listings save you 30%+ against buying new.",
    to: "/products",
  },
  {
    icon: "MessageCircle",
    title: "Chat before you commit",
    desc: "Ask questions, negotiate offers and read reviews before you pay a rupee.",
    to: "/messages",
  },
];

const STEPS = [
  { n: "01", label: "List in a minute", desc: "Photos, price, location — done." },
  { n: "02", label: "Negotiate live", desc: "Offers, counters and chats in one place." },
  { n: "03", label: "Meet & handover", desc: "Local pickup or arrange delivery." },
];

/** The three proof tiles under the hero search box. */
const HERO_FEATURES = [
  { icon: "ShieldCheck", label: "Verified sellers", sub: "Rating & history", to: "/products" },
  { icon: "BadgePercent", label: "Negotiable deals", sub: "Make offers", to: "/products" },
  { icon: "BellRing", label: "Price-drop alerts", sub: "Watch & save", to: "/notifications" },
];

const CONTAINER = "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8";

/** An in-app anchor. The router intercepts same-origin clicks. */
const A = (to, props = {}, ...children) => h("a", { href: to, ...props }, ...children);

/**
 * A replaceable region with no wrapper element of its own.
 *
 * React inserted these sections as siblings, so a `<div>` host would add a block
 * box between them and shift the layout. The comment node is a Node, so it can
 * be appended directly, and each `set()` swaps it for the real element in place.
 */
function slot() {
  let current = document.createComment("home-slot");
  return {
    // A getter, not a snapshot: `set` rebinds `current`, and every renderer
    // re-reads `.node` while building the tree it is about to swap in. A snapshot
    // would hand back the very first comment forever, so the second and later
    // paints would insert a detached node and quietly drop the section.
    get node() {
      return current;
    },
    set(el) {
      const next = el || document.createComment("home-slot");
      current.replaceWith(next);
      current = next;
    },
  };
}

/** `<SectionHead>` from the React page. `eyebrow` is a string or icon + text. */
function sectionHead({ eyebrow, title, sub, to, linkLabel } = {}) {
  return h(
    "div",
    { className: "flex items-end justify-between gap-4 mb-6" },
    h(
      "div",
      { className: "min-w-0" },
      eyebrow ? h("p", { className: "page-eyebrow" }, eyebrow) : null,
      h("h2", { className: "section-title" }, title),
      sub ? h("p", { className: "section-sub" }, sub) : null
    ),
    to
      ? A(to, { className: "link-more flex-none" }, linkLabel, icon("ArrowRight", { size: 14 }))
      : null
  );
}

export default function Home() {
  const state = {
    settings: null,
    trending: [],
    deals: [],
    nearby: null,
    sellers: [],
    categories: [],
    recent: [],
    recommended: null,
    continueItems: [],
    wishlistIds: new Set(),
    search: "",
    loading: true,
  };

  // ---------- teardown ----------

  /**
   * Home subscribes to two stores, and the router has no unmount hook, so a
   * customer who browses to /products would otherwise leave a detached home page
   * repainting itself on every compare toggle. `ensureAlive` notices the shell
   * has replaced the page region and drops the subscriptions.
   *
   * Connection is the only test. An earlier version remembered "was it ever
   * connected?" to avoid disposing a page that had not been mounted yet, and that
   * backfired: a Home that was replaced before any store event ever reached it
   * stayed subscribed forever, and the next auth change fired its four personal
   * requests against a page nobody was looking at. The window between building a
   * page and mounting it is synchronous, so no store event can arrive inside it
   * and the extra state was buying nothing.
   */
  const cleanups = [];
  let disposed = false;

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  // ---------- data ----------

  /** Public feed: the six requests the React page fired on mount, in order. */
  async function load() {
    try {
      const [sRes, tRes, cRes, rRes, nRes, wRes] = await Promise.all([
        api.get("/settings/public"),
        api.get("/products/trending?limit=8"),
        api.get("/products/categories"),
        api.get("/products/recent?limit=8").catch(() => null),
        api.get("/products/recommended?limit=4").catch(() => null),
        api.get("/wishlist").catch(() => null),
      ]);
      state.settings = sRes.data;
      state.trending = tRes.data.products || [];
      state.categories = cRes.data.categories || [];
      state.recent = rRes?.data?.products || [];
      state.recommended = nRes?.data || null;
      state.wishlistIds = new Set((wRes?.data?.products || []).map((w) => String(w._id)));
    } catch {
      /* a failure in the unguarded three leaves the page as it found it */
    }
    state.loading = false;
    paint();
  }

  /**
   * Signed-in extras. Every request is individually guarded, so this never
   * rejects: a customer with no deals and no saved searches sees fewer sections,
   * not an error.
   */
  async function loadPersonal(user) {
    const [dRes, nbRes, sRes, cRes] = await Promise.all([
      api.get("/products/deals?limit=4").catch(() => null),
      api.get(`/products/nearby?location=${encodeURIComponent(user.location || "")}&limit=4`).catch(() => null),
      api.get("/users/verified-sellers").catch(() => null),
      api.get("/search/continue").catch(() => null),
    ]);
    state.deals = dRes?.data?.products || [];
    state.nearby = nbRes?.data?.products?.length ? { ...nbRes.data, location: user.location } : null;
    state.sellers = sRes?.data?.sellers || [];
    state.continueItems = cRes?.data?.items || [];
    paint();
  }

  // ---------- handlers ----------

  function handleSearch(e) {
    e?.preventDefault();
    if (state.search.trim()) {
      behavior.search(state.search.trim());
      navigate(`/products?search=${encodeURIComponent(state.search.trim())}`);
    }
  }

  async function toggleWishlist(productId) {
    const present = state.wishlistIds.has(String(productId));
    let changed = false;
    try {
      if (present) {
        // Re-read the wishlist to find the entry id, exactly as React did: the
        // DELETE route is keyed on the wishlist entry, not the product.
        const wishlist = await api.get("/wishlist").catch(() => null);
        const item = (wishlist?.data?.products || []).find((w) => String(w._id) === String(productId));
        if (item) await api.delete(`/wishlist/${item._id}`);
        const next = new Set(state.wishlistIds);
        next.delete(String(productId));
        state.wishlistIds = next;
        changed = true;
      } else {
        await api.post("/wishlist", { productId });
        state.wishlistIds = new Set(state.wishlistIds).add(String(productId));
        changed = true;
      }
    } catch {
      /* a rejected request leaves the heart exactly where it was */
    }
    if (!changed) return;
    paint();
    focusCardControl("wishlist", productId);
  }

  // ---------- persistent hero ----------

  // Three separate text nodes because the JSX produced three: the badge holds a
  // site name, a literal separator and a tagline, not one interpolated string.
  const badgeName = document.createTextNode("ReMarket");
  const badgeSep = document.createTextNode(" · ");
  const badgeTagline = document.createTextNode("Give good things a second life.");

  const heroHeadline = h("h1", {
    className:
      "text-[2.4rem] sm:text-6xl font-extrabold leading-[1.05] tracking-[-0.03em] text-white text-balance",
  });
  const heroSub = h("p", {
    className: "text-base sm:text-lg text-white/70 mt-5 max-w-2xl leading-relaxed",
  });

  // No `type` attribute, because the React <input> had none either and an
  // untyped input is a text input; emitting one would differ from the JSX.
  const searchInput = h("input", {
    placeholder: "Search laptops, phones, books…",
    "aria-label": "Search marketplace",
    className:
      "flex-1 px-2 py-2.5 text-sm text-ink-900 bg-transparent outline-none placeholder:text-muted-soft min-w-0",
    onInput: (e) => {
      state.search = e.target.value;
    },
  });

  const hero = h(
    "section",
    { className: "mesh-primary text-white relative overflow-hidden" },
    h("div", { className: "absolute inset-0 bg-dots opacity-40" }),
    h("div", {
      className: "absolute -top-32 right-0 w-[26rem] h-[26rem] rounded-full bg-brand-500/20 blur-3xl",
    }),
    h("div", {
      className: "absolute -bottom-40 left-10 w-[24rem] h-[24rem] rounded-full bg-accent/20 blur-3xl",
    }),
    h(
      "div",
      { className: `relative ${CONTAINER} py-16 sm:py-24` },
      h(
        "div",
        { className: "max-w-3xl" },
        h(
          "span",
          {
            className:
              "inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur border border-white/15 px-3.5 py-1.5 text-2xs font-bold uppercase tracking-[0.14em] mb-6",
          },
          icon("Recycle", { size: 13, className: "text-brand-300" }),
          badgeName,
          badgeSep,
          badgeTagline
        ),
        heroHeadline,
        heroSub,
        h(
          "form",
          {
            onSubmit: handleSearch,
            className: "flex items-center gap-2 bg-white rounded-2xl p-1.5 max-w-xl mt-8 shadow-pop",
          },
          icon("Search", { size: 18, className: "ml-3 text-muted-soft shrink-0" }),
          searchInput,
          h("button", { type: "submit", className: "btn-primary flex-none" }, "Search", icon("ArrowRight", { size: 15 }))
        ),
        h(
          "div",
          { className: "grid sm:grid-cols-3 gap-3 mt-9 max-w-2xl" },
          HERO_FEATURES.map((f) =>
            A(
              f.to,
              {
                className:
                  "group rounded-xl bg-white/[0.07] backdrop-blur border border-white/12 p-3.5 hover:bg-white/[0.13] hover:border-white/25 transition-all duration-200",
              },
              icon(f.icon, { size: 17, className: "text-brand-300 mb-2" }),
              h("p", { className: "text-xs font-bold leading-tight" }, f.label),
              h("p", { className: "text-2xs text-white/55 mt-0.5" }, f.sub)
            )
          )
        )
      )
    )
  );

  // ---------- persistent static sections ----------

  const promises = h(
    "section",
    { className: "py-12" },
    h(
      "div",
      { className: "grid sm:grid-cols-3 gap-4" },
      PROMISES.map((f) =>
        A(
          f.to,
          { className: "card card-hover p-6 group" },
          h(
            "span",
            { className: "feature-icon mb-4 group-hover:scale-105 transition-transform duration-200" },
            icon(f.icon, { size: 20 })
          ),
          h("h3", { className: "text-[15px] font-bold text-ink-900 mb-1.5" }, f.title),
          h("p", { className: "text-sm text-muted leading-relaxed" }, f.desc),
          h(
            "span",
            { className: "link-more mt-4" },
            "Learn more ",
            icon("ArrowUpRight", {
              size: 13,
              className: "transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
            })
          )
        )
      )
    )
  );

  const howItWorks = h(
    "section",
    { className: "pb-16" },
    h(
      "div",
      { className: "relative overflow-hidden rounded-3xl mesh-primary text-white p-8 sm:p-12" },
      h("div", { className: "absolute inset-0 bg-dots opacity-30" }),
      h(
        "div",
        { className: "relative max-w-3xl" },
        h(
          "span",
          {
            className:
              "inline-flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.14em] bg-white/10 border border-white/15 rounded-full px-3 py-1 mb-5",
          },
          icon("Store", { size: 12 }),
          " How ReMarket works"
        ),
        h(
          "h2",
          {
            className:
              "text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-[1.12]",
          },
          "Sell what you've outgrown.",
          h("br"),
          "Buy what you've outshopped."
        ),
        h(
          "div",
          { className: "grid sm:grid-cols-3 gap-6 mt-9" },
          STEPS.map((s) =>
            h(
              "div",
              { className: "flex gap-3" },
              h("span", { className: "text-3xl font-extrabold text-brand-300 tabular leading-none" }, s.n),
              h(
                "div",
                null,
                h("h3", { className: "font-bold text-white text-sm" }, s.label),
                h("p", { className: "text-xs text-white/55 mt-1 leading-relaxed" }, s.desc)
              )
            )
          )
        ),
        h(
          "div",
          { className: "mt-9 flex flex-wrap gap-3" },
          A(
            "/sell",
            { className: "btn bg-white text-ink-900 hover:bg-white/90 font-bold shadow-pop" },
            "Start selling ",
            icon("ArrowRight", { size: 15 })
          ),
          A(
            "/products",
            {
              className:
                "btn bg-white/10 text-white border border-white/20 hover:bg-white/20",
            },
            "Browse marketplace"
          )
        )
      )
    )
  );

  // ---------- dynamic regions ----------

  const sContinue = slot();
  const sTrending = slot();
  const sDeals = slot();
  const sNearby = slot();
  const sSellers = slot();
  const sCategories = slot();
  const sRecommended = slot();
  const sRecent = slot();

  const root = h(
    "div",
    { className: "animate-fade-in" },
    hero,
    h(
      "div",
      { className: CONTAINER },
      sContinue.node,
      h("section", { className: "py-12" }, sectionHead({
        eyebrow: [icon("Flame", { size: 13 }), " Trending now"],
        title: "Most wanted this week",
        sub: "Most viewed and just-added listings",
        to: "/products",
        linkLabel: "View all",
      }), sTrending.node)
    ),
    sDeals.node,
    h(
      "div",
      { className: CONTAINER },
      sNearby.node,
      sSellers.node,
      h(
        "section",
        { className: "py-12" },
        sectionHead({
          eyebrow: [icon("Package", { size: 13 }), " Departments"],
          title: "Browse categories",
          sub: "From study must-haves to weekend gear",
          to: "/categories",
          linkLabel: "All categories",
        }),
        sCategories.node
      )
    ),
    sRecommended.node,
    h(
      "div",
      { className: CONTAINER },
      sRecent.node,
      promises,
      howItWorks
    )
  );

  // ---------- builders ----------

  /** One product wrapped in its product link, as `<Link className="block h-full">`. */
  function card(p) {
    return A(
      `/products/${p._id}`,
      { className: "block h-full", dataset: { homeCard: String(p._id) } },
      ProductCard({
        product: p,
        onWishlist: toggleWishlist,
        wishlisted: state.wishlistIds.has(String(p._id)),
        // Compare is opt-in for signed-in customers only, exactly as in React:
        // the button is omitted entirely for a signed-out visitor.
        onCompare: auth.user ? compareStore.toggle : undefined,
        comparing: compareStore.isComparing(p._id),
      })
    );
  }

  const grid = (products) =>
    h(
      "div",
      { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
      products.map(card)
    );

  function renderContinue() {
    if (!state.continueItems.length) return null;
    return h(
      "section",
      { className: "py-12" },
      sectionHead({
        eyebrow: "Pick up where you left off",
        title: "Continue your search",
        sub: "Fresh matches for your most recent searches",
      }),
      h(
        "div",
        { className: "space-y-10" },
        state.continueItems.slice(0, 2).map((item) =>
          h(
            "div",
            null,
            A(
              `/products?search=${encodeURIComponent(item.query)}`,
              {
                className:
                  "group inline-flex items-center gap-1.5 text-sm font-bold text-primary mb-4 hover:underline",
              },
              "“",
              item.query,
              "”",
              icon("ArrowRight", { size: 13, className: "transition-transform group-hover:translate-x-0.5" })
            ),
            // These matches come from a text index that returns no `seller`
            // subdocument, and the React page passed a bare `{}` rather than the
            // ProductCard default. Preserved so the trust strip reads identically.
            h(
              "div",
              { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
              item.products.map((p) =>
                A(
                  `/products/${p._id}`,
                  { className: "block h-full", dataset: { homeCard: String(p._id) } },
                  ProductCard({
                    product: { ...p, seller: p.seller || {} },
                    onWishlist: toggleWishlist,
                    wishlisted: state.wishlistIds.has(String(p._id)),
                  })
                )
              )
            )
          )
        )
      )
    );
  }

  function renderDeals() {
    if (!state.deals.length) return null;
    return h(
      "section",
      { className: "bg-card border-y border-line" },
      h(
        "div",
        { className: `${CONTAINER} py-12` },
        sectionHead({
          eyebrow: [icon("Tag", { size: 13 }), " Best value"],
          title: "Price drops & deep deals",
          sub: "Haggled-down prices worth a second look",
          to: "/products?minDiscount=10",
          linkLabel: "All deals",
        }),
        grid(state.deals)
      )
    );
  }

  function renderNearby() {
    if (!state.nearby) return null;
    const loc = state.nearby.location;
    return h(
      "section",
      { className: "py-12" },
      sectionHead({
        eyebrow: [icon("MapPin", { size: 13 }), " Close to you"],
        title: `Products near ${loc || "you"}`,
        sub: `Local sellers close to ${loc || "your location"} — fast pickup, zero shipping`,
        to: `/products?location=${encodeURIComponent(loc || "")}`,
        linkLabel: "Nearby all",
      }),
      grid(state.nearby.products)
    );
  }

  function renderSellers() {
    if (!state.sellers.length) return null;
    return h(
      "section",
      { className: "py-12" },
      sectionHead({
        eyebrow: [icon("ShieldCheck", { size: 13 }), " Trusted on campus"],
        title: "Verified sellers",
        sub: "Top-rated sellers with a real track record",
      }),
      h(
        "div",
        { className: "grid grid-cols-2 md:grid-cols-4 gap-4" },
        state.sellers.slice(0, 4).map((s) =>
          A(
            `/seller/${s._id}`,
            { className: "card card-hover p-5 flex flex-col" },
            h("span", { className: "avatar w-12 h-12 text-base mb-3.5" }, initials(s.name)),
            h("p", { className: "font-bold text-ink-900 truncate" }, s.name),
            h("p", { className: "text-xs text-muted mt-0.5" }, s.location || "Campus"),
            h(
              "div",
              { className: "flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line" },
              h("span", { className: "badge badge-warning" }, `★ ${s.sellerRating?.toFixed?.(1) ?? "—"}`),
              h(
                "span",
                { className: "badge badge-neutral" },
                `${s.activeListings ?? 0} listing${s.activeListings === 1 ? "" : "s"}`
              ),
              h("span", { className: "badge badge-neutral" }, `${s.soldCount ?? 0} sold`)
            )
          )
        )
      )
    );
  }

  function renderCategories() {
    // Always rendered, even with nothing in it: the React page put the heading
    // and this grid in one always-present <section>, so an empty category list
    // showed the "Browse categories" heading over an empty grid.
    return h(
      "div",
      { className: "grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3" },
      state.categories.map((cat, ci) =>
        A(
          `/products?category=${cat._id}`,
          {
            onClick: () => behavior.categoryView(cat.name),
            className:
              "group flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-line card-hover text-center",
          },
          h(
            "span",
            {
              className:
                "w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110",
              // Called with one argument, exactly as Home.jsx did. seriesColor()
              // takes (key, index) and only uses `key` to decide the branch, so
              // a bare index reaches SERIES[undefined] and yields no colour. Left
              // as-is because changing it would repaint every category tile.
              style: { backgroundColor: `${seriesColor(ci)}1A`, color: seriesColor(ci) },
            },
            icon(CATEGORY_ICONS[cat.name] || "Package", { size: 19 })
          ),
          h("span", { className: "text-xs font-bold text-ink-800 leading-tight" }, cat.name)
        )
      )
    );
  }

  function renderRecommended() {
    const rec = state.recommended;
    if (!rec?.recommendations?.length) return null;
    const discountFocused = rec.strategy === "discount_focused";
    return h(
      "section",
      { className: "bg-card border-y border-line" },
      h(
        "div",
        { className: `${CONTAINER} py-12` },
        h(
          "div",
          { className: "flex items-end justify-between gap-4 mb-6" },
          h(
            "div",
            { className: "min-w-0" },
            h(
              "p",
              { className: "page-eyebrow" },
              icon("Sparkles", { size: 13 }),
              " Personalised for you"
            ),
            h("h2", { className: "section-title" }, "Picked for your style"),
            h(
              "p",
              { className: "section-sub" },
              discountFocused
                ? "Based on your negotiation & cart activity — the best deals first"
                : "Based on your browsing, reviews & trust signals — top-rated picks",
              rec.preferredCategories?.length > 0 &&
                ` · favourites in ${rec.preferredCategories.map((c) => c.name).join(", ")}`
            )
          ),
          h(
            "span",
            { className: "badge badge-primary flex-none" },
            discountFocused ? "Deeper deals" : "Top rated"
          )
        ),
        grid(rec.recommendations)
      )
    );
  }

  function renderRecent() {
    if (!state.recent.length) return null;
    return h(
      "section",
      { className: "py-12" },
      sectionHead({
        eyebrow: [icon("TrendingUp", { size: 13 }), " Just listed"],
        title: "Fresh arrivals",
        sub: "Newest listings from local sellers",
        to: "/products",
        linkLabel: "View all",
      }),
      grid(state.recent)
    );
  }

  // ---------- painting ----------

  /**
   * Put the keyboard back on the control that caused a repaint.
   *
   * React reused the clicked button's DOM node, so a shopper tabbing to a heart
   * stayed on that heart. Replacing the grid drops the focused node, so the
   * equivalent control on the same product is re-focused after the repaint.
   */
  function focusCardControl(kind, productId) {
    const id = String(productId);
    const labels =
      kind === "wishlist"
        ? ['button[aria-label="Save to wishlist"]', 'button[aria-label="Remove from wishlist"]']
        : ['button[aria-label="Add to compare"]', 'button[aria-label="Remove from compare"]'];
    for (const anchor of root.querySelectorAll("a[data-home-card]")) {
      if (anchor.dataset.homeCard !== id) continue;
      for (const sel of labels) {
        const el = anchor.querySelector(sel);
        if (el) {
          el.focus();
          return;
        }
      }
    }
  }

  function paint() {
    const h0 = state.settings || {};

    badgeName.nodeValue = h0.siteName || "ReMarket";
    badgeTagline.nodeValue = h0.siteTagline || "Give good things a second life.";
    heroHeadline.textContent = h0.heroHeadline || "Great finds, second life, zero waste.";
    heroSub.textContent =
      h0.heroSubheadline ||
      "The campus marketplace where trusted sellers and smart buyers meet. Compare, negotiate, and let the platform learn your shopping style.";

    sContinue.set(renderContinue());
    sTrending.set(
      state.loading
        ? h(
            "div",
            { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
            Array.from({ length: 4 }, () => SkeletonCard())
          )
        : grid(state.trending)
    );
    sDeals.set(renderDeals());
    sNearby.set(renderNearby());
    sSellers.set(renderSellers());
    sCategories.set(renderCategories());
    sRecommended.set(renderRecommended());
    sRecent.set(renderRecent());
  }

  // ---------- subscriptions ----------

  /**
   * The React page passed `wishlisted` and `comparing` into every card, so any
   * change to either set re-rendered the page. Same two sources here.
   */
  cleanups.push(
    compareStore.subscribe(() => {
      if (!ensureAlive()) return;
      // If a compare button is what the shopper pressed, keep focus on it.
      const active = document.activeElement;
      const label = active?.getAttribute?.("aria-label") || "";
      const kind = /wishlist/i.test(label) ? "wishlist" : /compare/i.test(label) ? "compare" : null;
      const anchor = kind ? active?.closest?.("a[data-home-card]") : null;
      paint();
      if (anchor?.dataset.homeCard) focusCardControl(kind, anchor.dataset.homeCard);
    })
  );

  /**
   * `useEffect(..., [user])`: the personal sections are re-fetched whenever the
   * signed-in customer changes and skipped while signed out. Compared by object
   * identity, because that is exactly what the dependency array compared.
   */
  let lastUser = auth.user;
  const syncPersonal = () => {
    if (!ensureAlive()) return;
    const user = auth.user;
    if (user === lastUser) return;
    lastUser = user;
    if (!user) return;
    loadPersonal(user);
  };
  cleanups.push(auth.subscribe(syncPersonal));

  paint();
  load();
  if (lastUser) loadPersonal(lastUser);

  return root;
}
