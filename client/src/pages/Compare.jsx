import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeftRight, X, Check, Shield, Star, MapPin, Package, Tag, User,
  Clock, SlidersHorizontal, Heart, ShoppingCart, ExternalLink, Trash2, Plus,
  AlertTriangle, RefreshCw, Handshake, Info, ChevronRight, Loader2, Scale,
  TrendingDown, BadgeCheck, PackageX,
} from "lucide-react";
import api from "../services/api.js";
import EmptyState from "../components/EmptyState.jsx";
import StarRating from "../components/StarRating.jsx";
import Modal from "../components/Modal.jsx";
import { useCompareStore } from "../context/CompareContext.jsx";
import { formatINR, formatNumber } from "../utils/format.js";
import { imageProps } from "../utils/images.js";
import { conditionTone } from "../utils/theme.js";
import { buildSections, annotateSections, priceExtremes, ratingExtremes, summarise, relativeAge } from "../utils/compareRows.jsx";

/**
 * MERIDIAN compare desk.
 *
 * One question drives this page: "which of these fits my requirements better?"
 * So it is a comparison, not a row of product cards -- every product owns a
 * column, every attribute owns a row, and the rows where the columns disagree
 * are the ones that get marked. The old version of this page scored each
 * product out of 100 and declared a "Recommended" winner; that claim cannot be
 * made honestly, so it is gone. What remains is arithmetic a customer can
 * verify themselves (lowest price, highest rating) and the raw values.
 *
 * Data comes from the shared compare store, which has already fetched the whole
 * tray in one request by the time this page mounts, so opening Compare costs
 * zero additional product requests.
 */

const SECTION_ICONS = {
  package: Package,
  user: User,
  tag: Tag,
  clock: Clock,
  sliders: SlidersHorizontal,
};

const COL_MIN = "min-w-[196px] sm:min-w-[236px]";
const LABEL_COL = "w-[124px] sm:w-[172px]";

const DASH = "—";

/* ------------------------------------------------------------- fragments -- */

