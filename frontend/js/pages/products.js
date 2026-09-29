import { h, cx, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import auth from "../store/auth.js";
import compareStore from "../store/compare.js";
import behavior from "../utils/behavior.js";
import ProductCard from "../components/product-card.js";
import EmptyState from "../components/empty-state.js";
import { SkeletonCard } from "../components/loading.js";
import { formatINR } from "../utils/format.js";
import { conditionTone } from "../utils/theme.js";
import { getProductImage, imageProps } from "../utils/images.js";
import { navigate, onLocationChange, getLocation } from "../navigation.js";

/**
 * MERIDIAN marketplace listing page (Explore).
 *
 * Ported line for line from `frontend/src/pages/Products.jsx`: the same request
 * sequence, the same URL-as-state contract, the same behaviour event and the
 * same markup classes, because this is the page the segmentation model reads
 * from - a dropped SEARCH event or a changed query shape would change what the
 * ML pipeline learns, not just what the shopper sees.
 *
 * Two structural differences, both forced by there being no reconciler here.
 *
 * 1. **The URL is the filter state, exactly as `useSearchParams` made it.**
 *    Every filter write pushes a new history entry, which re-runs the load.
 *    React got that without remounting, because a route element keeps its
 *    component across re-renders. The router rebuilds the page module on every
 *    navigation, so this module caches its own instance (see the bottom of the
 *    file) and hands the router the same root element back. `Layout` only
 *    re-mounts the page region when the element actually differs, so the filter
 *    panel keeps the caret and focus across a keystroke, and the open drawer and
 *    the grid/list choice survive every query change - all of which React
 *    preserved and a naive port would silently drop.
 *
 * 2. **The filter panel and toolbar are built once and repainted in place.**
 *    Rebuilding them per load would destroy the focused input and reset the
 *    caret on every character typed, because every field here is controlled by
 *    the URL. Only the panel's option lists, the category rail, the badges, the
 *    results and the pager are replaced, which is the set of regions React
 *    re-created.
 */

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Top rated" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
];

const CONDITIONS = ["Like New", "Good", "Average"];

const pageNumbers = (totalPages, current) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, current - 1, current, current + 1]);
  return [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
};

const PER_PAGE = 20;

const CONTAINER = "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8";

/** An in-app anchor. The router intercepts same-origin clicks. */
const A = (to, props = {}, ...children) => h("a", { href: to, ...props }, ...children);

/** Write a value onto a controlled field without moving the caret. */
const setValue = (el, value) => {
  const next = value == null ? "" : String(value);
  if (el.value !== next) el.value = next;
};

/**
 * A replaceable region with no wrapper element of its own.
 *
 * The results, the pager and the filter panel are siblings in the React markup,
 * and each carries its own margin and display. A host <div> would add a block
 * box between them and change how those margins collapse, so these are comment
 * nodes that each `set()` swaps for the real element in place.
 */
function slot(name) {
  let current = document.createComment(name);
  return {
    // A getter, not a snapshot: `set` rebinds `current`, and every renderer
    // re-reads `.node` while building the tree it is about to swap in. A snapshot
    // would hand back the very first comment forever, so the second and later
    // paints would insert a detached node and quietly drop the region.
    get node() {
      return current;
    },
    is(el) {
      return current === el;
    },
    set(el) {
      const next = el || document.createComment(name);
      if (current === next) return;
      current.replaceWith(next);
      current = next;
    },
  };
}

