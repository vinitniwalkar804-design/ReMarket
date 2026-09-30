import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import { navigate } from "../navigation.js";
import api from "../services/api.js";
import toast from "../toast.js";
import EmptyState from "../components/empty-state.js";
import Modal from "../components/modal.js";
import StarRating from "../components/star-rating.js";
import compareStore from "../store/compare.js";
import { formatINR, formatNumber } from "../utils/format.js";
import { imageProps } from "../utils/images.js";
import { conditionTone } from "../utils/theme.js";
import {
  buildSections,
  annotateSections,
  priceExtremes,
  ratingExtremes,
  summarise,
  relativeAge,
} from "../utils/compare-rows.js";

/**
 * MERIDIAN compare desk.
 *
 * Ported from the React build's Compare.jsx, which carries this long comment
 * and it still applies here:
 *
 * One question drives this page: "which of these fits my requirements better?"
 * So it is a comparison, not a row of product cards -- every product owns a
 * column, every attribute owns a row, and the rows where the columns disagree
 * are the ones that get marked. No scores and no "Recommended" winner: only
 * arithmetic a customer can verify themselves (lowest price, highest rating)
 * and the raw values.
 *
 * Data comes from the shared compare store, which has already fetched the
 * whole tray in one request by the time this page mounts, so opening Compare
 * costs zero additional product requests. Wishlist/cart membership is hydrated
 * once (two parallel requests) so the column buttons tell the truth.
 *
 * Behaviour parity notes:
 *   - POST /compare/select is only called from the customer's own "This is my
 *     pick" button, and the session duration is measured from the server's
 *     startedAt (falling back to page mount), exactly as in React.
 *   - remove() stays silent because the store reports its own success/failure.
 *   - 404/409 on a column action marks that column "gone" rather than removing
 *     it, and kept this way so the customer can still see what happened.
 *
 * The sticky identity rail is a translated (not sticky-positioned) bar that
 * matches the table's scrollLeft on a scroll, so the rail and the table always
 * line up; overflow is re-measured on resize and on every repaint.
 */

const SECTION_ICONS = {
  package: "Package",
  user: "User",
  tag: "Tag",
  clock: "Clock",
  sliders: "SlidersHorizontal",
};
const COL_MIN = "min-w-[196px] sm:min-w-[236px]";
const LABEL_COL = "w-[124px] sm:w-[172px]";
const DASH = "—";

function SkeletonCompare() {
  return h(
    "div",
    { className: "card overflow-hidden animate-pulse", "aria-hidden": "true" },
    h("div", { className: "h-11 bg-raised border-b border-line" }),
    h(
      "div",
      { className: "flex" },
      h("div", { className: `${LABEL_COL} flex-none border-r border-line bg-raised` }),
      h(
        "div",
        { className: "flex-1 grid grid-cols-3" },
        ...Array.from({ length: 3 }, () =>
          h(
            "div",
            { className: "border-r border-line last:border-r-0 p-4 space-y-3" },
            h("div", { className: "aspect-[4/3] bg-sunken rounded-xl" }),
            h("div", { className: "h-3 bg-sunken rounded w-4/5" }),
            h("div", { className: "h-5 bg-sunken rounded w-1/2" })
          )
        )
      )
    ),
    h(
      "div",
      { className: "divide-y divide-line" },
      ...Array.from({ length: 7 }, () =>
        h(
          "div",
          { className: "flex items-center gap-4 px-4 py-4" },
          h("div", { className: "h-2.5 bg-sunken rounded w-24 flex-none" }),
          h(
            "div",
            { className: "flex-1 flex gap-4" },
            ...Array.from({ length: 3 }, () => h("div", { className: "h-2.5 bg-sunken rounded flex-1" }))
          )
        )
      )
    )
  );
}

