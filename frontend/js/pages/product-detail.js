import { h, cx, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import auth from "../store/auth.js";
import compareStore from "../store/compare.js";
import behavior from "../utils/behavior.js";
import toast from "../toast.js";
import Modal from "../components/modal.js";
import ProductCard from "../components/product-card.js";
import StarRating from "../components/star-rating.js";
import PriceHistoryChart from "../components/price-history-chart.js";
import { formatINR, formatDate, discountPercent, timeAgo } from "../utils/format.js";
import { conditionTone, listingTone, C } from "../utils/theme.js";
import {
  REPORT_REASONS,
  isModerated,
  listingLabel,
  listingStatusSentence,
  reasonLabel,
} from "../utils/moderation.js";
import { getProductImages, imageProps, PLACEHOLDER_IMAGE } from "../utils/images.js";
import { navigate, getLocation } from "../navigation.js";

/**
 * Product Detail.
 *
 * Ported from the React build's `pages/ProductDetail.jsx`, region for region.
 * The state changes React expressed with `useState` are the same changes
 * expressed here as in-place repaints: the three buy-box toggles, the gallery,
 * the reviews list and the buy dialog repaint the nodes that depend on them and
 * nothing else, so a wishlist click cannot blur the compare button, the compare
 * tray cannot remount the page, and typing an offer cannot rebuild the dialog
 * around the caret.
 *
 * Everything the page talks to is unchanged: the same six parallel reads, the
 * same fire-and-forget `/offers/my`, the same query parameters (`?offer=`,
 * `?review=1`), the same four dialogs, and the same two client behaviour events
 * (`REVIEW_VIEW` on the reviews block, `CHECKOUT_START` on Buy Now). Every other
 * action is a data change the API records itself, so the page sends no event for
 * it - see `utils/behavior.js`.
 */

const PURCHASE_REASONS = ["Reviews", "Best condition", "Price", "Brand", "Verified seller", "Recommended"];

const TRUST = [
  { icon: "Shield", label: "Verified sellers", sub: "Ratings & history" },
  { icon: "RotateCcw", label: "Returnable", sub: "Clear policies" },
  { icon: "ShoppingBag", label: "Local pickup", sub: "Meet & collect" },
];

/** An in-app anchor. The router intercepts same-origin clicks. */
const A = (to, props = {}, ...children) => h("a", { href: to, ...props }, ...children);

/** A replaceable region with no wrapper element of its own. */
function slot(name) {
  let current = document.createComment(name);
  return {
    // A getter, not a snapshot: `set` rebinds `current`, and every renderer
    // re-reads `.node` to place the region in the tree it is about to build. A
    // snapshot would hand back the very first comment forever, so the second and
    // later paints would insert a detached node and quietly drop the region.
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

function createProductDetail(id) {
  const state = {
    product: null,
    reviews: [],
    similar: [],
    priceHistory: [],
    wishlistIds: new Set(),
    watchedIds: new Set(),
    offers: [],
    activeOfferId: null,
    loading: true,
    activeImage: 0,
    // dialog drafts, held here because they outlive the dialog elements
    offerAmount: "",
    purchaseReason: "Reviews",
    newRating: 0,
    newComment: "",
    reportReason: "misleading_details",
    reportDetails: "",
    reporting: false,
  };

  const product = () => state.product || {};
  const seller = () => product().seller || {};
  const specs = () => product().specifications || {};
  const images = () => getProductImages(product());
  const isOwner = () => Boolean(auth.user) && String(auth.user._id) === String(seller()._id);

  const activeOffer = () => state.offers.find((o) => String(o._id) === String(state.activeOfferId)) || null;
  const agreedPrice = () => {
    const offer = activeOffer();
    return offer?.finalPrice || offer?.offerAmount || null;
  };

  // ---------- teardown ----------

  /**
   * The router has no unmount hook, so a customer who clicked through to a
   * message thread would leave a detached product page subscribed to the compare
   * and auth stores, repainting on every change. Connection is the only test, for
   * the reason documented in Home.js: the window between building a page and
   * mounting it is synchronous, so no store event can arrive inside it.
   */
  const cleanups = [];
  let disposed = false;
  /** Invalidated by teardown so an in-flight load cannot paint a dead page. */
  let loadToken = 0;
  /** The one live chart instance, disposed before its successor is built. */
  let priceChart = null;

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) teardown();
    return false;
  }

  /** Drop every subscription, listener and detached overlay this page owns. */
  function teardown() {
    disposed = true;
    loadToken++;
    priceChart?.dispose();
    priceChart = null;
    closeModal();
    // Release the observer before anything else can re-enter, so a teardown
    // triggered by a store event cannot leave one watching a detached node.
    disconnectReviewObserver();
    for (const fn of cleanups.splice(0)) fn();
  }

  // ---------- data ----------

  /**
   * The load effect, keyed on the route parameter.
   *
   * The two reads that are allowed to fail keep their `.catch(() => null)`:
   * a product with no similar items, no price history and no saved state is a
   * perfectly good product page, and React rendered it without any of them. The
   * product and the reviews are not caught, so a 404 or a network error lands on
   * the "Product not found" panel exactly as it did there.
   */
  async function load() {
    const token = ++loadToken;
    state.loading = true;
    paint();

    try {
      // Compare membership comes from the shared tray store, not from a
      // per-page GET /compare: a second round trip, and a second source of truth
      // that could disagree with the Compare page.
      const [pRes, revRes, simRes, phRes, wlRes, pwRes] = await Promise.all([
        api.get(`/products/${id}`),
        api.get(`/reviews/${id}`),
        api.get(`/products/${id}/similar?limit=4`).catch(() => null),
        api.get(`/products/${id}/price-history`).catch(() => null),
        api.get("/wishlist").catch(() => null),
        api.get("/price-watch").catch(() => null),
      ]);
      if (token !== loadToken) return;

      state.product = pRes.data.product;
      state.reviews = revRes.data.reviews || [];
      state.similar = simRes?.data?.products || [];
      state.priceHistory = phRes?.data?.history || [];
      state.wishlistIds = new Set((wlRes?.data?.products || []).map((w) => String(w._id)));
      state.watchedIds = new Set((pwRes?.data?.watches || []).map((w) => String(w.product?._id)));
    } catch {
      /* React swallowed this too: no product renders the "not found" panel. */
    }
    if (token !== loadToken) return;

    // `/offers/my` is fire-and-forget in the React page, so it can land after the
    // product has painted. If it carries the offer a `?offer=` deep link asked
    // for, the purchase dialog has to pick it up.
    api
      .get("/offers/my")
      .catch(() => null)
      .then((r) => {
        if (!ensureAlive()) return;
        state.offers = r?.data?.offers || [];
        if (modal?.kind === "buy") modal.paint?.();
      });

    state.loading = false;
    paint();
    handleDeepLink();
  }

  /**
   * `?offer=<id>` opens the purchase dialog on a negotiated price, and
   * `?review=1` opens the review dialog. Both are deep links into this page, so
   * they are read once - after the first load, exactly as the React effect keyed
   * on `product` did - rather than on every repaint.
   */
  let deepLinkChecked = false;

  function handleDeepLink() {
    if (deepLinkChecked || !state.product) return;
    deepLinkChecked = true;
    const params = new URLSearchParams(getLocation()?.search || "");
    if (params.get("offer")) {
      const offerVal = params.get("offer");
      state.activeOfferId = /^[0-9a-f]{24}$/i.test(offerVal) ? offerVal : null;
      openBuyModal();
      return;
    }
    if (params.get("review") === "1") openReviewModal({ reset: false });
  }

  /**
   * REVIEW_VIEW, when the reviews block scrolls into view.
   *
   * Registered after the content is painted, because the block does not exist
   * while the page is still loading. The React effect ran on mount instead and
   * found no `#reviews-section` to observe, so the event never fired there; the
   * intent of the effect - and the only reason `behavior.reviewView` exists - is
   * the one implemented here.
   *
   * `paint()` rebuilds the page body, so it hands back a *new* `#reviews-section`
   * every time - signing in or out repaints, and so does submitting a review. An
   * IntersectionObserver bound to the node that was current at load time keeps
   * reporting against a detached subtree, so the event stopped firing after the
   * first repaint. `syncReviewObserver` therefore re-reads the live node on every
   * build rather than capturing it once. It disconnects whatever is live before
   * observing, so there is never more than one observer and it is never left
   * attached to a stale node.
   *
   * `reviewViewFired` is page state rather than closure state: a rebind must not
   * re-arm an event that has already gone out, otherwise every later repaint
   * would put a fresh observer on the live node and the event could fire twice.
   * The callback re-checks `isConnected` because a queued entry can still be
   * delivered for a node that was replaced after it was queued.
   */
  let reviewObserver = null;
  let reviewViewFired = false;

  function disconnectReviewObserver() {
    reviewObserver?.disconnect();
    reviewObserver = null;
  }

  function syncReviewObserver() {
    disconnectReviewObserver();
    if (reviewViewFired) return;
    if (!auth.user) return;
    if (typeof IntersectionObserver !== "function") return;
    const target = root.querySelector("#reviews-section");
    if (!target) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (reviewViewFired) return;
        if (!entry?.isIntersecting || !entry.target.isConnected) return;
        reviewViewFired = true;
        behavior.reviewView(id);
        disconnectReviewObserver();
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    reviewObserver = obs;
    obs.observe(target);
  }

  // ---------- actions ----------

  /**
   * Wishlist toggle.
   *
   * The remove path re-reads the wishlist and deletes by the id the server
   * returned, because `DELETE /wishlist/:id` takes a product id and this page
   * only ever knows its own route parameter. The local set is updated either
   * way, and a failure is swallowed, as it was in React: the badge is not worth
   * an error toast over a listing the customer can still buy.
   */
  async function toggleWishlist() {
    const present = state.wishlistIds.has(String(id));
    try {
      if (present) {
        const wl = await api.get("/wishlist").catch(() => null);
        const item = (wl?.data?.products || []).find((w) => String(w._id) === String(id));
        if (item) await api.delete(`/wishlist/${item._id}`);
        state.wishlistIds.delete(String(id));
        toast.success("Removed from wishlist");
      } else {
        await api.post("/wishlist", { productId: id });
        state.wishlistIds.add(String(id));
        toast.success("Saved to wishlist");
      }
    } catch {}
    if (ensureAlive()) paintActions();
  }

  /**
   * Price watch toggle, same shape: the watch entry carries its own id, so the
   * remove path reads the list and deletes by `watchId`, and the add path asks
   * for 10% under the asking price.
   */
  async function togglePriceWatch() {
    const present = state.watchedIds.has(String(id));
    try {
      if (present) {
        const pw = await api.get("/price-watch").catch(() => null);
        const item = (pw?.data?.watches || []).find(
          (w) => String(w.product?._id || w.productId) === String(id)
        );
        if (item) await api.delete(`/price-watch/${item.watchId}`);
        state.watchedIds.delete(String(id));
        toast.success("Price watch removed");
      } else {
        await api.post("/price-watch", {
          productId: id,
          targetPrice: Math.round(product().price * 0.9),
        });
        state.watchedIds.add(String(id));
        toast.success("We'll alert you on price drops");
      }
    } catch {}
    if (ensureAlive()) paintActions();
  }

  async function addToCart() {
    try {
      await api.post("/cart", { productId: id });
      toast.success("Added to cart");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add");
    }
  }

  async function sendOffer() {
    if (!state.offerAmount || Number(state.offerAmount) <= 0) return;
    if (Number(state.offerAmount) >= product().price) {
      toast.error("Offer should be below the listed price");
      return;
    }
    try {
      await api.post("/offers", { productId: id, offerAmount: Number(state.offerAmount) });
      toast.success("Offer sent to seller!");
      state.offerAmount = "";
      closeModal();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send offer");
    }
  }

  /**
   * Checkout. `CHECKOUT_START` is the one intent signal on this page that has no
   * server-side mutation to hang off, so it is fired here; the `PURCHASE` event
   * and the reservation itself are recorded by `POST /orders`.
   */
  async function buyNow() {
    behavior.checkoutStart("buy_now", product().price);
    try {
      await api.post("/orders", {
        productId: id,
        offerId: activeOffer()?._id || undefined,
        type: "buy",
        paymentMethod: "cod",
        purchaseReason: state.purchaseReason,
      });
      toast.success("Order placed!");
      closeModal();
      navigate("/orders");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to place order");
    }
  }

  async function startChat() {
    if (!seller()._id) return;
    try {
      const { data } = await api.post("/chats", {
        otherUserId: seller()._id,
        productId: id,
        text: chatMsg || `Hi! Is "${product().title}" still available?`,
      });
      navigate(`/messages/${data.chatId}`);
    } catch {
      toast.error("Could not start chat");
    }
  }

  async function submitReview() {
    if (!state.newRating) {
      toast.error("Pick a rating first");
      return;
    }
    try {
      await api.post("/reviews", {
        productId: id,
        sellerId: seller()._id,
        rating: state.newRating,
        comment: state.newComment.trim() || "Great experience!",
      });
      toast.success("Thanks for your review!");
      state.newRating = 0;
      state.newComment = "";
      closeModal();
      const { data } = await api.get(`/reviews/${id}`);
      if (!ensureAlive()) return;
      state.reviews = data.reviews || [];
      sReviews.set(renderReviews());
      syncReviewObserver();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit review");
    }
  }

  async function submitReport() {
    state.reporting = true;
    if (modal?.kind === "report") {
      modal.reportButton.disabled = true;
      modal.reportButton.textContent = "Sending…";
    }
    try {
      const { data } = await api.post("/reports", {
        productId: id,
        reason: state.reportReason,
        details: state.reportDetails.trim(),
      });
      toast.success(data.message || "Thanks - our team will review this listing");
      state.reportDetails = "";
      state.reportReason = "misleading_details";
      closeModal();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not send that report");
    } finally {
      state.reporting = false;
      if (modal?.kind === "report") {
        modal.reportButton.disabled = false;
        modal.reportButton.textContent = "Send report";
      }
    }
  }

  /** The free-text opener on the chat button, exactly as React left it. */
  const chatMsg = "";

  // ---------- regions ----------

  const sPage = slot("page");
  const sGallery = slot("gallery");
  const sSimilar = slot("similar");
  const sReviews = slot("reviews");
  const sActions = slot("actions");
  const modalHost = h("div");

  const root = h("div", { className: "animate-fade-in" }, sPage.node, modalHost);

  // ---------- dialogs ----------

  let modal = null;

  function closeModal() {
    const open = modal;
    if (!open) return;
    modal = null;
    open.node.remove();
  }

  function openModal(kind, build) {
    closeModal();
    const entry = { kind, node: null };
    modal = entry;
    entry.node = build(entry);
    if (!entry.node) {
      modal = null;
      return;
    }
    modalHost.appendChild(entry.node);
    // React's `autoFocus` on the offer field ran when the dialog mounted, which
    // is this point: the node is in the document, so it can take the caret.
    if (entry.kind === "offer") entry.node.querySelector("[data-offer-input]")?.focus();
  }

  function openBuyModal() {
    openModal("buy", (entry) => buildBuyModal(entry));
  }

  function openOfferModal() {
    openModal("offer", () => buildOfferModal());
  }

  function openReviewModal({ reset }) {
    if (reset) {
      state.newRating = 0;
      state.newComment = "";
    }
    openModal("review", () => buildReviewModal());
  }

  function openReportModal() {
    openModal("report", (entry) => buildReportModal(entry));
  }

  // ---------- builders ----------

  function renderSkeleton() {
    return h(
      "div",
      { className: "page-container" },
      h(
        "div",
        { className: "animate-pulse space-y-6" },
        h("div", { className: "h-3 w-64 bg-sunken rounded-full" }),
        h(
          "div",
          { className: "grid lg:grid-cols-5 gap-6" },
          h(
            "div",
            { className: "lg:col-span-3 space-y-4" },
            h("div", { className: "aspect-[4/3] bg-sunken rounded-2xl" }),
            h(
              "div",
              { className: "grid grid-cols-3 gap-3" },
              [0, 1, 2].map((i) => h("div", { key: i, className: "h-16 bg-sunken rounded-xl" }))
            )
          ),
          h(
            "div",
            { className: "lg:col-span-2 space-y-4" },
            h(
              "div",
              { className: "card p-6 space-y-4" },
              h("div", { className: "h-5 bg-sunken rounded w-2/3" }),
              h("div", { className: "h-3 bg-sunken rounded w-1/3" }),
              h("div", { className: "h-10 bg-sunken rounded w-1/2" }),
              h("div", { className: "h-24 bg-sunken rounded" }),
              h("div", { className: "h-11 bg-sunken rounded" })
            )
          )
        )
      )
    );
  }

  function renderNotFound() {
    return h(
      "div",
      { className: "page-container text-center py-24" },
      h(
        "span",
        { className: "w-16 h-16 rounded-2xl bg-sunken flex items-center justify-center mx-auto mb-5" },
        icon("Package", { size: 28, className: "text-muted-soft" })
      ),
      h("h3", { className: "text-xl font-extrabold text-ink-900" }, "Product not found"),
      h("p", { className: "text-sm text-muted mt-1.5" }, "It may have been sold or removed."),
      A("/products", { className: "btn-primary mt-6" }, "Browse marketplace")
    );
  }

  function renderBreadcrumb() {
    return h(
      "nav",
      { className: "flex items-center gap-1.5 text-xs font-semibold text-muted mb-6 overflow-hidden" },
      A("/", { className: "hover:text-primary transition-colors" }, "Home"),
      icon("ChevronRight", { size: 12, className: "text-muted-soft flex-none" }),
      A("/products", { className: "hover:text-primary transition-colors" }, "Marketplace"),
      icon("ChevronRight", { size: 12, className: "text-muted-soft flex-none" }),
      A(
        `/products?category=${product().category}`,
        { className: "hover:text-primary transition-colors" },
        product().categoryName
      ),
      icon("ChevronRight", { size: 12, className: "text-muted-soft flex-none" }),
      h("span", { className: "text-ink-800 truncate" }, product().title)
    );
  }

  /**
   * The gallery.
   *
   * The main image and the thumbnails are built once: the arrows and the
   * thumbnails change which image is shown, not what the gallery is, and
   * rebuilding them would drop the focus off the arrow the customer just pressed.
   */
  function renderGallery(pct) {
    const list = images();

    const mainImg = h("img", {
      alt: product().title,
      className: "w-full h-full object-cover",
      "data-gallery-main": "true",
    });

    /** Re-point one <img>, with the same degrade-to-placeholder rule images.js applies. */
    const show = (index) => {
      state.activeImage = index;
      mainImg.setAttribute("src", imageProps(product(), index, product().title).src);
      mainImg.onerror = () => {
        mainImg.onerror = null;
        if (mainImg.src !== PLACEHOLDER_IMAGE) mainImg.setAttribute("src", PLACEHOLDER_IMAGE);
      };
      for (const thumb of thumbs) {
        thumb.el.className = cx(
          "w-16 h-16 rounded-lg overflow-hidden border-2 flex-none transition-all",
          thumb.index === index
            ? "border-primary ring-2 ring-brand-500/20"
            : "border-transparent opacity-65 hover:opacity-100"
        );
      }
    };

    const step = (delta) => show((state.activeImage + delta + list.length) % list.length);

    const thumbs = list.map((_, i) => ({
      index: i,
      el: h(
        "button",
        {
          type: "button",
          onClick: () => show(i),
          "aria-label": `View image ${i + 1}`,
          "data-gallery-thumb": String(i),
        },
        h("img", {
          alt: `${product().title} - photo ${i + 1}`,
          ...imageProps(product(), i, `${product().title} - photo ${i + 1}`),
          className: "w-full h-full object-cover",
        })
      ),
    }));

    const card = h(
      "div",
      { className: "card overflow-hidden", "data-gallery": "true" },
      h(
        "div",
        { className: "relative aspect-[4/3] bg-sunken" },
        mainImg,
        h(
          "div",
          { className: "absolute top-3 left-3 flex flex-col items-start gap-2" },
          pct >= 10
            ? h("span", { className: "badge bg-danger text-white shadow-sm px-3 py-1" }, `Save ${pct}%`)
            : null,
          h(
            "span",
            { className: `badge border backdrop-blur-sm ${conditionTone(product().condition)}` },
            product().condition
          )
        ),
        list.length > 1
          ? h(
              "button",
              {
                type: "button",
                onClick: () => step(-1),
                "aria-label": "Previous image",
                className:
                  "absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-line flex items-center justify-center text-ink-800 shadow-sm hover:bg-white transition-colors",
              },
              icon("ChevronLeft", { size: 17 })
            )
          : null,
        list.length > 1
          ? h(
              "button",
              {
                type: "button",
                onClick: () => step(1),
                "aria-label": "Next image",
                className:
                  "absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-line flex items-center justify-center text-ink-800 shadow-sm hover:bg-white transition-colors",
              },
              icon("ChevronRight", { size: 17 })
            )
          : null
      ),
      list.length > 1
        ? h(
            "div",
            { className: "flex gap-2.5 p-3 overflow-x-auto no-scrollbar border-t border-line bg-raised" },
            ...thumbs.map((t) => t.el)
          )
        : null
    );

    show(Math.min(state.activeImage, Math.max(0, list.length - 1)));
    return card;
  }

  function renderTrust() {
    return h(
      "div",
      { className: "grid grid-cols-1 sm:grid-cols-3 gap-3" },
      ...TRUST.map((f) =>
        h(
          "div",
          { key: f.label, className: "card p-3.5 flex items-center gap-3" },
          h(
            "span",
            {
              className:
                "w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center flex-none",
            },
            icon(f.icon, { size: 17 })
          ),
          h(
            "div",
            { className: "min-w-0" },
            h("p", { className: "text-xs font-bold text-ink-900 truncate" }, f.label),
            h("p", { className: "text-2xs text-muted truncate" }, f.sub)
          )
        )
      )
    );
  }

  function renderDescription() {
    const entries = Object.entries(specs());
    return h(
      "section",
      { className: "panel" },
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          null,
          h("h2", { className: "panel-title" }, "Description"),
          h("p", { className: "panel-sub" }, "What the seller reported about this item")
        )
      ),
      h(
        "div",
        { className: "panel-body" },
        h("p", { className: "text-sm text-ink-700 leading-relaxed whitespace-pre-line" }, product().description),
        entries.length > 0
          ? h(
              "div",
              null,
              h(
                "div",
                { className: "flex items-center gap-2 mt-7 mb-3" },
                icon("Layers", { size: 15, className: "text-accent" }),
                h("h3", { className: "text-sm font-bold text-ink-900" }, "Specifications")
              ),
              h(
                "dl",
                { className: "grid grid-cols-1 sm:grid-cols-2 gap-x-8" },
                ...entries.slice(0, 10).map(([k, v]) =>
                  h(
                    "div",
                    {
                      key: k,
                      className:
                        "flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0",
                    },
                    h("dt", { className: "text-xs text-muted capitalize" }, k.replace(/_/g, " ")),
                    h("dd", { className: "text-xs font-bold text-ink-900 text-right" }, String(v))
                  )
                )
              )
            )
          : null
      )
    );
  }

  function renderPriceHistory() {
    const history = state.priceHistory;
    if (history.length <= 1) return null;

    // A repaint replaces this section, so the previous chart's resize listener
    // has to go before the new one is built - React discarded the old tree.
    priceChart?.dispose();
    priceChart = PriceHistoryChart({ data: history });
    const chart = priceChart;

    return h(
      "section",
      { className: "panel" },
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          { className: "flex items-center gap-2.5" },
          h(
            "span",
            {
              className: "w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center",
            },
            icon("Activity", { size: 16 })
          ),
          h(
            "div",
            null,
            h("h2", { className: "panel-title" }, "Price history"),
            h("p", { className: "panel-sub" }, "Every repricing recorded on this listing")
          )
        ),
        h("span", { className: "badge badge-primary" }, `${history.length} updates`)
      ),
      h(
        "div",
        { className: "panel-body" },
        chart.el,
        h(
          "div",
          { className: "alert alert-info mt-4" },
          icon("TrendingDown", { size: 16, className: "flex-none mt-0.5" }),
          h(
            "p",
            { className: "text-xs leading-relaxed" },
            priceTrendLow()
              ? `Lowest tracked run was ${formatINR(priceMin())} (${timeAgo(history[0]?.createdAt)}) - a good moment to watch or negotiate.`
              : "Price tracking started at listing and updates whenever the seller reprices."
          )
        )
      )
    );
  }

  const priceMin = () =>
    state.priceHistory.length
      ? Math.min(...state.priceHistory.map((d) => d.price))
      : product().price;
  const priceTrendLow = () => priceMin() < product().price;

  /**
   * The buy box: badges, the moderation notice, price, rating, location and the
   * four primary actions.
   *
   * The Save / Compare / Watch row is a slot of its own: those three are the only
   * things on the page whose state changes after load, and repainting them alone
   * is what keeps the compare tray from remounting the dialog a customer is
   * typing an offer into.
   */
  function renderBuyBox(pct) {
    const owner = isOwner();
    const s = seller();

    return h(
      "div",
      { className: "card overflow-hidden" },
      h(
        "div",
        { className: "p-5 sm:p-6" },
        h(
          "div",
          { className: "flex items-center gap-2 flex-wrap mb-3" },
          h("span", { className: "badge badge-primary" }, product().categoryName),
          h(
            "span",
            { className: `badge border ${conditionTone(product().condition)}` },
            product().condition
          ),
          product().negotiable ? h("span", { className: "badge badge-accent" }, "Negotiable") : null,
          product().exchangeable ? h("span", { className: "badge badge-info" }, "Exchange OK") : null,
          owner ? h("span", { className: "badge badge-neutral" }, "Your listing") : null,
          product().status !== "available"
            ? h(
                "span",
                { className: `badge border capitalize ${listingTone(product().status)}` },
                listingLabel(product().status)
              )
            : null
        ),

        // A moderated listing is still reachable by its owner and by admins, so
        // this page has to explain the state rather than showing a dead "Buy Now".
        product().status !== "available"
          ? h(
              "div",
              {
                className: `alert ${isModerated(product().status) ? "alert-danger" : "alert-warning"} mt-4`,
              },
              icon("Flag", { size: 15, className: "flex-none mt-0.5" }),
              h(
                "div",
                { className: "space-y-1" },
                h(
                  "p",
                  { className: "text-xs font-bold leading-relaxed" },
                  owner
                    ? listingStatusSentence(product())
                    : `This listing is ${listingLabel(product().status).toLowerCase()} and is not available to buy.`
                ),
                owner && product().moderationNote
                  ? h(
                      "p",
                      { className: "text-2xs leading-relaxed opacity-90" },
                      `Note from the moderation team: ${product().moderationNote}`
                    )
                  : null
              )
            )
          : null,

        h(
          "h1",
          { className: "text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight leading-snug" },
          product().title
        ),
        h(
          "p",
          { className: "text-sm text-muted mt-1.5" },
          product().brand,
          product().model ? ` · ${product().model}` : ""
        ),

        h(
          "div",
          { className: "flex items-end justify-between gap-4 mt-5 pt-5 border-t border-line" },
          h(
            "div",
            null,
            h("p", { className: "label-eyebrow mb-1" }, "Asking price"),
            h(
              "div",
              { className: "flex items-baseline gap-2 flex-wrap" },
              h(
                "span",
                { className: "text-[32px] leading-none font-extrabold text-ink-900 tracking-tight tabular" },
                formatINR(product().price)
              ),
              product().originalPrice > product().price
                ? h(
                    "span",
                    { className: "text-sm font-medium text-muted-soft line-through tabular" },
                    formatINR(product().originalPrice)
                  )
                : null
            ),
            pct >= 10
              ? h("p", { className: "text-xs font-bold text-success mt-1.5" }, `${pct}% below original price`)
              : null
          ),
          h(
            "div",
            { className: "text-right flex-none" },
            h(
              "div",
              { className: "flex items-center gap-1.5" },
              StarRating({ value: product().rating, size: 13 }),
              h(
                "span",
                { className: "text-sm font-extrabold text-ink-900 tabular" },
                Number(product().rating || 0).toFixed(1)
              )
            ),
            h("p", { className: "text-2xs text-muted-soft mt-0.5" }, `${product().reviewCount || 0} reviews`)
          )
        ),

        priceTrendLow() && state.priceHistory.length > 1
          ? h(
              "div",
              { className: "alert alert-success mt-5 !py-2.5" },
              icon("TrendingDown", { size: 15, className: "flex-none mt-0.5" }),
              h(
                "p",
                { className: "text-xs leading-relaxed" },
                "Price watch: lowest run was ",
                h("b", null, formatINR(priceMin())),
                `, ${timeAgo(state.priceHistory[0]?.createdAt)}.`
              )
            )
          : null,

        h(
          "div",
          { className: "flex items-center gap-2 text-sm text-muted mt-5" },
          icon("MapPin", { size: 15, className: "text-accent flex-none" }),
          h("span", { className: "truncate" }, product().location || "Not specified"),
          product().isVerified
            ? h(
                "span",
                { className: "badge badge-success ml-auto flex-none" },
                icon("CheckCircle2", { size: 11 }),
                "Quality checked"
              )
            : null
        ),

        h(
          "div",
          { className: "space-y-2.5 mt-5 pt-5 border-t border-line" },
          !owner && product().status === "available"
            ? h(
                "div",
                null,
                h(
                  "div",
                  { className: "grid grid-cols-2 gap-2.5" },
                  h(
                    "button",
                    { type: "button", onClick: () => openBuyModal(), className: "btn-accent" },
                    icon("ShoppingBag", { size: 16 }),
                    "Buy Now"
                  ),
                  h(
                    "button",
                    { type: "button", onClick: addToCart, className: "btn-primary" },
                    icon("ShoppingCart", { size: 16 }),
                    "Add to Cart"
                  )
                ),
                h(
                  "div",
                  { className: "grid grid-cols-2 gap-2.5" },
                  h(
                    "button",
                    { type: "button", onClick: () => openOfferModal(), className: "btn-secondary" },
                    icon("Tag", { size: 14 }),
                    "Make Offer"
                  ),
                  h(
                    "button",
                    { type: "button", onClick: startChat, className: "btn-secondary" },
                    icon("MessageCircle", { size: 15 }),
                    s.isVerifiedSeller ? "Chat seller" : "Ask seller"
                  )
                )
              )
            : owner
              ? A("/sell", { className: "btn-secondary w-full" }, "Manage your listing")
              : h(
                  "p",
                  { className: "text-2xs text-muted-soft text-center py-1" },
                  `This listing is ${listingLabel(product().status).toLowerCase()}, so buying and offers are closed.`
                ),

          sActions.node,

          // Reporting is a moderation signal, not a support request, so it lives
          // on the buy box rather than behind a help menu. The server rejects
          // reports on your own listing, and the button reflects that instead of
          // offering an action that will fail.
          !owner && product().status === "available"
            ? h(
                "button",
                {
                  type: "button",
                  onClick: () => openReportModal(),
                  className: "btn-quiet btn-sm w-full",
                },
                icon("Flag", { size: 13 }),
                "Report this listing"
              )
            : null
        ),

        h(
          "p",
          { className: "flex items-center gap-1.5 text-2xs text-muted-soft mt-4" },
          icon("Truck", { size: 12 }),
          "Local delivery or pickup available",
          icon("ArrowUpRight", { size: 11 })
        )
      )
    );
  }

  /**
   * One persistent button whose label and colour follow a boolean.
   *
   * React re-rendered the whole buy box on every one of these changes, which
   * meant the button the customer had just pressed was replaced under the
   * caret. Here the three controls are created once and only their label, icon
   * and classes are rewritten.
   */
  function makeAction(key, iconName, onClick) {
    const iconEl = icon(iconName, { size: 14 });
    const label = document.createTextNode("");
    const el = h(
      "button",
      {
        type: "button",
        onClick,
        "data-action": key,
        className: "btn-secondary btn-sm w-full",
      },
      iconEl,
      label
    );
    return { el, iconEl, label };
  }

  const actionButtons = {};

  function buildActions() {
    actionButtons.wishlist = makeAction("wishlist", "Heart", toggleWishlist);
    actionButtons.compare = makeAction("compare", "ArrowLeftRight", () => compareStore.toggle(id));
    // The React page wrote `onClick={() => togglePriceWatch}`, which returns the
    // handler instead of calling it and left the Watch button dead. Wired here
    // to the same handler the page defines.
    actionButtons.watch = makeAction("watch", "Bell", togglePriceWatch);

    return h(
      "div",
      { className: "grid grid-cols-3 gap-2.5" },
      actionButtons.wishlist.el,
      actionButtons.compare.el,
      actionButtons.watch.el
    );
  }

  /** Repaint the three toggles from current state, in place. */
  function paintActions() {
    if (!Object.keys(actionButtons).length) return;

    const saved = state.wishlistIds.has(String(id));
    const inCompare = compareStore.isComparing(id);
    const watching = state.watchedIds.has(String(id));

    const wishlist = actionButtons.wishlist;
    wishlist.label.nodeValue = saved ? "Saved" : "Save";
    wishlist.iconEl.classList.toggle("fill-current", saved);
    wishlist.el.className = cx(
      "btn-secondary btn-sm w-full",
      saved ? "!bg-danger-soft !border-danger/25 !text-danger" : ""
    );

    const compare = actionButtons.compare;
    compare.label.nodeValue = inCompare ? "In Compare" : "Compare";
    compare.el.className = cx(
      "btn-secondary btn-sm w-full",
      inCompare ? "!bg-primary-soft !border-brand-200 !text-primary" : ""
    );
    compare.el.setAttribute("aria-pressed", String(Boolean(inCompare)));
    compare.el.setAttribute(
      "title",
      inCompare ? "Remove this product from Compare" : "Add this product to Compare"
    );

    const watch = actionButtons.watch;
    watch.label.nodeValue = watching ? "Watching" : "Watch";
    watch.el.className = cx(
      "btn-secondary btn-sm w-full",
      watching ? "!bg-primary-soft !border-brand-200 !text-primary" : ""
    );
  }

  function renderSellerCard() {
    const s = seller();
    return h(
      "div",
      { className: "card p-5", "data-seller-card": "true" },
      h(
        "div",
        { className: "flex items-center justify-between mb-3.5" },
        h("h3", { className: "text-sm font-bold text-ink-900" }, "Seller"),
        s.isVerifiedSeller
          ? h("span", { className: "badge badge-success" }, icon("Shield", { size: 11 }), "Verified")
          : null
      ),
      A(
        `/seller/${s._id}`,
        { className: "flex items-center gap-3 group" },
        h(
          "span",
          { className: "avatar w-12 h-12 text-base flex-none" },
          s.name?.charAt(0)?.toUpperCase() || "S"
        ),
        h(
          "span",
          { className: "min-w-0 flex-1" },
          h(
            "span",
            { className: "block font-bold text-sm text-ink-900 group-hover:text-primary transition-colors truncate" },
            s.name
          ),
          h(
            "span",
            { className: "flex items-center gap-1.5 text-xs text-muted mt-0.5" },
            StarRating({ value: s.sellerRating || 0, size: 11 }),
            h("span", { className: "font-semibold" }, Number(s.sellerRating || 0).toFixed(1)),
            h("span", { className: "text-muted-soft" }, `(${s.sellerRatingCount || 0})`),
            h("span", { className: "text-muted-soft" }, "·"),
            h("span", { className: "truncate" }, product().location)
          )
        ),
        icon("ArrowUpRight", {
          size: 15,
          className: "text-muted-soft group-hover:text-primary transition-colors flex-none",
        })
      )
    );
  }

  function renderImpact() {
    return h(
      "div",
      { className: "card p-5" },
      h(
        "h3",
        { className: "text-sm font-bold text-ink-900 mb-3 flex items-center gap-2" },
        icon("Leaf", { size: 15, className: "text-success" }),
        "What you give it & life it gives back"
      ),
      h(
        "ul",
        { className: "space-y-2 text-xs text-muted leading-relaxed" },
        h(
          "li",
          { className: "flex gap-2" },
          icon("CheckCircle2", { size: 14, className: "text-success flex-none mt-0.5" }),
          `Buying second-hand saves roughly ${Math.round(product().price / 1000) * 2} kg of CO₂ versus new.`
        ),
        h(
          "li",
          { className: "flex gap-2" },
          icon("CheckCircle2", { size: 14, className: "text-success flex-none mt-0.5" }),
          "Every purchase funds circular, low-waste shopping on campus."
        )
      )
    );
  }

  function renderSimilar() {
    if (!state.similar.length) return null;
    return h(
      "section",
      { className: "mt-14" },
      h(
        "div",
        { className: "flex items-end justify-between gap-4 mb-5" },
        h(
          "div",
          null,
          h("h2", { className: "section-title" }, "Similar products"),
          h("p", { className: "section-sub" }, "More like this from the marketplace")
        ),
        A("/products", { className: "link-more" }, "View all")
      ),
      h(
        "div",
        { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
        ...state.similar
          .filter((p) => String(p._id) !== String(id))
          .map((p) =>
            A(
              `/products/${p._id}`,
              { key: String(p._id), className: "block" },
              ProductCard({ product: p, compact: true })
            )
          )
      )
    );
  }

  function renderReviews() {
    const owner = isOwner();
    return h(
      "section",
      { id: "reviews-section", className: "mt-14 panel" },
      h(
        "div",
        { className: "panel-head" },
        h(
          "div",
          null,
          h("h2", { className: "panel-title" }, `Reviews (${state.reviews.length})`),
          h("p", { className: "panel-sub" }, "What buyers say about this item")
        ),
        h(
          "div",
          { className: "flex items-center gap-3" },
          state.reviews.length > 0
            ? h(
                "div",
                { className: "hidden sm:flex items-center gap-2" },
                StarRating({ value: product().rating, size: 14 }),
                h(
                  "span",
                  { className: "text-sm font-extrabold text-ink-900 tabular" },
                  Number(product().rating || 0).toFixed(1)
                )
              )
            : null,
          auth.user && !owner
            ? h(
                "button",
                {
                  type: "button",
                  onClick: () => openReviewModal({ reset: true }),
                  className: "btn-primary btn-sm",
                },
                "Write a review"
              )
            : null
        )
      ),
      h(
        "div",
        { className: "panel-body" },
        state.reviews.length === 0
          ? h(
              "p",
              { className: "text-sm text-muted text-center py-10" },
              "No reviews yet — be the first to review after buying."
            )
          : h(
              "div",
              { className: "grid sm:grid-cols-2 gap-4" },
              ...state.reviews.map((r) =>
                h(
                  "div",
                  { key: String(r._id), className: "rounded-xl border border-line bg-raised p-4" },
                  h(
                    "div",
                    { className: "flex items-center gap-2.5 mb-2.5" },
                    h(
                      "span",
                      { className: "avatar w-9 h-9 text-xs flex-none" },
                      r.userId?.name?.charAt(0)?.toUpperCase() || "?"
                    ),
                    h(
                      "div",
                      { className: "flex-1 min-w-0" },
                      h(
                        "p",
                        { className: "text-xs font-bold text-ink-900 truncate" },
                        r.userId?.name || "Anonymous"
                      ),
                      h("p", { className: "text-2xs text-muted-soft" }, timeAgo(r.createdAt))
                    ),
                    StarRating({ value: r.rating, size: 11 })
                  ),
                  h("p", { className: "text-xs text-ink-700 leading-relaxed" }, r.comment)
                )
              )
            )
      )
    );
  }

  function renderContent() {
    const pct = discountPercent(product().price, product().originalPrice);

    return h(
      "div",
      { className: "page-container" },
      renderBreadcrumb(),
      h(
        "div",
        { className: "grid lg:grid-cols-5 gap-6 lg:gap-8 items-start" },
        h(
          "div",
          { className: "lg:col-span-3 space-y-4" },
          sGallery.node,
          renderTrust(),
          renderDescription(),
          renderPriceHistory()
        ),
        h(
          "div",
          { className: "lg:col-span-2 space-y-4 lg:sticky lg:top-[84px]" },
          renderBuyBox(pct),
          renderSellerCard(),
          renderImpact()
        )
      ),
      sSimilar.node,
      sReviews.node
    );
  }

  // ---------- dialog builders ----------

  function buildOfferModal() {
    const input = h("input", {
      type: "number",
      className: "input-field",
      placeholder: formatINR(Math.round(product().price * 0.85)).replace("₹", ""),
      "data-offer-input": "true",
    });
    input.value = state.offerAmount;
    input.addEventListener("input", (e) => {
      state.offerAmount = e.target.value;
    });

    return Modal({
      title: "Make an offer",
      subtitle: "Sellers respond instantly — accept, counter or decline.",
      onClose: closeModal,
      footer: h(
        "div",
        { className: "contents" },
        h(
          "button",
          { type: "button", onClick: closeModal, className: "btn-secondary" },
          "Cancel"
        ),
        h(
          "button",
          { type: "button", onClick: sendOffer, className: "btn-primary" },
          "Send offer"
        )
      ),
      children: h(
        "div",
        { className: "space-y-4" },
        h(
          "div",
          {
            className:
              "flex items-center justify-between rounded-xl bg-primary-soft border border-brand-100 px-4 py-3",
          },
          h("span", { className: "text-xs font-semibold text-muted" }, "Listed at"),
          h(
            "span",
            { className: "text-lg font-extrabold text-primary tabular" },
            formatINR(product().price)
          )
        ),
        h(
          "div",
          null,
          h("label", { className: "input-label" }, "Your offer (₹)"),
          input,
          h("p", { className: "input-hint" }, "Keep it fair — a realistic offer is far more likely to be accepted.")
        )
      ),
    });
  }

  /**
   * The purchase dialog.
   *
   * Its title, its confirm button and the negotiated-price block all depend on
   * `activeOffer`, which is not known when the dialog opens if the page was
   * deep-linked to `?offer=` before `/offers/my` came back. So the dialog is
   * built once and `paintBuyModal()` rewrites those parts in place, which is what
   * the React re-render amounted to.
   */
  function buildBuyModal(entry) {
    const offerHost = h("div");
    const confirmButton = h(
      "button",
      { type: "button", onClick: buyNow, className: "btn-accent", "data-buy-confirm": "true" }
    );
    const priceEl = h("p", { className: "text-sm font-extrabold text-primary tabular" });
    const wasEl = h("p", { className: "text-2xs text-muted-soft line-through" });

    const chips = PURCHASE_REASONS.map((r) => {
      const el = h(
        "button",
        {
          type: "button",
          "data-reason": r,
          onClick: () => {
            state.purchaseReason = r;
            paintChips();
          },
        },
        r
      );
      return { reason: r, el };
    });

    const paintChips = () => {
      for (const chip of chips) {
        chip.el.className = state.purchaseReason === chip.reason ? "chip-active" : "chip-idle";
      }
    };
    paintChips();

    const node = Modal({
      title: "Confirm purchase",
      onClose: () => {
        state.activeOfferId = null;
        closeModal();
      },
      footer: h(
        "div",
        { className: "contents" },
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              state.activeOfferId = null;
              closeModal();
            },
            className: "btn-secondary",
          },
          "Cancel"
        ),
        confirmButton
      ),
      children: h(
        "div",
        { className: "space-y-4" },
        offerHost,
        h(
          "div",
          { className: "flex items-center gap-3 rounded-xl border border-line p-3" },
          h(
            "div",
            { className: "w-14 h-14 rounded-lg bg-sunken overflow-hidden flex-none" },
            h("img", {
              alt: product().title,
              ...imageProps(product(), 0, product().title),
              className: "w-full h-full object-cover",
            })
          ),
          h(
            "div",
            { className: "min-w-0 flex-1" },
            h("p", { className: "text-sm font-bold text-ink-900 truncate" }, product().title),
            h(
              "p",
              { className: "text-xs text-muted mt-0.5" },
              `${product().condition} · ${product().location}`
            )
          ),
          h(
            "div",
            { className: "text-right flex-none" },
            priceEl,
            wasEl
          )
        ),
        h(
          "div",
          null,
          h(
            "label",
            { className: "input-label" },
            "What convinced you? (improves our recommendations)"
          ),
          h("div", { className: "flex flex-wrap gap-2" }, ...chips.map((c) => c.el))
        ),
        h(
          "p",
          { className: "text-2xs text-muted-soft" },
          "Cash on delivery per seller agreement. Plan local pickup or delivery after the order is placed."
        )
      ),
    });

    // `Modal` owns the <h3>, so the title is rewritten in place rather than
    // replaced - the same re-render React got from swapping the title string.
    const titleEl = node.querySelector('[role="dialog"] h3');
    const dialogEl = node.querySelector('[role="dialog"]');

    entry.paint = () => {
      const offer = activeOffer();
      const agreed = agreedPrice();
      const listed = offer?.listedPrice || product().price;
      const title = offer ? "Complete your negotiated purchase" : "Confirm purchase";

      if (titleEl) titleEl.textContent = title;
      dialogEl?.setAttribute("aria-label", title);
      confirmButton.textContent = offer ? `Confirm at ${formatINR(agreed)}` : "Place order";
      if (agreed < product().price) {
        wasEl.className = "text-2xs text-muted-soft line-through";
        wasEl.textContent = formatINR(product().price);
      } else {
        // React rendered the struck-through price only when the offer was below
        // the listed one; a stale node would keep showing it.
        wasEl.className = "hidden";
        wasEl.textContent = "";
      }
      priceEl.textContent = formatINR(agreed || product().price);

      mount(
        offerHost,
        offer
          ? h(
              "div",
              { className: "rounded-xl border border-brand-200 bg-primary-soft p-3.5" },
              h(
                "p",
                { className: "text-xs font-extrabold text-primary mb-1 flex items-center gap-1.5" },
                icon("Tag", { size: 12 }),
                `Offer locked in — ${offer.rounds} negotiation ${offer.rounds === 1 ? "round" : "rounds"}`
              ),
              h(
                "p",
                { className: "text-xs text-muted leading-relaxed" },
                "Listed ",
                h("span", { className: "line-through" }, formatINR(listed)),
                " · agreed at ",
                h("b", { className: "text-ink-900" }, formatINR(agreed)),
                ` — saving ${formatINR(Math.max(0, listed - agreed))}`
              )
            )
          : null
      );
    };

    entry.paint();
    return node;
  }

  function buildReviewModal() {
    const stars = [1, 2, 3, 4, 5].map((n) => {
      const path = h("path", {
        d: "M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9L12 2.5z",
      });
      const svg = h(
        "svg",
        {
          width: "30",
          height: "30",
          viewBox: "0 0 24 24",
          strokeWidth: "1.6",
          strokeLinejoin: "round",
        },
        path
      );
      return {
        n,
        svg,
        el: h(
          "button",
          {
            type: "button",
            onClick: () => {
              state.newRating = n;
              paintStars();
            },
            "aria-label": `${n} star${n > 1 ? "s" : ""}`,
            className: "transition-transform hover:scale-110",
          },
          svg
        ),
      };
    });

    const paintStars = () => {
      for (const star of stars) {
        const on = star.n <= state.newRating;
        star.svg.setAttribute("fill", on ? C.rating : "none");
        star.svg.setAttribute("stroke", on ? C.rating : C.grid);
      }
      submit.disabled = !state.newRating;
    };

    const comment = h("textarea", {
      rows: 4,
      className: "textarea-field",
      placeholder: "Share the condition, delivery experience and value for money…",
    });
    comment.value = state.newComment;
    comment.addEventListener("input", (e) => {
      state.newComment = e.target.value;
    });

    const submit = h(
      "button",
      { type: "button", onClick: submitReview, className: "btn-primary", "data-review-submit": "true" },
      "Submit review"
    );

    paintStars();

    return Modal({
      title: "Write a review",
      subtitle: "Help other buyers decide with confidence.",
      onClose: closeModal,
      footer: h(
        "div",
        { className: "contents" },
        h("button", { type: "button", onClick: closeModal, className: "btn-secondary" }, "Cancel"),
        submit
      ),
      children: h(
        "div",
        { className: "space-y-5" },
        h(
          "div",
          null,
          h("label", { className: "input-label" }, "How was your experience?"),
          h("div", { className: "flex gap-1.5 py-2" }, ...stars.map((s) => s.el))
        ),
        h("div", null, h("label", { className: "input-label" }, "Your review"), comment)
      ),
    });
  }

  function buildReportModal(entry) {
    const reasons = REPORT_REASONS.map((r) => {
      const el = h(
        "button",
        {
          type: "button",
          "data-report-reason": r,
          onClick: () => {
            state.reportReason = r;
            paintReasons();
          },
        },
        reasonLabel(r)
      );
      return { reason: r, el };
    });

    const paintReasons = () => {
      for (const item of reasons) {
        const on = state.reportReason === item.reason;
        item.el.setAttribute("aria-pressed", String(on));
        item.el.className =
          "w-full text-left px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors " +
          (on
            ? "bg-primary-soft border-brand-200 text-primary"
            : "border-line bg-raised text-muted hover:border-brand-100");
      }
    };
    paintReasons();

    const details = h("textarea", {
      rows: 3,
      maxLength: 1000,
      className: "textarea-field",
      placeholder: "Add specifics that help a moderator decide quickly…",
    });
    details.value = state.reportDetails;

    const counter = h("p", { className: "text-2xs text-muted-soft mt-1.5" }, `${state.reportDetails.length}/1000`);
    details.addEventListener("input", (e) => {
      state.reportDetails = e.target.value;
      counter.textContent = `${state.reportDetails.length}/1000`;
    });

    const reportButton = h(
      "button",
      { type: "button", onClick: submitReport, className: "btn-primary", "data-report-submit": "true" },
      "Send report"
    );
    entry.reportButton = reportButton;

    return Modal({
      title: "Report this listing",
      subtitle: "Our moderators review every report. Tell us what is wrong and we will take a look.",
      onClose: closeModal,
      footer: h(
        "div",
        { className: "contents" },
        h("button", { type: "button", onClick: closeModal, className: "btn-secondary" }, "Cancel"),
        reportButton
      ),
      children: h(
        "div",
        { className: "space-y-5" },
        h(
          "div",
          null,
          h("label", { className: "input-label" }, "What is the problem?"),
          h("div", { className: "space-y-1.5 mt-1" }, ...reasons.map((r) => r.el))
        ),
        h(
          "div",
          null,
          h("label", { className: "input-label" }, "Anything else we should know? (optional)"),
          details,
          counter
        ),
        h(
          "p",
          { className: "text-2xs text-muted-soft leading-relaxed" },
          "Reports are private. The seller is not told who reported their listing."
        )
      ),
    });
  }

  // ---------- paint ----------

  function paint() {
    if (state.loading) {
      const skeleton = renderSkeleton();
      if (!sPage.is(skeleton)) sPage.set(skeleton);
      return;
    }
    if (!state.product) {
      const panel = renderNotFound();
      if (!sPage.is(panel)) sPage.set(panel);
      return;
    }

    const page = renderContent();
    if (!sPage.is(page)) sPage.set(page);

    sGallery.set(renderGallery(discountPercent(product().price, product().originalPrice)));
    sActions.set(buildActions());
    paintActions();
    sSimilar.set(renderSimilar());
    sReviews.set(renderReviews());
    // The reviews block was just replaced, so the observer has to follow it.
    syncReviewObserver();
  }

  // ---------- subscriptions ----------

  cleanups.push(
    compareStore.subscribe(() => {
      if (!ensureAlive()) return;
      paintActions();
    })
  );

  cleanups.push(
    auth.subscribe(() => {
      if (!ensureAlive()) return;
      // Signing in or out changes what a review is worth and who the seller is,
      // so the page repaints - exactly as the React context re-render did.
      paint();
    })
  );

  load();

  return {
    root,
    dispose: teardown,
  };
}

let cached = null;

/**
 * One instance per visit to the route, per product.
 *
 * The router rebuilds the page module on every navigation, so this hands back the
 * instance it already built for the same product - which is what React's stable
 * route element did for free, and what keeps the open dialog and the gallery
 * position across a re-render. A different `:id` is a different listing and gets
 * a fresh instance, disposed on the way out, so a load in flight can never paint
 * over another product's page.
 */
export default function ProductDetail({ params } = {}) {
  const id = params?.id;
  if (cached) {
    if (cached.id === id && cached.root.isConnected) return cached.root;
    cached.dispose();
  }
  cached = { id, ...createProductDetail(id) };
  return cached.root;
}