function createProducts() {
  const state = {
    products: [],
    categories: [],
    total: 0,
    loading: true,
    showFilters: false,
    view: "grid",
    wishlistIds: new Set(),
  };

  /**
   * The filter values, read straight off the URL.
   *
   * Re-read on demand rather than mirrored into state: in React this *was*
   * `searchParams`, so no render could ever read a stale filter. `sync()` copies
   * it into `f` so the builders do not each re-parse.
   */
  const f = {};

  function sync() {
    const params = new URLSearchParams(getLocation()?.search || "");
    f.search = params.get("search") || "";
    f.category = params.get("category") || "";
    f.condition = (params.get("condition") || "").split(",").filter(Boolean);
    f.brand = params.get("brand") || "";
    f.location = params.get("location") || "";
    f.minPrice = params.get("minPrice") || "";
    f.maxPrice = params.get("maxPrice") || "";
    f.negotiable = params.get("negotiable") === "true";
    f.exchangeable = params.get("exchangeable") === "true";
    f.minRating = params.get("minRating") || "";
    f.sort = params.get("sort") || "newest";
    f.page = Number(params.get("page") || 1);
  }

  const activeFilterCount = () =>
    [f.category, f.brand, f.location, f.minPrice, f.maxPrice, f.minRating].filter(Boolean).length +
    f.condition.length +
    (f.negotiable ? 1 : 0) +
    (f.exchangeable ? 1 : 0);

  // ---------- teardown ----------

  /**
   * The router has no unmount hook, so a shopper who filtered their way on to
   * /compare would otherwise leave a detached Explore page subscribed to the
   * compare and auth stores, repainting on every change. Connection is the only
   * test, for the reason documented in Home.js: the window between building a
   * page and mounting it is synchronous, so no store event can arrive inside it.
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

  /**
   * The load effect, keyed on the query string.
   *
   * React ran this for every change to `searchParams.toString()`, so categories
   * and the wishlist were refetched on each one too. That looks wasteful, but it
   * is what the page did, and the wishlist in particular is what keeps a heart
   * filled after a filter change.
   */
  let loadToken = 0;

  async function load() {
    const token = ++loadToken;
    state.loading = true;
    paint();

    try {
      const params = new URLSearchParams();
      if (f.search) params.set("search", f.search);
      if (f.category) params.set("category", f.category);
      if (f.condition.length) params.set("condition", f.condition.join(","));
      if (f.brand) params.set("brand", f.brand);
      if (f.location) params.set("location", f.location);
      if (f.minPrice) params.set("minPrice", f.minPrice);
      if (f.maxPrice) params.set("maxPrice", f.maxPrice);
      if (f.negotiable) params.set("negotiable", "true");
      if (f.exchangeable) params.set("exchangeable", "true");
      if (f.minRating) params.set("minRating", f.minRating);
      params.set("sort", f.sort);
      params.set("page", String(f.page));
      params.set("limit", String(PER_PAGE));

      const [pRes, cRes, wRes] = await Promise.all([
        api.get(`/products?${params}`),
        api.get("/products/categories"),
        api.get("/wishlist").catch(() => null),
      ]);
      // A filter re-queries on every keystroke, so two loads can be in flight
      // and the older one can resolve last. React would have painted the stale
      // response; taking the newest response instead is the same last-writer-
      // wins guarantee the router already makes about page modules, and it is
      // the only way a fast search ends up showing the wrong listing.
      if (token !== loadToken) return;
      state.products = pRes.data.products;
      state.total = pRes.data.total;
      state.categories = cRes.data.categories;
      state.wishlistIds = new Set((wRes?.data?.products || []).map((w) => String(w._id)));
      if (f.search) behavior.search(f.search, f.category);
    } catch {
      /* React swallowed this too: an empty result renders the empty state. */
    }
    if (token !== loadToken) return;
    state.loading = false;
    paint();
  }

  // ---------- filters ----------

  /**
   * `setSearchParams` as this page uses it: set or delete one key, and drop
   * `page` unless `page` is what changed, so a new filter starts at the first
   * page instead of stranding the shopper on an empty page 4.
   */
  function updateFilter(key, value) {
    const params = new URLSearchParams(getLocation()?.search || "");
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    const query = params.toString();
    navigate(`/products${query ? `?${query}` : ""}`);
  }

  function toggleCondition(c) {
    const next = f.condition.includes(c) ? f.condition.filter((x) => x !== c) : [...f.condition, c];
    updateFilter("condition", next.join(","));
  }

  /** `setSearchParams(search ? { search } : {})` - a keyword survives a clear. */
  function clearAll() {
    navigate(f.search ? `/products?search=${encodeURIComponent(f.search)}` : "/products");
  }

  // ---------- wishlist ----------

  async function toggleWishlist(productId) {
    const present = state.wishlistIds.has(String(productId));
    let changed = false;
    try {
      if (present) {
        // The DELETE route is keyed on the wishlist entry, not the product, so
        // the entry has to be looked up first. React re-read the list here too.
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

  /**
   * Put the keyboard back on the control that caused a repaint.
   *
   * React reused the clicked button's node, so a shopper tabbing to a heart
   * stayed on that heart. Replacing the grid drops the focused node, so the
   * equivalent control on the same product is re-focused afterwards.
   */
  function focusCardControl(kind, productId) {
    const id = String(productId);
    const labels =
      kind === "wishlist"
        ? ['button[aria-label="Save to wishlist"]', 'button[aria-label="Remove from wishlist"]']
        : ['button[aria-label="Add to compare"]', 'button[aria-label="Remove from compare"]'];
    for (const anchor of root.querySelectorAll("a[data-products-card]")) {
      if (anchor.dataset.productsCard !== id) continue;
      for (const sel of labels) {
        const el = anchor.querySelector(sel);
        if (el) {
          el.focus();
          return;
        }
      }
    }
  }

  // ---------- persistent masthead ----------

  const title = h("h1", { className: "page-title" });
  const countBadge = h("span", { className: "badge badge-primary" });

  // Five text nodes, because the JSX had five interpolations and React kept
  // each as its own node rather than concatenating the sentence into one.
  const subNodes = Array.from({ length: 5 }, () => document.createTextNode(""));
  const sub = h("p", { className: "page-sub" }, ...subNodes);

  const filtersBadge = h("span", {
    className:
      "ml-0.5 min-w-[20px] h-5 px-1.5 bg-primary text-white text-2xs rounded-full flex items-center justify-center",
  });

  const filtersButton = h(
    "button",
    { type: "button", className: "btn-secondary flex-none" },
    icon("SlidersHorizontal", { size: 16 }),
    "Filters",
    filtersBadge
  );

  // React renders the chip rail as a sibling of the header row and drops it
  // outright for a keyword search or an empty category list, so it needs a
  // comment node in that exact position rather than a container to fill.
  const sRail = slot("products-rail");

  const masthead = h(
    "header",
    { className: "page-masthead" },
    h(
      "div",
      { className: `${CONTAINER} pt-8 pb-7` },
      h(
        "div",
        { className: "flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4" },
        h(
          "div",
          { className: "min-w-0" },
          h("p", { className: "page-eyebrow" }, icon("Rows3", { size: 13 }), " Marketplace"),
          h("div", { className: "flex items-center gap-2.5 flex-wrap" }, title, countBadge),
          sub
        ),
        filtersButton
      ),
      sRail.node
    )
  );

  // ---------- persistent filter panel ----------

  // A <select> may only hold <option>/<optgroup>, so there is no host element to
  // park the API categories in. The options are swapped inside the <select>
  // itself, which is also what React does when the category list arrives - the
  // select element is never replaced, so an open dropdown keeps its state.
  const categorySelect = h(
    "select",
    { className: "select-field", onChange: (e) => updateFilter("category", e.target.value) },
    h("option", { value: "" }, "All categories")
  );

  function renderCategoryOptions() {
    categorySelect.replaceChildren(
      h("option", { value: "" }, "All categories"),
      ...state.categories.map((c) => h("option", { value: c._id }, c.name))
    );
    setValue(categorySelect, f.category || "");
  }

  const conditionHost = h("div", { className: "flex flex-wrap gap-2 pt-0.5" });

  // No `type` on the text inputs, because the React ones had none: an untyped
  // input is a text input, and emitting `type="text"` would differ from the JSX.
  const locationInput = h("input", {
    placeholder: "e.g. Mumbai, Delhi",
    className: "input-field",
    onInput: (e) => updateFilter("location", e.target.value),
  });

  const minPriceInput = h("input", {
    type: "number",
    placeholder: "Min",
    className: "input-field",
    onInput: (e) => updateFilter("minPrice", e.target.value),
  });

  const maxPriceInput = h("input", {
    type: "number",
    placeholder: "Max",
    className: "input-field",
    onInput: (e) => updateFilter("maxPrice", e.target.value),
  });

  const brandInput = h("input", {
    placeholder: "Apple, Dell, Sony…",
    className: "input-field",
    onInput: (e) => updateFilter("brand", e.target.value),
  });

  const ratingSelect = h(
    "select",
    { className: "select-field", onChange: (e) => updateFilter("minRating", e.target.value) },
    h("option", { value: "" }, "Any rating"),
    h("option", { value: "4" }, "4★ & up"),
    h("option", { value: "4.5" }, "4.5★ & up")
  );

  const clearHeadHost = h("div");

  const negotiableBox = h("input", {
    type: "checkbox",
    className: "checkbox-field",
    onChange: (e) => updateFilter("negotiable", e.target.checked ? "true" : ""),
  });

  const exchangeableBox = h("input", {
    type: "checkbox",
    className: "checkbox-field",
    onChange: (e) => updateFilter("exchangeable", e.target.checked ? "true" : ""),
  });

  const sortSelect = h(
    "select",
    { className: "select-field w-auto input-field-sm", onChange: (e) => updateFilter("sort", e.target.value) },
    ...SORT_OPTIONS.map((o) => h("option", { value: o.value }, o.label))
  );

  const panel = h(
    "div",
    { className: "panel mb-6 animate-slide-down" },
    h(
      "div",
      { className: "panel-head" },
      h(
        "div",
        null,
        h("h2", { className: "panel-title" }, "Refine your search"),
        h("p", { className: "panel-sub" }, "Narrow by category, condition, price and trust signals")
      ),
      clearHeadHost
    ),
    h(
      "div",
      { className: "p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" },
      h("div", null, h("label", { className: "input-label" }, "Category"), categorySelect),
      h("div", null, h("label", { className: "input-label" }, "Condition"), conditionHost),
      h("div", null, h("label", { className: "input-label" }, "Location"), locationInput),
      h(
        "div",
        null,
        h("label", { className: "input-label" }, "Price range (₹)"),
        h("div", { className: "flex items-center gap-2" }, minPriceInput, h("span", { className: "text-muted-soft" }, "–"), maxPriceInput)
      ),
      h("div", null, h("label", { className: "input-label" }, "Brand"), brandInput),
      h("div", null, h("label", { className: "input-label" }, "Minimum rating"), ratingSelect)
    ),
    h(
      "div",
      { className: "px-5 py-4 border-t border-line bg-raised flex flex-wrap items-center justify-between gap-4" },
      h(
        "div",
        { className: "flex flex-wrap items-center gap-x-6 gap-y-2" },
        h(
          "label",
          { className: "flex items-center gap-2.5 cursor-pointer select-none" },
          negotiableBox,
          h("span", { className: "text-[13px] font-semibold text-ink-800" }, "Negotiable only")
        ),
        h(
          "label",
          { className: "flex items-center gap-2.5 cursor-pointer select-none" },
          exchangeableBox,
          h("span", { className: "text-[13px] font-semibold text-ink-800" }, "Accept exchange")
        )
      ),
      h(
        "div",
        { className: "flex items-center gap-2" },
        h("label", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, "Sort"),
        sortSelect
      )
    )
  );

  const sPanel = slot("products-panel");
  const sResults = slot("products-results");
  const sPager = slot("products-pager");

  // ---------- persistent toolbar ----------

  const toolbarCount = h("p", { className: "text-sm text-muted font-medium" });

  const gridTab = h(
    "button",
    {
      "aria-label": "Grid view",
      className: "tab !px-2.5",
      onClick: () => {
        state.view = "grid";
        paint();
      },
    },
    icon("LayoutGrid", { size: 16 })
  );

  const listTab = h(
    "button",
    {
      "aria-label": "List view",
      className: "tab !px-2.5",
      onClick: () => {
        state.view = "list";
        paint();
      },
    },
    icon("List", { size: 16 })
  );

  const toolbar = h(
    "div",
    { className: "flex items-center justify-between gap-3 mb-5" },
    toolbarCount,
    h("div", { className: "tab-list" }, gridTab, listTab)
  );

  const root = h(
    "div",
    { className: "animate-fade-in" },
    masthead,
    h("div", { className: `${CONTAINER} py-6 lg:py-8` }, sPanel.node, toolbar, sResults.node, sPager.node)
  );

  // ---------- builders ----------

  function renderRail() {
    // Rebuilt rather than edited: the rail is a set of chips whose active one
    // moves, and there is no input caret to protect inside it. React returned
    // nothing at all when searching or when the category list is empty, so the
    // rail node is swapped out for the comment rather than merely emptied.
    sRail.set(
      f.search || !state.categories.length
        ? null
        : h(
            "div",
            { className: "flex gap-2 flex-wrap mt-6 -mb-1" },
            h("button", { onClick: () => updateFilter("category", ""), className: !f.category ? "chip-active" : "chip-idle" }, "All"),
            ...state.categories.slice(0, 9).map((c) =>
              h(
                "button",
                { onClick: () => updateFilter("category", c._id), className: f.category === c._id ? "chip-active" : "chip-idle" },
                c.name
              )
            )
          )
    );
  }

  function renderPanel() {
    // A select's options are a set, not a value, so they are replaced; the
    // select node itself survives, which is what keeps its open dropdown state
    // and the caret in a sibling field intact.
    renderCategoryOptions();

    mount(
      conditionHost,
      CONDITIONS.map((c) => {
        const active = f.condition.includes(c);
        const chip = h(
          "button",
          {
            onClick: () => toggleCondition(c),
            className: active ? "chip bg-primary-soft text-primary border-brand-200" : "chip-idle",
          },
          document.createTextNode(c)
        );
        // The tick is a sibling that exists only while the condition is on, so
        // it is inserted and removed rather than hidden.
        if (active) chip.prepend(icon("Check", { size: 12 }));
        return chip;
      })
    );

    setValue(locationInput, f.location);
    setValue(minPriceInput, f.minPrice);
    setValue(maxPriceInput, f.maxPrice);
    setValue(brandInput, f.brand);
    setValue(ratingSelect, f.minRating);
    setValue(sortSelect, f.sort);
    negotiableBox.checked = f.negotiable;
    exchangeableBox.checked = f.exchangeable;

    mount(
      clearHeadHost,
      activeFilterCount() > 0 ? h("button", { onClick: clearAll, className: "btn-quiet btn-sm" }, "Clear all") : null
    );

    // Attached only while the drawer is open, and only when it is not already
    // attached - a URL change must not detach it, or every character typed in
    // Brand would drop the caret.
    if (state.showFilters) sPanel.set(panel);
    else sPanel.set(null);
  }

  function card(p) {
    return A(
      `/products/${p._id}`,
      { className: "block h-full", dataset: { productsCard: String(p._id) } },
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

  /**
   * The list row.
   *
   * React wrote this as raw markup rather than reusing ProductCard, so it is
   * built here too: a shopper who picks List gets the wide two-column row, not a
   * stretched card. The image is assembled the way the JSX assembled it - `alt`
   * from the product plus only `src`/`onError` from `imageProps`, which in the
   * React build carried no `loading`. The vanilla helper adds `loading="lazy"`,
   * deliberately not applied here so the two frontends emit the same element.
   */
  function listRow(p) {
    const { onError } = imageProps(p, 0, p.title);
    return A(
      `/products/${p._id}`,
      { className: "card card-hover p-4 group flex gap-4" },
      h(
        "div",
        { className: "w-28 h-24 sm:w-36 sm:h-28 rounded-xl bg-sunken overflow-hidden flex-none" },
        h("img", { alt: p.title, src: getProductImage(p), onError, className: "w-full h-full object-cover" })
      ),
      h(
        "div",
        { className: "flex-1 min-w-0 flex flex-col" },
        h(
          "div",
          { className: "flex items-center gap-2 flex-wrap" },
          h("span", { className: "badge badge-neutral" }, p.brand),
          h("span", { className: `badge border ${conditionTone(p.condition)}` }, p.condition),
          p.negotiable ? h("span", { className: "badge badge-accent" }, "Negotiable") : null,
          p.seller?.isVerifiedSeller ? h("span", { className: "badge badge-success" }, "Verified seller") : null
        ),
        h(
          "h3",
          { className: "font-bold text-ink-900 group-hover:text-primary transition-colors line-clamp-1 mt-2" },
          p.title
        ),
        h("p", { className: "text-xs text-muted line-clamp-1 mt-1" }, p.description),
        h(
          "div",
          { className: "flex items-center gap-3 mt-auto pt-2" },
          h("span", { className: "text-lg font-extrabold text-ink-900 tabular" }, formatINR(p.price)),
          p.originalPrice > p.price
            ? h("span", { className: "text-xs text-muted-soft line-through tabular" }, formatINR(p.originalPrice))
            : null,
          p.location
            ? h(
                "span",
                { className: "inline-flex items-center gap-1 text-2xs text-muted ml-auto" },
                icon("MapPin", { size: 11 }),
                " ",
                p.location
              )
            : null
        )
      ),
      h(
        "div",
        { className: "hidden sm:flex flex-col items-end justify-between flex-none" },
        h(
          "span",
          { className: "inline-flex items-center gap-1 text-xs font-bold text-ink-800" },
          icon("Star", { size: 12, className: "text-rating fill-rating" }),
          p.rating ? Number(p.rating).toFixed(1) : "New"
        ),
        h("span", { className: "text-2xs text-muted" }, p.categoryName)
      )
    );
  }

  function renderResults() {
    if (state.loading) {
      return h(
        "div",
        { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
        Array.from({ length: 8 }, () => SkeletonCard())
      );
    }

    if (state.products.length === 0) {
      // React has no separate error state: a rejected request leaves the product
      // list empty, so the customer lands on this panel. Reproduced rather than
      // improved, because the same screen has to cover a genuinely empty result
      // and the React build cannot tell the two apart.
      return h(
        "div",
        { className: "panel" },
        EmptyState({
          iconName: "PackageSearch",
          title: "No products match your filters",
          description: "Try widening the price range, clearing a filter, or searching for something different.",
          action: h("button", { onClick: clearAll, className: "btn-primary" }, "Clear all filters"),
        })
      );
    }

    if (state.view === "list") {
      return h("div", { className: "flex flex-col gap-3" }, state.products.map(listRow));
    }

    return h("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" }, state.products.map(card));
  }

  function renderPager() {
    const totalPages = Math.ceil(state.total / PER_PAGE);
    if (totalPages <= 1) return null;

    return h(
      "div",
      { className: "flex items-center justify-center gap-1.5 mt-10 flex-wrap" },
      pageNumbers(totalPages, f.page).map((pn, idx, arr) =>
        h(
          "span",
          { className: "contents" },
          // The gap marker is emitted by the page that follows it, so the
          // ellipsis lands between the same two numbers React put it between.
          idx > 0 && arr[idx - 1] !== pn - 1
            ? h("span", { className: "text-xs text-muted-soft px-1" }, "…")
            : null,
          h(
            "button",
            {
              onClick: () => updateFilter("page", String(pn)),
              "aria-current": f.page === pn ? "page" : undefined,
              className: cx(
                "min-w-9 h-9 px-2 rounded-lg text-sm font-bold transition-all duration-150",
                f.page === pn
                  ? "bg-primary text-white shadow-glow-primary"
                  : "bg-card border border-line text-muted hover:border-line-strong hover:text-ink-900"
              ),
            },
            pn
          )
        )
      ),
      h("span", { className: "text-xs text-muted ml-3" }, `Page ${f.page} of ${totalPages}`)
    );
  }

  // ---------- painting ----------

  function paint() {
    const activeCategoryName = state.categories.find((c) => c._id === f.category)?.name;
    const count = activeFilterCount();

    title.textContent = f.search ? `Results for “${f.search}”` : activeCategoryName || "All listings";
    countBadge.textContent = state.total;
    subNodes[0].nodeValue = `${state.total} item${state.total === 1 ? "" : "s"}`;
    subNodes[1].nodeValue = activeCategoryName ? ` in ${activeCategoryName}` : "";
    subNodes[2].nodeValue = " from verified sellers";
    subNodes[3].nodeValue = f.location ? ` near ${f.location}` : "";
    subNodes[4].nodeValue = ".";

    filtersButton.className = cx(
      "btn-secondary flex-none",
      state.showFilters ? "!bg-primary-soft !border-brand-200 !text-primary" : ""
    );
    // React mounted the counter only when a filter was active. It is toggled
    // instead of created and destroyed so repainting does not churn the button
    // the shopper is holding the pointer over; `hidden` is the last display
    // utility Tailwind emits, so it wins over the badge's own `flex`.
    filtersBadge.classList.toggle("hidden", count === 0);
    filtersBadge.textContent = count;

    // The rail is a browse affordance and is hidden outright during a keyword
    // search, exactly as React did.
    renderRail();

    // The open drawer is built once and then kept in sync. Its element is never
    // swapped - replacing it would drop the caret and focus out of the field
    // being typed into - while everything inside it is edited in place, which is
    // the part React re-rendered.
    if (state.showFilters) {
      renderPanel();
      if (!sPanel.is(panel)) sPanel.set(panel);
    } else if (sPanel.is(panel)) {
      sPanel.set(null);
    }

    toolbarCount.textContent = state.loading
      ? "Loading listings…"
      : `${state.total} item${state.total === 1 ? "" : "s"} found`;
    gridTab.className = cx("tab !px-2.5", state.view === "grid" ? "tab-active" : "");
    listTab.className = cx("tab !px-2.5", state.view === "list" ? "tab-active" : "");

    sResults.set(renderResults());
    sPager.set(renderPager());
  }

  // The drawer toggle lives in the masthead, which is built above the handler,
  // so it is wired once here rather than on every repaint.
  filtersButton.addEventListener("click", () => {
    state.showFilters = !state.showFilters;
    paint();
  });

  // ---------- subscriptions ----------

  /**
   * `useEffect(..., [searchParams.toString()])`. The router announces every
   * navigation, including a query-string-only one, and this is the only place a
   * filter change becomes a load.
   */
  let lastSearch = getLocation()?.search || "";
  cleanups.push(
    onLocationChange((location) => {
      if (!ensureAlive()) return;
      if (location.search === lastSearch) return;
      lastSearch = location.search;
      sync();
      load();
    })
  );

  /** Compare and auth both feed values into every card, as they did in React. */
  cleanups.push(
    compareStore.subscribe(() => {
      if (!ensureAlive()) return;
      // If a compare button is what the shopper pressed, keep focus on it.
      const active = document.activeElement;
      const label = active?.getAttribute?.("aria-label") || "";
      const kind = /wishlist/i.test(label) ? "wishlist" : /compare/i.test(label) ? "compare" : null;
      const anchor = kind ? active?.closest?.("a[data-products-card]") : null;
      paint();
      if (anchor?.dataset.productsCard) focusCardControl(kind, anchor.dataset.productsCard);
    })
  );

  cleanups.push(
    auth.subscribe(() => {
      if (!ensureAlive()) return;
      // `user` decides whether a card has a compare button at all, so signing in
      // or out has to redraw the grid.
      paint();
    })
  );

  // ---------- first paint ----------

  sync();
  paint();
  load();

  return {
    root,
    dispose() {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    },
  };
}

let cached = null;

/**
 * One instance per visit to the route.
 *
 * A filter change is a navigation, and the router rebuilds the page module on
 * every navigation. Handing back the same root element - as `Layout` does for
 * its own shell - makes that rebuild a no-op, which is what React's stable route
 * element did for free. A real rebuild here would close the filter drawer,
 * reset the grid/list choice and drop the caret mid-word, none of which the
 * React page ever did.
 *
 * Reuse is conditional on the root still being connected. Once the shell has
 * moved on to another route the node is detached, which is React's unmount: the
 * stale instance is disposed and the next visit mounts a fresh one, so a
 * half-finished load can never paint over a different page.
 */
export default function Products() {
  if (cached) {
    if (cached.root.isConnected) return cached.root;
    cached.dispose();
  }
  cached = createProducts();
  return cached.root;
}