export default function Compare() {
  const ui = { scroller: null, railWrap: null, railInner: null, overflowKnown: false, homing: false };
  let disposed = false;
  const cleanups = [];

  const root = h("div", null);
  const pageHost = h("div", null);
  const modalHost = h("div", null);

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

  // ---------- local state ----------
  const st = {
    onlyDiffs: false,
    wishlistIds: new Set(),
    cartIds: new Set(),
    busy: {},
    gone: new Set(),
    offerFor: null,
    offerAmount: "",
    offerBusy: false,
    closing: false,
    closedWith: null,
    hydrated: false,
  };
  const mountedAt = Date.now();

  // ---------- membership hydration (once) ----------
  const hydrate = async () => {
    if (st.hydrated) return;
    st.hydrated = true;
    const [wl, cart] = await Promise.all([
      api.get("/wishlist").catch(() => null),
      api.get("/cart").catch(() => null),
    ]);
    if (!ensureAlive()) return;
    st.wishlistIds = new Set((wl?.data?.products || []).map((w) => String(w._id)));
    st.cartIds = new Set((cart?.data?.products || []).map((c) => String(c._id)));
    repaint(false);
  };

  // ---------- measurement ----------
  const measure = () => {
    const el = ui.scroller;
    if (!el) return;
    const o = el.scrollWidth - el.clientWidth > 8;
    if (ui.railWrap) ui.railWrap.classList.toggle("hidden", !o);
    if (o) transformRail();
    if (ui.overflowKnown !== o) {
      ui.overflowKnown = o;
      requestAnimationFrame(() => {
        if (ensureAlive()) repaint(false);
      });
    }
  };

  const transformRail = () => {
    if (!ui.scroller || !ui.railInner) return;
    ui.railInner.style.transform = `translateX(-${ui.scroller.scrollLeft}px)`;
    ui.railInner.style.transition = "transform 80ms linear";
  };

  const onTableScroll = (e) => {
    if (e.currentTarget.scrollWidth - e.currentTarget.clientWidth > 8) {
      if (ui.railWrap) ui.railWrap.classList.remove("hidden");
    } else {
      if (ui.railWrap) ui.railWrap.classList.add("hidden");
    }
    transformRail();
  };

  const onResize = () => measure();

  // ---------- actions ----------
  const markGone = (id) => {
    const next = new Set(st.gone);
    next.add(String(id));
    st.gone = next;
    repaint(true);
  };

  const handleRemove = (id) => {
    compareStore.remove(id);
  };

  const setBusy = (id, kind) => {
    const next = { ...st.busy };
    if (kind === null) delete next[id];
    else next[id] = kind;
    st.busy = next;
  };

  const handleWishlist = async (product) => {
    const id = String(product._id);
    const saved = st.wishlistIds.has(id);
    setBusy(id, "wishlist");
    try {
      if (saved) await api.delete(`/wishlist/${id}`);
      else await api.post("/wishlist", { productId: id });
      const next = new Set(st.wishlistIds);
      if (saved) next.delete(id);
      else next.add(id);
      st.wishlistIds = next;
      toast.success(saved ? "Removed from wishlist" : "Saved to wishlist", { icon: "✓" });
      repaint(true);
    } catch (err) {
      if (err?.response?.status === 404) markGone(id);
      toast.error(err?.response?.data?.message || "Could not update wishlist", { icon: "⚠️" });
    } finally {
      setBusy(id, null);
    }
  };

  const handleAddToCart = async (product) => {
    const id = String(product._id);
    setBusy(id, "cart");
    try {
      await api.post("/cart", { productId: id });
      st.cartIds = new Set(st.cartIds).add(id);
      toast.success("Added to cart", {
        icon: "✓",
        action: { label: "View cart", onClick: () => navigate("/cart") },
      });
    } catch (err) {
      if ([404, 409].includes(err?.response?.status)) markGone(id);
      toast.error(err?.response?.data?.message || "Could not add to cart", { icon: "⚠️" });
    } finally {
      setBusy(id, null);
    }
  };

  const openOffer = (product) => {
    st.offerFor = product;
    st.offerAmount = "";
    renderModal();
  };

  const closeOffer = () => {
    st.offerFor = null;
    st.offerAmount = "";
    renderModal();
  };

  const sendOffer = async () => {
    if (!st.offerFor) return;
    const amount = Number(st.offerAmount);
    const id = String(st.offerFor._id);
    if (!amount || amount <= 0) {
      toast.error("Enter the amount you want to offer", { icon: "⚠️" });
      return;
    }
    if (amount >= st.offerFor.price) {
      toast.error("An offer must be below the listed price", { icon: "⚠️" });
      return;
    }
    st.offerBusy = true;
    renderModal();
    try {
      await api.post("/offers", { productId: id, offerAmount: amount });
      toast.success("Offer sent to the seller", { icon: "✓" });
      st.offerFor = null;
      st.offerAmount = "";
    } catch (err) {
      if ([404, 409].includes(err?.response?.status)) markGone(id);
      toast.error(err?.response?.data?.message || "Could not send offer", { icon: "⚠️" });
    } finally {
      st.offerBusy = false;
      renderModal();
    }
  };

  const choose = async (product) => {
    const id = String(product._id);
    st.closing = true;
    repaint(true);
    try {
      const fresh = compareStore.getState();
      const from = fresh.startedAt ? new Date(fresh.startedAt).getTime() : mountedAt;
      const durationSec = Number.isFinite(from) ? Math.max(0, Math.round((Date.now() - from) / 1000)) : 0;
      await api.post("/compare/select", { productId: id, durationSec });
      st.closedWith = product;
      await compareStore.refreshCompare();
      toast.success(`Choice recorded — ${product.title}`, {
        icon: "✓",
        duration: 4500,
        action: { label: "View offers", onClick: () => navigate("/offers") },
      });
      st.closing = false;
      repaint(true);
    } catch (err) {
      st.closing = false;
      toast.error(err?.response?.data?.message || "Could not record your choice", { icon: "⚠️" });
      repaint(true);
    }
  };

  // ---------- render pieces ----------
  const masthead = (s) =>
    h(
      "header",
      { className: "page-masthead" },
      h(
        "div",
        { className: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-7" },
        h(
          "div",
          { className: "flex flex-wrap items-end justify-between gap-4" },
          h(
            "div",
            { className: "min-w-0" },
            h("p", { className: "page-eyebrow" }, icon("ArrowLeftRight", { size: 13 }), " Decision desk"),
            h(
              "div",
              { className: "flex items-center gap-2.5" },
              h("h1", { className: "page-title" }, "Compare Products"),
              h(
                "span",
                {
                  className: `badge ${s.trayFull ? "badge-warning" : "badge-primary"} tabular`,
                  title: `${s.count} of a maximum of ${s.max} products selected`,
                },
                `${s.count} / ${s.max}`
              )
            ),
            h("p", { className: "page-sub" }, "Compare products side-by-side before you decide.")
          ),
          s.visibleCount > 0
            ? h(
                "div",
                { className: "flex flex-wrap items-center gap-2" },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      st.onlyDiffs = !st.onlyDiffs;
                      repaint(false);
                    },
                    "aria-pressed": String(st.onlyDiffs),
                    className: `chip ${st.onlyDiffs ? "chip-active" : "chip-idle"}`,
                    title: "Show only the attributes where these products differ",
                  },
                  icon("Scale", { size: 13 }),
                  st.onlyDiffs ? " Showing differences" : " Show differences only"
                ),
                !s.trayFull
                  ? h("a", { href: "/products", className: "btn-secondary btn-sm" }, icon("Plus", { size: 14 }), " Add products")
                  : null,
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      compareStore.clearAll();
                    },
                    className: "btn-quiet btn-sm text-muted hover:text-danger",
                    title: "Remove every product from this comparison",
                  },
                  icon("Trash2", { size: 14 }),
                  " Clear all"
                )
              )
            : null
        ),
        s.visibleCount > 1
          ? h(
              "p",
              { className: "mt-3 text-2xs text-muted flex items-center gap-1.5" },
              icon("Info", { size: 12, className: "flex-none" }),
              h(
                "span",
                null,
                `${s.diffRows} of ${s.totalRows} attributes differ between these products${s.price.distinct ? `, with a ${formatINR(s.price.spread)} price spread` : ""}.`
              )
            )
          : null
      )
    );

  const productColumn = (p, i, total, s) => {
    const id = String(p._id);
    const unavailable = st.gone.has(id) || p.status !== "available";
    const unavailableReason = st.gone.has(id) ? "gone" : p.status;

    if (unavailable) {
      return h(
        "div",
        { className: "p-4 text-center" },
        h(
          "div",
          { className: "aspect-[4/3] rounded-xl bg-sunken border border-dashed border-line flex items-center justify-center" },
          icon("PackageX", { size: 26, className: "text-muted-soft" })
        ),
        h("p", { className: "mt-3 text-sm font-extrabold text-ink-900" }, "Product unavailable"),
        h(
          "p",
          { className: "text-2xs text-muted mt-1 leading-relaxed" },
          unavailableReason === "removed"
            ? "This listing has been deleted by the seller."
            : unavailableReason === "sold"
              ? "This listing has been sold."
              : unavailableReason === "reserved"
                ? "This listing is currently reserved."
                : "This listing is no longer available."
        ),
        h("p", { className: "text-2xs text-muted-soft mt-1.5 line-clamp-2" }, p.title),
        h("button", { type: "button", onClick: () => handleRemove(id), className: "btn-secondary btn-sm w-full mt-3" }, icon("Trash2", { size: 13 }), " Remove from Compare")
      );
    }

    const working = Boolean(st.busy[id]);
    const offerOpen = p.negotiable;
    const wishlisted = st.wishlistIds.has(id);
    const inCart = st.cartIds.has(id);
    const busy = st.busy[id];

    return h(
      "div",
      { className: "p-3.5 flex flex-col gap-3" },
      h(
        "a",
        { href: `/products/${id}`, className: "block aspect-[4/3] rounded-xl bg-sunken overflow-hidden border border-line group focus-ring", tabindex: "-1", "aria-hidden": "true" },
        h("img", { ...imageProps(p), alt: "", className: "w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" })
      ),
      h(
        "div",
        { className: "min-w-0" },
        h(
          "div",
          { className: "flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft" },
          h("span", { className: "truncate" }, p.brand || "Unbranded"),
          h("span", { className: "dot flex-none" }),
          h("span", { className: "truncate" }, p.categoryName)
        ),
        h(
          "a",
          { href: `/products/${id}`, className: "block text-sm font-bold text-ink-900 hover:text-primary transition-colors line-clamp-2 leading-snug mt-1 rounded", title: p.title },
          p.title
        )
      ),
      h(
        "div",
        null,
        h(
          "div",
          { className: "flex items-baseline gap-2 flex-wrap" },
          h("span", { className: "text-xl font-extrabold text-ink-900 tracking-tight tabular" }, formatINR(p.price)),
          p.originalPrice > p.price
            ? h("span", { className: "text-xs font-medium text-muted-soft line-through tabular" }, formatINR(p.originalPrice))
            : null
        ),
        h(
          "div",
          { className: "flex flex-wrap gap-1.5 mt-2" },
          h("span", { className: `badge border ${conditionTone(p.condition)}` }, p.condition),
          s.price.distinct && id === s.price.lowestId
            ? h("span", { className: "badge badge-success" }, icon("TrendingDown", { size: 10 }), " Lowest")
            : null,
          s.price.distinct && id === s.price.highestId ? h("span", { className: "badge badge-outline" }, "Highest") : null,
          s.rating.distinct && id === s.rating.highestId
            ? h("span", { className: "badge badge-warning" }, icon("Star", { size: 9, className: "fill-current" }), " Top rated")
            : null
        )
      ),
      h(
        "div",
        { className: "text-2xs text-muted space-y-1" },
        h(
          "p",
          { className: "flex items-center gap-1.5 min-w-0" },
          p.seller?.isVerifiedSeller
            ? icon("BadgeCheck", { size: 12, className: "text-success flex-none" })
            : icon("User", { size: 12, className: "text-muted-soft flex-none" }),
          h("span", { className: "truncate font-semibold text-ink-800" }, p.seller?.name || p.sellerName || "ReMarket seller")
        ),
        Number(p.seller?.sellerRating) > 0
          ? h(
              "p",
              { className: "flex items-center gap-1.5" },
              StarRating({ value: p.seller.sellerRating, size: 11 }),
              h("span", { className: "font-bold text-ink-800 tabular" }, Number(p.seller.sellerRating).toFixed(1)),
              h("span", { className: "text-muted-soft" }, `(${p.seller.sellerRatingCount || 0})`)
            )
          : null,
        p.location
          ? h(
              "p",
              { className: "flex items-center gap-1.5 min-w-0" },
              icon("MapPin", { size: 11, className: "text-muted-soft flex-none" }),
              h("span", { className: "truncate" }, p.location)
            )
          : null,
        h("p", { className: "text-muted-soft" }, relativeAge(p.createdAt))
      ),
      h(
        "div",
        { className: "mt-auto pt-1 space-y-2" },
        h(
          "div",
          { className: "grid grid-cols-2 gap-2" },
          h("button", { type: "button", onClick: () => navigate(`/products/${id}`), className: "btn-primary btn-sm col-span-2", title: "Open the full listing for this product" }, icon("ExternalLink", { size: 13 }), " View details"),
          h(
            "button",
            {
              type: "button",
              onClick: () => handleWishlist(p),
              disabled: String(Boolean(working)),
              "aria-pressed": String(wishlisted),
              title: wishlisted ? "Remove from wishlist" : "Save to wishlist",
              className: `btn-secondary btn-sm ${wishlisted ? "!bg-danger-soft !border-danger/25 !text-danger" : ""}`,
            },
            busy === "wishlist" ? icon("Loader2", { size: 13, className: "animate-spin" }) : icon("Heart", { size: 13, className: wishlisted ? "fill-current" : "" }),
            wishlisted ? " Saved" : " Save"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => handleAddToCart(p),
              disabled: String(Boolean(working || inCart)),
              title: inCart ? "Already in your cart" : "Add to cart",
              className: "btn-secondary btn-sm",
            },
            busy === "cart" ? icon("Loader2", { size: 13, className: "animate-spin" }) : icon("ShoppingCart", { size: 13 }),
            inCart ? " In cart" : " Cart"
          ),
          offerOpen
            ? h("button", { type: "button", onClick: () => openOffer(p), disabled: String(Boolean(working)), className: "btn-secondary btn-sm col-span-2", title: `Send a price offer to the seller of ${p.title}` }, icon("Tag", { size: 13 }), " Make offer")
            : null
        ),
        h("button", { type: "button", onClick: () => handleRemove(id), className: "btn-quiet btn-sm w-full text-muted hover:text-danger", title: "Remove this product from the comparison" }, icon("X", { size: 13 }), " Remove"),
        h("p", { className: "text-[10px] text-muted-soft text-center leading-snug" }, `Column ${i + 1} of ${total}`)
      )
    );
  };

  const offerModal = () =>
    Modal({
      open: Boolean(st.offerFor),
      onClose: closeOffer,
      title: "Make an offer",
      subtitle: st.offerFor ? `${st.offerFor.title} — listed at ${formatINR(st.offerFor.price)}` : "",
      children: offerModalBody(),
      footer: h(
        "div",
        { className: "contents" },
        h("button", { type: "button", onClick: closeOffer, className: "btn-secondary" }, "Cancel"),
        h("button", { type: "button", onClick: sendOffer, disabled: String(st.offerBusy), className: "btn-primary" }, st.offerBusy ? icon("Loader2", { size: 15, className: "animate-spin" }) : icon("Tag", { size: 15 }), " Send offer")
      ),
    });

  const renderModal = () => {
    if (!ensureAlive()) return;
    const m = offerModal();
    modalHost.replaceChildren();
    if (m) modalHost.appendChild(m);
  };

  const offerModalBody = () => {
    const offerFor = st.offerFor;
    if (!offerFor) return null;
    const price = offerFor.price || 0;
    const max = Math.max(1, Math.floor(price - 1));

    const input = h("input", {
      id: "offer-amount",
      type: "number",
      inputMode: "numeric",
      min: "1",
      max: String(max),
      value: st.offerAmount,
      placeholder: String(Math.round(price * 0.9)),
      className: "input-field pl-8 tabular",
    });
    input.addEventListener("input", (e) => {
      st.offerAmount = e.target.value;
    });

    return h(
      "div",
      { className: "space-y-4" },
      h(
        "div",
        null,
        h("label", { for: "offer-amount", className: "input-label" }, "Your offer"),
        h(
          "div",
          { className: "relative" },
          h("span", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted pointer-events-none", "aria-hidden": "true" }, "\u20B9"),
          input
        ),
        h("p", { className: "input-hint" }, `Must be below ${formatINR(price)}. Suggested around ${formatINR(Math.round(price * 0.9))}.`)
      ),
      h(
        "div",
        { className: "flex flex-wrap gap-2" },
        ...[0.95, 0.9, 0.85, 0.8].map((factor) => {
          const value = Math.round(price * factor);
          return h("button", { key: factor, type: "button", onClick: () => { st.offerAmount = String(value); input.value = String(value); }, className: "chip-idle tabular" }, formatINR(value));
        })
      ),
      h(
        "p",
        { className: "text-2xs text-muted flex items-start gap-1.5 leading-relaxed" },
        icon("Info", { size: 12, className: "flex-none mt-px" }),
        "Offers are recorded against this listing so the seller can accept, decline or counter. You can also message the seller from the product page."
      )
    );
  };

  const atAGlance = (products) => {
    const s = summarise(products);
    const tiles = [
      {
        icon: "TrendingDown",
        tone: "bg-success-soft text-success",
        label: "Price range",
        value: s.minPrice === s.maxPrice ? formatINR(s.minPrice) : `${formatINR(s.minPrice)} – ${formatINR(s.maxPrice)}`,
        sub: s.maxPrice > s.minPrice ? `${formatINR(s.maxPrice - s.minPrice)} spread` : "All listed at the same price",
      },
      {
        icon: "Package",
        tone: "bg-primary-soft text-primary",
        label: "Conditions",
        value: s.conditionSpread.map((c) => c.name).join(" · ") || DASH,
        sub: s.conditionSpread.length > 1 ? "Conditions differ" : "Same condition",
      },
      {
        icon: "Handshake",
        tone: "bg-accent-soft text-accent",
        label: "Open to offers",
        value: `${s.negotiable} of ${s.count}`,
        sub: s.exchangeable ? `${s.exchangeable} accept exchange` : "No exchanges offered",
      },
      {
        icon: "Shield",
        tone: "bg-info-soft text-info",
        label: "Verified sellers",
        value: `${s.verifiedSellers} of ${s.count}`,
        sub: s.locationCount > 1 ? `${s.locationCount} pickup locations` : "One pickup location",
      },
    ];
    return h(
      "div",
      { className: "grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" },
      ...tiles.map((t) =>
        h(
          "div",
          { key: t.label, className: "card p-4 flex items-start gap-3" },
          h("span", { className: `w-9 h-9 rounded-xl ${t.tone} flex items-center justify-center flex-none` }, icon(t.icon, { size: 17 })),
          h(
            "div",
            { className: "min-w-0" },
            h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted" }, t.label),
            h("p", { className: "font-extrabold text-ink-900 text-[15px] leading-snug mt-0.5 break-words" }, t.value),
            h("p", { className: "text-2xs text-muted-soft mt-0.5" }, t.sub)
          )
        )
      )
    );
  };

  // ---------- table ----------
  const table = (s) => {
    const railWrap = h(
      "div",
      { className: "sticky top-[68px] z-30 -mx-4 sm:mx-0 mb-3" },
      h(
        "div",
        { className: "overflow-hidden bg-raised/95 backdrop-blur-sm border-y border-line py-2" },
        (ui.railInner = h(
          "div",
          { className: "flex px-4 sm:px-0", style: { transform: "translateX(0px)", transition: "transform 80ms linear" } },
          h("div", { className: `${LABEL_COL} flex-none` }),
          ...s.products.map((p) =>
            h(
              "div",
              { key: p._id, className: `${COL_MIN} px-1 flex-none` },
              h("p", { className: "truncate text-2xs font-extrabold text-ink-900" }, p.title),
              h("p", { className: "truncate text-[10px] font-semibold text-muted tabular" }, `${formatINR(p.price)} · ${p.condition}`)
            )
          )
        ))
      )
    );

    const scroller = (ui.scroller = h(
      "div",
      { className: "overflow-x-auto rounded-2xl border border-line bg-card shadow-card" },
      h(
        "table",
        { className: "w-full text-sm border-separate border-spacing-0" },
        h("caption", { className: "sr-only" }, `Side-by-side comparison of ${s.products.length} selected products`),
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h(
              "th",
              {
                scope: "col",
                className: `${LABEL_COL} sticky left-0 z-20 bg-raised text-left align-bottom px-4 py-4 border-b border-r border-line`,
              },
              h("span", { className: "label-eyebrow block" }, "Product"),
              h("span", { className: "text-2xs text-muted-soft mt-1 block" }, `${s.products.length} selected`)
            ),
            ...s.products.map((p, i) =>
              h("th", { key: p._id, scope: "col", className: `${COL_MIN} px-0 py-0 align-top border-b border-line bg-card` }, productColumn(p, i, s.products.length, s))
            )
          )
        ),
        h(
          "tbody",
          ...s.visibleSections.map((section) => {
            const rows = st.onlyDiffs ? section.rows.filter((r) => r.differs) : section.rows;
            if (!rows.length) return null;
            const diffCount = rows.filter((r) => r.differs).length;
            return [
              h(
                "tr",
                { key: `${section.key}-head` },
                h(
                  "th",
                  { scope: "colgroup", colSpan: s.products.length + 1, className: "text-left bg-sunken px-4 py-2.5 border-b border-line" },
                  h(
                    "span",
                    { className: "flex items-center gap-2" },
                    icon(SECTION_ICONS[section.icon] || "SlidersHorizontal", { size: 14, className: "text-primary flex-none" }),
                    h("span", { className: "text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-900" }, section.title),
                    st.onlyDiffs
                      ? h("span", { className: "badge badge-primary" }, `${rows.length} differ`)
                      : diffCount > 0
                        ? h("span", { className: "badge badge-outline" }, `${diffCount} of ${rows.length} differ`)
                        : null
                  )
                )
              ),
              ...rows.map((row) =>
                h(
                  "tr",
                  { key: row.key, className: "group/row" },
                  h(
                    "th",
                    {
                      scope: "row",
                      title: row.hint,
                      className: `${LABEL_COL} sticky left-0 z-10 text-left align-middle px-4 py-3 border-b border-r border-line bg-card font-semibold text-xs text-muted group-hover/row:bg-raised transition-colors`,
                    },
                    h(
                      "span",
                      { className: "flex items-start gap-1.5" },
                      h("span", { className: "leading-snug" }, row.label),
                      row.differs
                        ? h("span", { title: "These products differ on this attribute", className: "mt-0.5 w-1.5 h-1.5 rounded-full bg-accent flex-none" })
                        : null
                    )
                  ),
                  ...s.products.map((p) => {
                    const id = String(p._id);
                    const dead = st.gone.has(id) || p.status !== "available";
                    return h(
                      "td",
                      {
                        key: id,
                        className: `px-4 py-3 align-middle border-b border-line text-xs text-ink-700 transition-colors group-hover/row:bg-raised ${dead ? "opacity-50" : ""}`,
                      },
                      dead ? h("span", { className: "text-muted-soft" }, DASH) : row.render(p)
                    );
                  })
                )
              ),
            ];
          }).flat(),
          s.visibleSections.length === 0
            ? h(
                "tr",
                h(
                  "td",
                  { colSpan: s.products.length + 1, className: "px-4 py-10 text-center text-sm text-muted" },
                  icon("Check", { size: 18, className: "text-success mx-auto mb-2" }),
                  "These products match on every attribute ReMarket tracks for them."
                )
              )
            : null,
          h(
            "tr",
            h(
              "th",
              {
                scope: "row",
                className: `${LABEL_COL} sticky left-0 z-10 text-left align-middle px-4 py-3.5 border-b border-line bg-card`,
              },
              h("span", { className: "text-xs font-bold text-ink-900 leading-snug" }, "Your decision"),
              h("span", { className: "text-[10px] text-muted-soft block mt-0.5 leading-snug" }, "Optional")
            ),
            ...s.products.map((p) => {
              const id = String(p._id);
              const dead = st.gone.has(id) || p.status !== "available";
              return h(
                "td",
                { key: id, className: "px-3 py-3.5 align-middle border-b border-line" },
                dead
                  ? h("span", { className: "text-muted-soft text-xs" }, "Product unavailable")
                  : h(
                      "button",
                      {
                        type: "button",
                        onClick: () => choose(p),
                        disabled: String(st.closing),
                        className: "btn-secondary btn-sm w-full",
                        title: `Tell us ${p.title} is the one you are going with. This closes the comparison.`,
                      },
                      st.closing ? icon("Loader2", { size: 13, className: "animate-spin" }) : icon("Check", { size: 13 }),
                      " This is my pick"
                    )
              );
            })
          )
        )
      )
    ));

    scroller.addEventListener("scroll", onTableScroll);
    cleanups.push(() => scroller.removeEventListener("scroll", onTableScroll));

    return [railWrap, scroller];
  };

  const body = (s) => {
    const parts = [
      s.error
        ? h(
            "div",
            { className: "alert alert-warning mb-5" },
            icon("AlertTriangle", { size: 18, className: "flex-none mt-px" }),
            h("p", { className: "text-xs" }, s.error, " Some columns may be out of date.")
          )
        : null,
    ];

    if (s.unavailable.length > 0) {
      parts.push(
        h(
          "div",
          { className: "alert alert-warning mb-5" },
          icon("AlertTriangle", { size: 18, className: "flex-none mt-px" }),
          h(
            "div",
            { className: "min-w-0" },
            h("p", { className: "font-bold" }, `${s.unavailable.length} product${s.unavailable.length === 1 ? "" : "s"} no longer available`),
            h(
              "p",
              { className: "text-xs mt-0.5 opacity-90 leading-relaxed" },
              s.unavailable.map((u) => `${u.title || "A listing"}${u.reason === "removed" ? " (deleted)" : ` (${u.reason})`}`).join(", "),
              " — removed from this comparison."
            )
          )
        )
      );
    }

    parts.push(atAGlance(s.products));

    const [rail, scroller] = table(s);
    ui.railWrap = rail;
    ui.scroller = scroller;

    parts.push(
      h(
        "div",
        { className: "relative" },
        rail,
        scroller,
        s.overflowing
          ? h("p", { className: "mt-2 flex items-center gap-1.5 text-2xs text-muted-soft lg:hidden" }, icon("ChevronRight", { size: 12, className: "flex-none" }), " Swipe the table sideways to see every product")
          : null
      )
    );

    parts.push(
      h(
        "div",
        { className: "mt-5 flex flex-wrap items-center gap-2.5" },
        !s.trayFull ? h("a", { href: "/products", className: "btn-primary" }, icon("Plus", { size: 15 }), " Add another product") : null,
        h("a", { href: "/products", className: "btn-secondary" }, "Continue Shopping"),
        h("button", { type: "button", onClick: () => { compareStore.refreshCompare(); }, className: "btn-quiet btn-sm text-muted" }, icon("RefreshCw", { size: 14 }), " Refresh"),
        h(
          "p",
          { className: "text-2xs text-muted-soft sm:ml-auto text-center sm:text-right max-w-sm leading-relaxed" },
          "Lowest price and top rating are marked because they are the lowest and highest numbers here. Which one matters most is your call — check the condition notes and the seller before you pay."
        )
      )
    );

    if (st.gone.size > 0) {
      parts.push(
        h(
          "p",
          { className: "mt-3 flex items-start gap-1.5 text-2xs text-muted" },
          icon("Info", { size: 12, className: "flex-none mt-px" }),
          h(
            "span",
            null,
            `${formatNumber(st.gone.size)} column(s) became unavailable while you were comparing. They are kept here so you can still see what happened — remove them to tidy up.`
          )
        )
      );
    }

    return h("div", { className: "page-container" }, ...parts);
  };

  const screen = () => {
    const store = compareStore.getState();
    const s = {
      products: store.products,
      unavailable: store.unavailable,
      count: store.count,
      max: store.max,
      status: store.status,
      error: store.error,
      trayFull: store.count >= store.max,
      visibleCount: store.products.length,
    };

    s.sections = annotateSections(buildSections(s.products), s.products);
    s.price = priceExtremes(s.products);
    s.rating = ratingExtremes(s.products);
    s.visibleSections = st.onlyDiffs ? s.sections.filter((sec) => sec.differs) : s.sections;
    s.totalRows = s.sections.reduce((n, sec) => n + sec.rows.length, 0);
    s.diffRows = s.sections.reduce((n, sec) => n + sec.rows.filter((r) => r.differs).length, 0);
    s.overflowing = Boolean(ui.overflowKnown);

    const isLoading = s.status === "loading" || s.status === "idle";

    if (isLoading) {
      return [masthead(s), h("div", { className: "page-container" }, SkeletonCompare())];
    }
    if (s.status === "error" && s.visibleCount === 0) {
      return [
        masthead(s),
        h(
          "div",
          { className: "page-container" },
          h(
            "div",
            { className: "panel" },
            h(
              "div",
              { className: "p-6" },
              h(
                "div",
                { className: "alert alert-danger" },
                icon("AlertTriangle", { size: 18, className: "flex-none mt-px" }),
                h(
                  "div",
                  { className: "min-w-0" },
                  h("p", { className: "font-bold" }, "We couldn't load your comparison"),
                  h("p", { className: "text-xs mt-0.5 opacity-90" }, s.error || "Something went wrong on our side. Your saved comparison is safe.")
                )
              ),
              h(
                "div",
                { className: "flex flex-wrap gap-2.5 mt-5" },
                h("button", { type: "button", onClick: () => { compareStore.refreshCompare(); }, className: "btn-primary" }, icon("RefreshCw", { size: 15 }), " Try again"),
                h("a", { href: "/products", className: "btn-secondary" }, "Explore Products")
              )
            )
          )
        ),
      ];
    }

    if (st.closedWith) {
      const cw = st.closedWith;
      const id = String(cw._id);
      return [
        masthead(s),
        h(
          "div",
          { className: "page-container" },
          h(
            "div",
            { className: "panel max-w-lg mx-auto" },
            h(
              "div",
              { className: "p-7 text-center" },
              h("span", { className: "w-14 h-14 rounded-2xl bg-success-soft text-success flex items-center justify-center mx-auto mb-4" }, icon("Check", { size: 26 })),
              h("h2", { className: "text-lg font-extrabold text-ink-900 tracking-tight" }, "Comparison closed"),
              h(
                "p",
                { className: "text-sm text-muted mt-1.5 leading-relaxed" },
                "You picked ",
                h("span", { className: "font-bold text-ink-900" }, cw.title),
                ` out of ${s.count + 1} product${s.count === 0 ? "" : "s"}. The tray has been emptied, so start a fresh one whenever you are ready to weigh up some more.`
              ),
              h(
                "div",
                { className: "flex items-center gap-3 text-left bg-raised rounded-xl border border-line p-3 mt-5" },
                h("a", { href: `/products/${id}`, className: "w-20 h-16 rounded-lg bg-sunken overflow-hidden flex-none border border-line" }, h("img", { ...imageProps(cw), alt: "", className: "w-full h-full object-cover" })),
                h(
                  "div",
                  { className: "min-w-0 flex-1" },
                  h("p", { className: "text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft" }, "Your pick"),
                  h("p", { className: "text-sm font-bold text-ink-900 line-clamp-1 mt-0.5" }, cw.title),
                  h("p", { className: "text-base font-extrabold text-ink-900 tabular mt-0.5" }, formatINR(cw.price))
                ),
                cw.negotiable
                  ? h("button", { type: "button", onClick: () => { st.closedWith = null; openOffer(cw); }, className: "btn-secondary btn-sm flex-none", title: "Make an offer on the product you chose" }, icon("Tag", { size: 13 }), " Offer")
                  : null
              ),
              h(
                "div",
                { className: "flex flex-wrap justify-center gap-2.5 mt-5" },
                h("a", { href: `/products/${id}`, className: "btn-primary" }, icon("ExternalLink", { size: 15 }), " View this listing"),
                h("a", { href: "/products", className: "btn-secondary" }, icon("Plus", { size: 15 }), " Compare something else")
              )
            )
          )
        ),
      ];
    }

    if (s.visibleCount === 0) {
      return [
        masthead(s),
        h(
          "div",
          { className: "page-container" },
          h(
            "div",
            { className: "panel" },
            h(
              "div",
              { className: "p-6" },
              EmptyState({
                iconName: "ArrowLeftRight",
                title: "Nothing to compare yet",
                description: "Select products from Explore or Product Details to compare them side-by-side.",
                action: h("a", { href: "/products", className: "btn-primary" }, "Explore Products"),
              }),
              h(
                "p",
                { className: "text-center text-2xs text-muted-soft max-w-md mx-auto leading-relaxed -mt-2" },
                `Pick up to ${s.max} listings. ReMarket lines up price, condition, seller trust and every specification the sellers filled in, and marks the rows where they disagree.`
              )
            )
          )
        ),
      ];
    }

    if (s.visibleCount === 1) {
      const only = s.products[0];
      const id = String(only._id);
      return [
        masthead(s),
        h(
          "div",
          { className: "page-container" },
          h(
            "div",
            { className: "alert alert-info mb-5" },
            icon("Info", { size: 18, className: "flex-none mt-px" }),
            h(
              "div",
              null,
              h("p", { className: "font-bold" }, "Add at least one more product to compare"),
              h("p", { className: "text-xs mt-0.5 opacity-90" }, "A comparison needs at least two listings. Yours is saved — add another and the side-by-side table appears here.")
            )
          ),
          h(
            "div",
            { className: "panel max-w-md" },
            h(
              "div",
              { className: "flex gap-4 p-4" },
              h("a", { href: `/products/${id}`, className: "w-28 h-24 rounded-xl bg-sunken overflow-hidden flex-none border border-line" }, h("img", { ...imageProps(only), alt: "", className: "w-full h-full object-cover" })),
              h(
                "div",
                { className: "min-w-0 flex-1" },
                h("p", { className: "text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft" }, `${only.brand || "Unbranded"} · ${only.categoryName}`),
                h("a", { href: `/products/${id}`, className: "block font-bold text-ink-900 hover:text-primary transition-colors line-clamp-2 mt-1" }, only.title),
                h("p", { className: "text-lg font-extrabold text-ink-900 tabular mt-1.5" }, formatINR(only.price)),
                h(
                  "div",
                  { className: "flex flex-wrap gap-1.5 mt-2" },
                  h("span", { className: `badge border ${conditionTone(only.condition)}` }, only.condition),
                  only.negotiable ? h("span", { className: "badge badge-accent" }, "Negotiable") : null
                )
              )
            ),
            h(
              "div",
              { className: "px-4 pb-4 flex flex-wrap gap-2" },
              h("a", { href: "/products", className: "btn-primary btn-sm flex-1" }, icon("Plus", { size: 14 }), " Add another product"),
              h("a", { href: "/products", className: "btn-secondary btn-sm flex-1" }, "Continue Shopping")
            ),
            h("div", { className: "px-4 pb-4 -mt-1" }, h("button", { type: "button", onClick: () => handleRemove(id), className: "btn-quiet btn-sm w-full text-muted hover:text-danger" }, icon("X", { size: 13 }), " Remove from Compare"))
          )
        ),
      ];
    }

    return [masthead(s), body(s)];
  };

  const repaint = (afterStoreEmit) => {
    if (!ensureAlive()) return;
    mount(pageHost, screen());
    if (ui.scroller) {
      requestAnimationFrame(() => measure());
    }
    void afterStoreEmit;
  };

  // ---------- wiring ----------
  mount(root, h("div", { className: "animate-fade-in" }, pageHost, modalHost));
  hydrate();
  repaint(false);

  const unsub = compareStore.subscribe(() => {
    if (!ensureAlive()) return;
    repaint(true);
  });
  cleanups.push(unsub);

  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));

  return root;
}