function SkeletonCompare() {
  return (
    <div className="card overflow-hidden animate-pulse" aria-hidden="true">
      <div className="h-11 bg-raised border-b border-line" />
      <div className="flex">
        <div className={`${LABEL_COL} flex-none border-r border-line bg-raised`} />
        <div className="flex-1 grid grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-r border-line last:border-r-0 p-4 space-y-3">
              <div className="aspect-[4/3] bg-sunken rounded-xl" />
              <div className="h-3 bg-sunken rounded w-4/5" />
              <div className="h-5 bg-sunken rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: 7 }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            <div className="h-2.5 bg-sunken rounded w-24 flex-none" />
            <div className="flex-1 flex gap-4">
              {Array.from({ length: 3 }).map((__, c) => (
                <div key={c} className="h-2.5 bg-sunken rounded flex-1" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small, factual tiles. Counts and ranges only, never a recommendation. */
function AtAGlance({ products }) {
  const s = useMemo(() => summarise(products), [products]);
  const tiles = [
    {
      icon: TrendingDown,
      tone: "bg-success-soft text-success",
      label: "Price range",
      value: s.minPrice === s.maxPrice ? formatINR(s.minPrice) : `${formatINR(s.minPrice)} – ${formatINR(s.maxPrice)}`,
      sub: s.maxPrice > s.minPrice ? `${formatINR(s.maxPrice - s.minPrice)} spread` : "All listed at the same price",
    },
    {
      icon: Package,
      tone: "bg-primary-soft text-primary",
      label: "Conditions",
      value: s.conditionSpread.map((c) => c.name).join(" · ") || DASH,
      sub: s.conditionSpread.length > 1 ? "Conditions differ" : "Same condition",
    },
    {
      icon: Handshake,
      tone: "bg-accent-soft text-accent",
      label: "Open to offers",
      value: `${s.negotiable} of ${s.count}`,
      sub: s.exchangeable ? `${s.exchangeable} accept exchange` : "No exchanges offered",
    },
    {
      icon: Shield,
      tone: "bg-info-soft text-info",
      label: "Verified sellers",
      value: `${s.verifiedSellers} of ${s.count}`,
      sub: s.locationCount > 1 ? `${s.locationCount} pickup locations` : "One pickup location",
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4 flex items-start gap-3">
          <span className={`w-9 h-9 rounded-xl ${t.tone} flex items-center justify-center flex-none`}>
            <t.icon size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted">{t.label}</p>
            <p className="font-extrabold text-ink-900 text-[15px] leading-snug mt-0.5 break-words">{t.value}</p>
            <p className="text-2xs text-muted-soft mt-0.5">{t.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The column header: identity, price, seller, and everything you can do to it. */
function ProductColumn({
  product,
  index,
  total,
  isLowestPrice,
  isHighestPrice,
  isHighestRated,
  onRemove,
  onAddToCart,
  onWishlist,
  onOffer,
  onDetails,
  wishlisted,
  inCart,
  busy,
  unavailable,
  unavailableReason,
}) {
  const id = String(product._id);

  if (unavailable) {
    return (
      <div className="p-4 text-center">
        <div className="aspect-[4/3] rounded-xl bg-sunken border border-dashed border-line flex items-center justify-center">
          <PackageX size={26} className="text-muted-soft" />
        </div>
        <p className="mt-3 text-sm font-extrabold text-ink-900">Product unavailable</p>
        <p className="text-2xs text-muted mt-1 leading-relaxed">
          {unavailableReason === "removed"
            ? "This listing has been deleted by the seller."
            : unavailableReason === "sold"
              ? "This listing has been sold."
              : unavailableReason === "reserved"
                ? "This listing is currently reserved."
                : "This listing is no longer available."}
        </p>
        <p className="text-2xs text-muted-soft mt-1.5 line-clamp-2">{product.title}</p>
        <button onClick={() => onRemove(id)} className="btn-secondary btn-sm w-full mt-3">
          <Trash2 size={13} /> Remove from Compare
        </button>
      </div>
    );
  }

  const working = Boolean(busy);
  const offerOpen = product.negotiable;

  return (
    <div className="p-3.5 flex flex-col gap-3">
      <Link
        to={`/products/${id}`}
        className="block aspect-[4/3] rounded-xl bg-sunken overflow-hidden border border-line group focus-ring"
        tabIndex={-1}
        aria-hidden="true"
      >
        <img
          alt=""
          {...imageProps(product)}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />
      </Link>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft">
          <span className="truncate">{product.brand || "Unbranded"}</span>
          <span className="dot flex-none" />
          <span className="truncate">{product.categoryName}</span>
        </div>
        <Link
          to={`/products/${id}`}
          className="block text-sm font-bold text-ink-900 hover:text-primary transition-colors line-clamp-2 leading-snug mt-1 focus-ring rounded"
          title={product.title}
        >
          {product.title}
        </Link>
      </div>

      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xl font-extrabold text-ink-900 tracking-tight tabular">
            {formatINR(product.price)}
          </span>
          {product.originalPrice > product.price && (
            <span className="text-xs font-medium text-muted-soft line-through tabular">
              {formatINR(product.originalPrice)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className={`badge border ${conditionTone(product.condition)}`}>{product.condition}</span>
          {isLowestPrice && (
            <span className="badge badge-success">
              <TrendingDown size={10} /> Lowest
            </span>
          )}
          {isHighestPrice && (
            <span className="badge badge-outline">Highest</span>
          )}
          {isHighestRated && (
            <span className="badge badge-warning">
              <Star size={9} className="fill-current" /> Top rated
            </span>
          )}
        </div>
      </div>

      <div className="text-2xs text-muted space-y-1">
        <p className="flex items-center gap-1.5 min-w-0">
          {product.seller?.isVerifiedSeller ? (
            <BadgeCheck size={12} className="text-success flex-none" />
          ) : (
            <User size={12} className="text-muted-soft flex-none" />
          )}
          <span className="truncate font-semibold text-ink-800">
            {product.seller?.name || product.sellerName || "ReMarket seller"}
          </span>
        </p>
        {Number(product.seller?.sellerRating) > 0 && (
          <p className="flex items-center gap-1.5">
            <StarRating value={product.seller.sellerRating} size={11} />
            <span className="font-bold text-ink-800 tabular">
              {Number(product.seller.sellerRating).toFixed(1)}
            </span>
            <span className="text-muted-soft">({product.seller.sellerRatingCount || 0})</span>
          </p>
        )}
        {product.location && (
          <p className="flex items-center gap-1.5 min-w-0">
            <MapPin size={11} className="text-muted-soft flex-none" />
            <span className="truncate">{product.location}</span>
          </p>
        )}
        <p className="text-muted-soft">{relativeAge(product.createdAt)}</p>
      </div>

      <div className="mt-auto pt-1 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onDetails(id)}
            className="btn-primary btn-sm col-span-2"
            title="Open the full listing for this product"
          >
            <ExternalLink size={13} /> View details
          </button>
          <button
            onClick={() => onWishlist(product)}
            disabled={working}
            aria-pressed={wishlisted}
            className={`btn-secondary btn-sm ${wishlisted ? "!bg-danger-soft !border-danger/25 !text-danger" : ""}`}
            title={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
          >
            {busy === "wishlist" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Heart size={13} className={wishlisted ? "fill-current" : ""} />
            )}
            {wishlisted ? "Saved" : "Save"}
          </button>
          <button
            onClick={() => onAddToCart(product)}
            disabled={working || inCart}
            className="btn-secondary btn-sm"
            title={inCart ? "Already in your cart" : "Add to cart"}
          >
            {busy === "cart" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ShoppingCart size={13} />
            )}
            {inCart ? "In cart" : "Cart"}
          </button>
          {offerOpen && (
            <button
              onClick={() => onOffer(product)}
              disabled={working}
              className="btn-secondary btn-sm col-span-2"
              title={`Send a price offer to the seller of ${product.title}`}
            >
              <Tag size={13} /> Make offer
            </button>
          )}
        </div>
        <button
          onClick={() => onRemove(id)}
          className="btn-quiet btn-sm w-full text-muted hover:text-danger"
          title="Remove this product from the comparison"
        >
          <X size={13} /> Remove
        </button>
        <p className="text-[10px] text-muted-soft text-center leading-snug">
          Column {index + 1} of {total}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ offer form -- */

/**
 * Extracted so the closed-comparison screen can still let the customer act on
 * the product they just picked, without duplicating the form.
 */
function OfferModal({ offerFor, amount, busy, onAmount, onSend, onClose }) {
  const price = offerFor?.price || 0;
  const max = Math.max(1, Math.floor(price - 1));
  return (
    <Modal
      open={Boolean(offerFor)}
      onClose={onClose}
      title="Make an offer"
      subtitle={offerFor ? `${offerFor.title} — listed at ${formatINR(price)}` : ""}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onSend} disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Tag size={15} />}
            Send offer
          </button>
        </>
      }
    >
      {offerFor && (
        <div className="space-y-4">
          <div>
            <label htmlFor="offer-amount" className="input-label">
              Your offer
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted pointer-events-none">
                &#8377;
              </span>
              <input
                id="offer-amount"
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={amount}
                onChange={(e) => onAmount(e.target.value)}
                placeholder={String(Math.round(price * 0.9))}
                className="input-field pl-8 tabular"
              />
            </div>
            <p className="input-hint">
              Must be below {formatINR(price)}. Suggested around {formatINR(Math.round(price * 0.9))}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[0.95, 0.9, 0.85, 0.8].map((factor) => {
              const value = Math.round(price * factor);
              return (
                <button
                  key={factor}
                  type="button"
                  onClick={() => onAmount(String(value))}
                  className="chip-idle tabular"
                >
                  {formatINR(value)}
                </button>
              );
            })}
          </div>
          <p className="text-2xs text-muted flex items-start gap-1.5 leading-relaxed">
            <Info size={12} className="flex-none mt-px" />
            Offers are recorded against this listing so the seller can accept, decline or
            counter. You can also message the seller from the product page.
          </p>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ page -- */

export default function Compare() {
  const navigate = useNavigate();
  const {
    products, unavailable, count, max, startedAt, status, error, remove, clearAll, refreshCompare,
  } = useCompareStore();

  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(() => new Set());
  const [cartIds, setCartIds] = useState(() => new Set());
  const [busy, setBusy] = useState({});
  const [gone, setGone] = useState(() => new Set());
  const [offerFor, setOfferFor] = useState(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closedWith, setClosedWith] = useState(null);

  const scrollerRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  // Fallback clock for a session the server did not date. The server clamps
  // whatever arrives, so a wrong value degrades an analytics field rather than
  // breaking the page.
  const mountedAt = useRef(Date.now());
  const hydrated = useRef(false);

  /* Wishlist / cart membership, so the column buttons tell the truth about
     what is already saved. Two requests total, fired once, in parallel, and
     independent of how many products are in the tray. */
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let cancelled = false;
    (async () => {
      const [wl, cart] = await Promise.all([
        api.get("/wishlist").catch(() => null),
        api.get("/cart").catch(() => null),
      ]);
      if (cancelled) return;
      setWishlistIds(new Set((wl?.data?.products || []).map((w) => String(w._id))));
      setCartIds(new Set((cart?.data?.products || []).map((c) => String(c._id))));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setOverflowing(el.scrollWidth - el.clientWidth > 8);
  }, []);

  useEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure, products.length]);

  const onTableScroll = (e) => {
    const left = e.currentTarget.scrollLeft;
    setScrollLeft(left);
    if (e.currentTarget.scrollWidth - e.currentTarget.clientWidth > 8) setOverflowing(true);
  };

  /* ------------------------------------------------------------- actions -- */

  const markGone = (id) => setGone((prev) => new Set(prev).add(String(id)));

  // `remove` already reports its own success/failure, so this stays silent to
  // avoid stacking two toasts on one click.
  const handleRemove = (id) => remove(id);

  const handleWishlist = async (product) => {
    const id = String(product._id);
    const saved = wishlistIds.has(id);
    setBusy((b) => ({ ...b, [id]: "wishlist" }));
    try {
      if (saved) await api.delete(`/wishlist/${id}`);
      else await api.post("/wishlist", { productId: id });
      setWishlistIds((prev) => {
        const next = new Set(prev);
        if (saved) next.delete(id);
        else next.add(id);
        return next;
      });
      toast.success(saved ? "Removed from wishlist" : "Saved to wishlist", { icon: "✓" });
    } catch (err) {
      if (err?.response?.status === 404) markGone(id);
      toast.error(err?.response?.data?.message || "Could not update wishlist", { icon: "⚠️" });
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    }
  };

  const handleAddToCart = async (product) => {
    const id = String(product._id);
    setBusy((b) => ({ ...b, [id]: "cart" }));
    try {
      await api.post("/cart", { productId: id });
      setCartIds((prev) => new Set(prev).add(id));
      toast.success("Added to cart", {
        icon: "✓",
        action: { label: "View cart", onClick: () => navigate("/cart") },
      });
    } catch (err) {
      // 404/409 both mean the listing is gone, which is the one case the column
      // has to react to rather than just complain about.
      if ([404, 409].includes(err?.response?.status)) markGone(id);
      toast.error(err?.response?.data?.message || "Could not add to cart", { icon: "⚠️" });
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    }
  };

  const openOffer = (product) => {
    setOfferFor(product);
    setOfferAmount("");
  };

  const sendOffer = async () => {
    if (!offerFor) return;
    const amount = Number(offerAmount);
    const id = String(offerFor._id);
    if (!amount || amount <= 0) {
      toast.error("Enter the amount you want to offer", { icon: "⚠️" });
      return;
    }
    if (amount >= offerFor.price) {
      toast.error("An offer must be below the listed price", { icon: "⚠️" });
      return;
    }
    setOfferBusy(true);
    try {
      await api.post("/offers", { productId: id, offerAmount: amount });
      toast.success("Offer sent to the seller", { icon: "✓" });
      setOfferFor(null);
      setOfferAmount("");
    } catch (err) {
      if ([404, 409].includes(err?.response?.status)) markGone(id);
      toast.error(err?.response?.data?.message || "Could not send offer", { icon: "⚠️" });
    } finally {
      setOfferBusy(false);
    }
  };

  /**
   * Records the customer's own decision and closes the comparison.
   *
   * This is the only path that calls POST /compare/select, and it is deliberately
   * driven by the customer rather than by a score the marketplace computed: the
   * old page called it automatically for a product it had picked, which recorded
   * a choice nobody made and threw away the whole tray as a side effect.
   */
  const choose = async (product) => {
    const id = String(product._id);
    setClosing(true);
    try {
      // Measured from when the MongoDB session started, not from page mount, so
      // a reload in the middle of a comparison does not report a short duration.
      const from = startedAt ? new Date(startedAt).getTime() : mountedAt.current;
      const durationSec = Number.isFinite(from)
        ? Math.max(0, Math.round((Date.now() - from) / 1000))
        : 0;
      await api.post("/compare/select", { productId: id, durationSec });
      setClosedWith(product);
      // The server has now closed the session, so re-read to empty the cached
      // tray and drop the nav badge. Awaited: the confirmation screen is the
      // last thing this session should show.
      await refreshCompare();
      toast.success(`Choice recorded — ${product.title}`, {
        icon: "✓",
        duration: 4500,
        action: { label: "View offers", onClick: () => navigate("/offers") },
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not record your choice", { icon: "⚠️" });
    } finally {
      setClosing(false);
    }
  };

  /* -------------------------------------------------------------- derived -- */

  const sections = useMemo(
    () => annotateSections(buildSections(products), products),
    [products]
  );

  const price = useMemo(() => priceExtremes(products), [products]);
  const rating = useMemo(() => ratingExtremes(products), [products]);

  const visibleSections = useMemo(
    () => (onlyDiffs ? sections.filter((s) => s.differs) : sections),
    [sections, onlyDiffs]
  );

  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
  const diffRows = sections.reduce((n, s) => n + s.rows.filter((r) => r.differs).length, 0);

  const isLoading = status === "loading" || status === "idle";
  const visibleCount = products.length;
  const trayFull = count >= max;

  /* --------------------------------------------------------------- states -- */

  const masthead = (
    <header className="page-masthead">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="page-eyebrow">
              <ArrowLeftRight size={13} /> Decision desk
            </p>
            <div className="flex items-center gap-2.5">
              <h1 className="page-title">Compare Products</h1>
              <span
                className={`badge ${trayFull ? "badge-warning" : "badge-primary"} tabular`}
                title={`${count} of a maximum of ${max} products selected`}
              >
                {count} / {max}
              </span>
            </div>
            <p className="page-sub">Compare products side-by-side before you decide.</p>
          </div>

          {visibleCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setOnlyDiffs((v) => !v)}
                aria-pressed={onlyDiffs}
                className={`chip ${onlyDiffs ? "chip-active" : "chip-idle"}`}
                title="Show only the attributes where these products differ"
              >
                <Scale size={13} />
                {onlyDiffs ? "Showing differences" : "Show differences only"}
              </button>
              {!trayFull && (
                <Link to="/products" className="btn-secondary btn-sm">
                  <Plus size={14} /> Add products
                </Link>
              )}
              <button
                onClick={clearAll}
                className="btn-quiet btn-sm text-muted hover:text-danger"
                title="Remove every product from this comparison"
              >
                <Trash2 size={14} /> Clear all
              </button>
            </div>
          )}
        </div>

        {visibleCount > 1 && (
          <p className="mt-3 text-2xs text-muted flex items-center gap-1.5">
            <Info size={12} className="flex-none" />
            <span>
              {diffRows} of {totalRows} attributes differ between these products
              {price.distinct ? `, with a ${formatINR(price.spread)} price spread` : ""}.
            </span>
          </p>
        )}
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        {masthead}
        <div className="page-container">
          <SkeletonCompare />
        </div>
      </div>
    );
  }

  /* ---- error: never a blank page ---- */
  if (status === "error" && visibleCount === 0) {
    return (
      <div className="animate-fade-in">
        {masthead}
        <div className="page-container">
          <div className="panel">
            <div className="p-6">
              <div className="alert alert-danger">
                <AlertTriangle size={18} className="flex-none mt-px" />
                <div className="min-w-0">
                  <p className="font-bold">We couldn't load your comparison</p>
                  <p className="text-xs mt-0.5 opacity-90">
                    {error || "Something went wrong on our side. Your saved comparison is safe."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 mt-5">
                <button onClick={refreshCompare} className="btn-primary">
                  <RefreshCw size={15} /> Try again
                </button>
                <Link to="/products" className="btn-secondary">
                  Explore Products
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- the customer made a choice, and the server closed the session ---- */
  if (closedWith) {
    const id = String(closedWith._id);
    return (
      <div className="animate-fade-in">
        {masthead}
        <div className="page-container">
          <div className="panel max-w-lg mx-auto">
            <div className="p-7 text-center">
              <span className="w-14 h-14 rounded-2xl bg-success-soft text-success flex items-center justify-center mx-auto mb-4">
                <Check size={26} />
              </span>
              <h2 className="text-lg font-extrabold text-ink-900 tracking-tight">
                Comparison closed
              </h2>
              <p className="text-sm text-muted mt-1.5 leading-relaxed">
                You picked <span className="font-bold text-ink-900">{closedWith.title}</span> out of{" "}
                {count + 1} product{count === 0 ? "" : "s"}. The tray has been emptied, so start a
                fresh one whenever you are ready to weigh up some more.
              </p>

              <div className="flex items-center gap-3 text-left bg-raised rounded-xl border border-line p-3 mt-5">
                <Link
                  to={`/products/${id}`}
                  className="w-20 h-16 rounded-lg bg-sunken overflow-hidden flex-none border border-line"
                >
                  <img alt="" {...imageProps(closedWith)} className="w-full h-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft">
                    Your pick
                  </p>
                  <p className="text-sm font-bold text-ink-900 line-clamp-1 mt-0.5">
                    {closedWith.title}
                  </p>
                  <p className="text-base font-extrabold text-ink-900 tabular mt-0.5">
                    {formatINR(closedWith.price)}
                  </p>
                </div>
                {closedWith.negotiable && (
                  <button
                    onClick={() => {
                      setClosedWith(null);
                      setOfferFor(closedWith);
                      setOfferAmount("");
                    }}
                    className="btn-secondary btn-sm flex-none"
                    title="Make an offer on the product you chose"
                  >
                    <Tag size={13} /> Offer
                  </button>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2.5 mt-5">
                <Link to={`/products/${id}`} className="btn-primary">
                  <ExternalLink size={15} /> View this listing
                </Link>
                <Link to="/products" className="btn-secondary">
                  <Plus size={15} /> Compare something else
                </Link>
              </div>
            </div>
          </div>
        </div>
        <OfferModal
          offerFor={offerFor}
          amount={offerAmount}
          busy={offerBusy}
          onAmount={setOfferAmount}
          onSend={sendOffer}
          onClose={() => {
            setOfferFor(null);
            setOfferAmount("");
          }}
        />
      </div>
    );
  }

  /* ---- empty ---- */
  if (visibleCount === 0) {
    return (
      <div className="animate-fade-in">
        {masthead}
        <div className="page-container">
          <div className="panel">
            <EmptyState
              icon={ArrowLeftRight}
              title="Nothing to compare yet"
              description="Select products from Explore or Product Details to compare them side-by-side."
              action={
                <Link to="/products" className="btn-primary">
                  Explore Products
                </Link>
              }
            />
            <div className="px-6 pb-8 -mt-2">
              <p className="text-center text-2xs text-muted-soft max-w-md mx-auto leading-relaxed">
                Pick up to {max} listings. ReMarket lines up price, condition, seller trust and every
                specification the sellers filled in, and marks the rows where they disagree.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- one product: show it properly, but do not fake a comparison ---- */
  if (visibleCount === 1) {
    const only = products[0];
    const id = String(only._id);
    return (
      <div className="animate-fade-in">
        {masthead}
        <div className="page-container">
          <div className="alert alert-info mb-5">
            <Info size={18} className="flex-none mt-px" />
            <div>
              <p className="font-bold">Add at least one more product to compare</p>
              <p className="text-xs mt-0.5 opacity-90">
                A comparison needs at least two listings. Yours is saved — add another and the
                side-by-side table appears here.
              </p>
            </div>
          </div>

          <div className="panel max-w-md">
            <div className="flex gap-4 p-4">
              <Link
                to={`/products/${id}`}
                className="w-28 h-24 rounded-xl bg-sunken overflow-hidden flex-none border border-line"
              >
                <img alt="" {...imageProps(only)} className="w-full h-full object-cover" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-bold uppercase tracking-[0.08em] text-muted-soft">
                  {only.brand || "Unbranded"} · {only.categoryName}
                </p>
                <Link
                  to={`/products/${id}`}
                  className="block font-bold text-ink-900 hover:text-primary transition-colors line-clamp-2 mt-1"
                >
                  {only.title}
                </Link>
                <p className="text-lg font-extrabold text-ink-900 tabular mt-1.5">
                  {formatINR(only.price)}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`badge border ${conditionTone(only.condition)}`}>{only.condition}</span>
                  {only.negotiable && <span className="badge badge-accent">Negotiable</span>}
                </div>
              </div>
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              <Link to="/products" className="btn-primary btn-sm flex-1">
                <Plus size={14} /> Add another product
              </Link>
              <Link to="/products" className="btn-secondary btn-sm flex-1">
                Continue Shopping
              </Link>
            </div>
            <div className="px-4 pb-4 -mt-1">
              <button onClick={() => handleRemove(id)} className="btn-quiet btn-sm w-full text-muted hover:text-danger">
                <X size={13} /> Remove from Compare
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- the comparison itself ---- */
  return (
    <div className="animate-fade-in">
      {masthead}

      <div className="page-container">
        {error && (
          <div className="alert alert-warning mb-5">
            <AlertTriangle size={18} className="flex-none mt-px" />
            <p className="text-xs">{error} Some columns may be out of date.</p>
          </div>
        )}

        {unavailable.length > 0 && (
          <div className="alert alert-warning mb-5">
            <AlertTriangle size={18} className="flex-none mt-px" />
            <div className="min-w-0">
              <p className="font-bold">
                {unavailable.length} product{unavailable.length === 1 ? "" : "s"} no longer available
              </p>
              <p className="text-xs mt-0.5 opacity-90 leading-relaxed">
                {unavailable
                  .map((u) => `${u.title || "A listing"}${u.reason === "removed" ? " (deleted)" : ` (${u.reason})`}`)
                  .join(", ")}
                {" — removed from this comparison."}
              </p>
            </div>
          </div>
        )}

        <AtAGlance products={products} />

        {/* Sticky identity rail. A `position: sticky` header row cannot work here:
            the wrapper that scrolls the table sideways is itself a scroll
            container, so a sticky top inside it never moves. This rail is stuck
            to the page instead and translated to match the table's horizontal
            offset, which keeps "which value belongs to which product" answerable
            the whole way down the table on a phone. */}
        {/* Shown whenever the table actually overflows, at any width: a desktop
            window narrowed below ~1350px with a full tray scrolls too, and a
            customer scrolled off the right edge needs the same identity cue. */}
        {overflowing && (
          <div className="sticky top-[68px] z-30 -mx-4 sm:mx-0 mb-3">
            <div className="overflow-hidden bg-raised/95 backdrop-blur-sm border-y border-line py-2">
              <div
                className="flex px-4 sm:px-0"
                style={{ transform: `translateX(-${scrollLeft}px)`, transition: "transform 80ms linear" }}
              >
                <div className={`${LABEL_COL} flex-none`} />
                {products.map((p) => (
                  <div key={p._id} className={`${COL_MIN} px-1 flex-none`}>
                    <p className="truncate text-2xs font-extrabold text-ink-900">{p.title}</p>
                    <p className="truncate text-[10px] font-semibold text-muted tabular">
                      {formatINR(p.price)} · {p.condition}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="relative">
          <div
            ref={scrollerRef}
            onScroll={onTableScroll}
            className="overflow-x-auto rounded-2xl border border-line bg-card shadow-card"
          >
            <table className="w-full text-sm border-separate border-spacing-0">
              <caption className="sr-only">
                Side-by-side comparison of {products.length} selected products
              </caption>

              {/* ---------------- product headers ---------------- */}
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={`${LABEL_COL} sticky left-0 z-20 bg-raised text-left align-bottom
                      px-4 py-4 border-b border-r border-line`}
                  >
                    <span className="label-eyebrow block">Product</span>
                    <span className="text-2xs text-muted-soft mt-1 block">
                      {products.length} selected
                    </span>
                  </th>
                  {products.map((p, i) => {
                    const id = String(p._id);
                    return (
                      <th
                        key={p._id}
                        scope="col"
                        className={`${COL_MIN} px-0 py-0 align-top border-b border-line bg-card`}
                      >
                        <ProductColumn
                          product={p}
                          index={i}
                          total={products.length}
                          isLowestPrice={price.distinct && id === price.lowestId}
                          isHighestPrice={price.distinct && id === price.highestId}
                          isHighestRated={rating.distinct && id === rating.highestId}
                          wishlisted={wishlistIds.has(id)}
                          inCart={cartIds.has(id)}
                          busy={busy[id]}
                          unavailable={gone.has(id) || p.status !== "available"}
                          unavailableReason={gone.has(id) ? "gone" : p.status}
                          onRemove={handleRemove}
                          onAddToCart={handleAddToCart}
                          onWishlist={handleWishlist}
                          onOffer={openOffer}
                          onDetails={(pid) => navigate(`/products/${pid}`)}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* ---------------- attribute rows ---------------- */}
              <tbody>
                {visibleSections.map((section) => {
                  const Icon = SECTION_ICONS[section.icon] || SlidersHorizontal;
                  const rows = onlyDiffs ? section.rows.filter((r) => r.differs) : section.rows;
                  if (!rows.length) return null;
                  const diffCount = rows.filter((r) => r.differs).length;
                  return (
                    /* Fragment carries the key: a section renders a header row
                       plus N attribute rows, and React needs one identity for the
                       group rather than one per row. */
                    <Fragment key={section.key}>
                      <tr>
                        <th
                          scope="colgroup"
                          colSpan={products.length + 1}
                          className="text-left bg-sunken px-4 py-2.5 border-b border-line"
                        >
                          <span className="flex items-center gap-2">
                            <Icon size={14} className="text-primary flex-none" />
                            <span className="text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-900">
                              {section.title}
                            </span>
                            {onlyDiffs ? (
                              <span className="badge badge-primary">{rows.length} differ</span>
                            ) : (
                              diffCount > 0 && (
                                <span className="badge badge-outline">
                                  {diffCount} of {rows.length} differ
                                </span>
                              )
                            )}
                          </span>
                        </th>
                      </tr>
                      {rows.map((row) => (
                        <tr key={row.key} className="group/row">
                          <th
                            scope="row"
                            title={row.hint}
                            className={`${LABEL_COL} sticky left-0 z-10 text-left align-middle px-4 py-3
                              border-b border-r border-line bg-card font-semibold text-xs text-muted
                              group-hover/row:bg-raised transition-colors`}
                          >
                            <span className="flex items-start gap-1.5">
                              <span className="leading-snug">{row.label}</span>
                              {row.differs && (
                                <span
                                  title="These products differ on this attribute"
                                  className="mt-0.5 w-1.5 h-1.5 rounded-full bg-accent flex-none"
                                />
                              )}
                            </span>
                          </th>
                          {products.map((p) => {
                            const id = String(p._id);
                            const dead = gone.has(id) || p.status !== "available";
                            return (
                              <td
                                key={id}
                                className={`px-4 py-3 align-middle border-b border-line text-xs
                                  text-ink-700 transition-colors group-hover/row:bg-raised
                                  ${dead ? "opacity-50" : ""}`}
                              >
                                {dead ? <span className="text-muted-soft">{DASH}</span> : row.render(p)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}

                {visibleSections.length === 0 && (
                  <tr>
                    <td
                      colSpan={products.length + 1}
                      className="px-4 py-10 text-center text-sm text-muted"
                    >
                      <Check size={18} className="text-success mx-auto mb-2" />
                      These products match on every attribute ReMarket tracks for them.
                    </td>
                  </tr>
                )}

                {/* ---------------- the customer's own decision ---------------- */}
                <tr>
                  <th
                    scope="row"
                    className={`${LABEL_COL} sticky left-0 z-10 text-left align-middle px-4 py-3.5
                      border-b border-line bg-card`}
                  >
                    <span className="text-xs font-bold text-ink-900 leading-snug">
                      Your decision
                    </span>
                    <span className="text-[10px] text-muted-soft block mt-0.5 leading-snug">
                      Optional
                    </span>
                  </th>
                  {products.map((p) => {
                    const id = String(p._id);
                    const dead = gone.has(id) || p.status !== "available";
                    return (
                      <td key={id} className="px-3 py-3.5 align-middle border-b border-line">
                        {dead ? (
                          <span className="text-muted-soft text-xs">Product unavailable</span>
                        ) : (
                          <button
                            onClick={() => choose(p)}
                            disabled={closing}
                            className="btn-secondary btn-sm w-full"
                            title={`Tell us ${p.title} is the one you are going with. This closes the comparison.`}
                          >
                            {closing ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            This is my pick
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Scroll affordance: the table scrolls sideways on narrow screens, and
              a customer has to know there is more to the right. */}
          {overflowing && (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-muted-soft lg:hidden">
              <ChevronRight size={12} className="flex-none" />
              Swipe the table sideways to see every product
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {!trayFull && (
            <Link to="/products" className="btn-primary">
              <Plus size={15} /> Add another product
            </Link>
          )}
          <Link to="/products" className="btn-secondary">
            Continue Shopping
          </Link>
          <button onClick={refreshCompare} className="btn-quiet btn-sm text-muted">
            <RefreshCw size={14} /> Refresh
          </button>
          <p className="text-2xs text-muted-soft sm:ml-auto text-center sm:text-right max-w-sm leading-relaxed">
            Lowest price and top rating are marked because they are the lowest and highest numbers
            here. Which one matters most is your call — check the condition notes and the seller
            before you pay.
          </p>
        </div>

        {gone.size > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-2xs text-muted">
            <Info size={12} className="flex-none mt-px" />
            <span>
              {formatNumber(gone.size)} column(s) became unavailable while you were comparing. They are
              kept here so you can still see what happened — remove them to tidy up.
            </span>
          </p>
        )}
      </div>

      <OfferModal
        offerFor={offerFor}
        amount={offerAmount}
        busy={offerBusy}
        onAmount={setOfferAmount}
        onSend={sendOffer}
        onClose={() => {
          setOfferFor(null);
          setOfferAmount("");
        }}
      />
    </div>
  );
}
