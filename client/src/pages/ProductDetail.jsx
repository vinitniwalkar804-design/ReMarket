import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Heart, ShoppingCart, ArrowLeftRight, Tag, Shield, ChevronRight, MessageCircle,
  Bell, ShoppingBag, Truck, RotateCcw, Package, TrendingDown, Activity, ArrowUpRight,
  CheckCircle2, Layers, Leaf, ChevronLeft, Flag,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import toast from "react-hot-toast";
import Modal from "../components/Modal.jsx";
import ProductCard from "../components/ProductCard.jsx";
import StarRating from "../components/StarRating.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useCompare from "../hooks/useCompare.js";
import { formatINR, formatDate, discountPercent, timeAgo } from "../utils/format.js";
import { conditionTone, listingTone, C, chartAxis, chartGrid, chartTooltip } from "../utils/theme.js";
import { REPORT_REASONS, isModerated, listingLabel, listingStatusSentence, reasonLabel } from "../utils/moderation.js";
import { getProductImages, imageProps } from "../utils/images.js";

const PURCHASE_REASONS = ["Reviews", "Best condition", "Price", "Brand", "Verified seller", "Recommended"];

const TRUST = [
  { icon: Shield, label: "Verified sellers", sub: "Ratings & history" },
  { icon: RotateCcw, label: "Returnable", sub: "Clear policies" },
  { icon: ShoppingBag, label: "Local pickup", sub: "Meet & collect" },
];

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isComparing, toggleCompare } = useCompare();
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [offers, setOffers] = useState([]);
  const [activeOfferId, setActiveOfferId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offerModal, setOfferModal] = useState(false);
  const [buyModal, setBuyModal] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [purchaseReason, setPurchaseReason] = useState("Reviews");
  const [activeImage, setActiveImage] = useState(0);
  const [chatMsg, setChatMsg] = useState("");
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("misleading_details");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Compare membership comes from the shared tray store, not from a
        // per-page GET /compare. This page used to fetch its own copy, which
        // meant a second round trip and a second source of truth that could
        // disagree with the Compare page.
        const [pRes, revRes, simRes, phRes, wlRes, pwRes] = await Promise.all([
          api.get(`/products/${id}`),
          api.get(`/reviews/${id}`),
          api.get(`/products/${id}/similar?limit=4`).catch(() => null),
          api.get(`/products/${id}/price-history`).catch(() => null),
          api.get("/wishlist").catch(() => null),
          api.get("/price-watch").catch(() => null),
        ]);
        api.get("/offers/my").catch(() => null).then((r) => setOffers(r?.data?.offers || []));
        setProduct(pRes.data.product);
        setReviews(revRes.data.reviews || []);
        setSimilar(simRes?.data?.products || []);
        setPriceHistory(phRes?.data?.history || []);
        const wlItems = wlRes?.data?.products || [];
        setWishlistIds(new Set(wlItems.map((w) => String(w._id))));
        const pwItems = pwRes?.data?.watches || [];
        setWatchedIds(new Set(pwItems.map((w) => String(w.product?._id))));
      } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("offer")) {
      const offerVal = params.get("offer");
      setActiveOfferId(/^[0-9a-f]{24}$/i.test(offerVal) ? offerVal : null);
      setBuyModal(true);
      return;
    }
    if (params.get("review") === "1" && product) setReviewModal(true);
  }, [product]);

  useEffect(() => {
    if (!user) return;
    const el = document.getElementById("reviews-section");
    if (!el) return;
    let fired = false;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fired) {
          fired = true;
          behavior.reviewView(id);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [user, id]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="animate-pulse space-y-6">
          <div className="h-3 w-64 bg-sunken rounded-full" />
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              <div className="aspect-[4/3] bg-sunken rounded-2xl" />
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 bg-sunken rounded-xl" />
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="card p-6 space-y-4">
                <div className="h-5 bg-sunken rounded w-2/3" />
                <div className="h-3 bg-sunken rounded w-1/3" />
                <div className="h-10 bg-sunken rounded w-1/2" />
                <div className="h-24 bg-sunken rounded" />
                <div className="h-11 bg-sunken rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page-container text-center py-24">
        <span className="w-16 h-16 rounded-2xl bg-sunken flex items-center justify-center mx-auto mb-5">
          <Package size={28} className="text-muted-soft" />
        </span>
        <h3 className="text-xl font-extrabold text-ink-900">Product not found</h3>
        <p className="text-sm text-muted mt-1.5">It may have been sold or removed.</p>
        <Link to="/products" className="btn-primary mt-6">Browse marketplace</Link>
      </div>
    );
  }

  const seller = product.seller || {};
  const specs = product.specifications || {};
  const images = getProductImages(product);
  const isOwner = user && String(user._id) === String(seller._id);
  const pct = discountPercent(product.price, product.originalPrice);
  const priceMin = priceHistory.length ? Math.min(...priceHistory.map((h) => h.price)) : product.price;
  const priceTrendLow = priceMin < product.price;
  const activeOffer = offers.find((o) => String(o._id) === String(activeOfferId)) || null;
  const agreedPrice = activeOffer?.finalPrice || activeOffer?.offerAmount || null;
  const saved = wishlistIds.has(String(id));
  const inCompare = isComparing(id);
  const watching = watchedIds.has(String(id));

  const toggleWishlist = async () => {
    const present = wishlistIds.has(String(id));
    try {
      if (present) {
        const wl = await api.get("/wishlist").catch(() => null);
        const item = (wl?.data?.products || []).find((w) => String(w._id) === String(id));
        if (item) await api.delete(`/wishlist/${item._id}`);
        setWishlistIds((prev) => {
          const s = new Set(prev);
          s.delete(String(id));
          return s;
        });
        toast.success("Removed from wishlist");
      } else {
        await api.post("/wishlist", { productId: id });
        setWishlistIds((prev) => new Set(prev).add(String(id)));
        toast.success("Saved to wishlist");
      }
    } catch {}
  };

  const togglePriceWatch = async () => {
    const present = watchedIds.has(String(id));
    try {
      if (present) {
        const pw = await api.get("/price-watch").catch(() => null);
        const item = (pw?.data?.watches || []).find(
          (w) => String(w.product?._id || w.productId) === String(id)
        );
        if (item) await api.delete(`/price-watch/${item.watchId}`);
        setWatchedIds((prev) => {
          const s = new Set(prev);
          s.delete(String(id));
          return s;
        });
        toast.success("Price watch removed");
      } else {
        await api.post("/price-watch", { productId: id, targetPrice: Math.round(product.price * 0.9) });
        setWatchedIds((prev) => new Set(prev).add(String(id)));
        toast.success("We'll alert you on price drops");
      }
    } catch {}
  };

  const addToCart = async () => {
    try {
      await api.post("/cart", { productId: id });
      toast.success("Added to cart");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add");
    }
  };

  const sendOffer = async () => {
    if (!offerAmount || Number(offerAmount) <= 0) return;
    if (Number(offerAmount) >= product.price) {
      toast.error("Offer should be below the listed price");
      return;
    }
    try {
      await api.post("/offers", { productId: id, offerAmount: Number(offerAmount) });
      toast.success("Offer sent to seller!");
      setOfferModal(false);
      setOfferAmount("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send offer");
    }
  };

  const buyNow = async () => {
    behavior.checkoutStart("buy_now", product.price);
    try {
      await api.post("/orders", {
        productId: id,
        offerId: activeOffer?._id || undefined,
        type: "buy",
        paymentMethod: "cod",
        purchaseReason,
      });
      toast.success("Order placed!");
      setBuyModal(false);
      navigate("/orders");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to place order");
    }
  };

  const startChat = async () => {
    if (!seller._id) return;
    try {
      const { data } = await api.post("/chats", {
        otherUserId: seller._id,
        productId: id,
        text: chatMsg || `Hi! Is "${product.title}" still available?`,
      });
      navigate(`/messages/${data.chatId}`);
    } catch {
      toast.error("Could not start chat");
    }
  };

  const submitReview = async () => {
    if (!newRating) {
      toast.error("Pick a rating first");
      return;
    }
    try {
      await api.post("/reviews", {
        productId: id,
        sellerId: seller._id,
        rating: newRating,
        comment: newComment.trim() || "Great experience!",
      });
      toast.success("Thanks for your review!");
      setReviewModal(false);
      setNewRating(0);
      setNewComment("");
      const { data } = await api.get(`/reviews/${id}`);
      setReviews(data.reviews || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit review");
    }
  };
  const submitReport = async () => {
    setReporting(true);
    try {
      const { data } = await api.post("/reports", {
        productId: id,
        reason: reportReason,
        details: reportDetails.trim(),
      });
      toast.success(data.message || "Thanks - our team will review this listing");
      setReportModal(false);
      setReportDetails("");
      setReportReason("misleading_details");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not send that report");
    } finally {
      setReporting(false);
    }
  };

  return (

    <div className="animate-fade-in">
      <div className="page-container">
        {/* breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted mb-6 overflow-hidden">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight size={12} className="text-muted-soft flex-none" />
          <Link to="/products" className="hover:text-primary transition-colors">Marketplace</Link>
          <ChevronRight size={12} className="text-muted-soft flex-none" />
          <Link
            to={`/products?category=${product.category}`}
            className="hover:text-primary transition-colors"
          >
            {product.categoryName}
          </Link>
          <ChevronRight size={12} className="text-muted-soft flex-none" />
          <span className="text-ink-800 truncate">{product.title}</span>
        </nav>

        <div className="grid lg:grid-cols-5 gap-6 lg:gap-8 items-start">
          {/* ================= LEFT ================= */}
          <div className="lg:col-span-3 space-y-4">
            {/* gallery */}
            <div className="card overflow-hidden">
              <div className="relative aspect-[4/3] bg-sunken">
                <img
                  alt={product.title}
                  {...imageProps(product, activeImage)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
                  {pct >= 10 && <span className="badge bg-danger text-white shadow-sm px-3 py-1">Save {pct}%</span>}
                  <span className={`badge border backdrop-blur-sm ${conditionTone(product.condition)}`}>
                    {product.condition}
                  </span>
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImage((i) => (i - 1 + images.length) % images.length)}
                      aria-label="Previous image"
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-line flex items-center justify-center text-ink-800 shadow-sm hover:bg-white transition-colors"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <button
                      onClick={() => setActiveImage((i) => (i + 1) % images.length)}
                      aria-label="Next image"
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-line flex items-center justify-center text-ink-800 shadow-sm hover:bg-white transition-colors"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </>
                )}
              </div>

              {images.length > 1 && (
                <div className="flex gap-2.5 p-3 overflow-x-auto no-scrollbar border-t border-line bg-raised">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(i)}
                      aria-label={`View image ${i + 1}`}
                      className={`w-16 h-16 rounded-lg overflow-hidden border-2 flex-none transition-all ${
                        i === activeImage
                          ? "border-primary ring-2 ring-brand-500/20"
                          : "border-transparent opacity-65 hover:opacity-100"
                      }`}
                    >
                      <img
                        alt={`${product.title} - photo ${i + 1}`}
                        {...imageProps(product, i)}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* trust strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TRUST.map((f) => (
                <div key={f.label} className="card p-3.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center flex-none">
                    <f.icon size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink-900 truncate">{f.label}</p>
                    <p className="text-2xs text-muted truncate">{f.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* description + specs */}
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">Description</h2>
                  <p className="panel-sub">What the seller reported about this item</p>
                </div>
              </div>
              <div className="panel-body">
                <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>

                {Object.keys(specs).length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mt-7 mb-3">
                      <Layers size={15} className="text-accent" />
                      <h3 className="text-sm font-bold text-ink-900">Specifications</h3>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                      {Object.entries(specs)
                        .slice(0, 10)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-0"
                          >
                            <dt className="text-xs text-muted capitalize">{k.replace(/_/g, " ")}</dt>
                            <dd className="text-xs font-bold text-ink-900 text-right">{String(v)}</dd>
                          </div>
                        ))}
                    </dl>
                  </>
                )}
              </div>
            </section>

            {/* price history */}
            {priceHistory.length > 1 && (
              <section className="panel">
                <div className="panel-head">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
                      <Activity size={16} />
                    </span>
                    <div>
                      <h2 className="panel-title">Price history</h2>
                      <p className="panel-sub">Every repricing recorded on this listing</p>
                    </div>
                  </div>
                  <span className="badge badge-primary">{priceHistory.length} updates</span>
                </div>
                <div className="panel-body">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={[...priceHistory].reverse()}
                        margin={{ top: 6, right: 6, left: -14, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C.primary} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={C.primary} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...chartGrid} />
                        <XAxis
                          dataKey="createdAt"
                          {...chartAxis}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                          }
                        />
                        <YAxis
                          {...chartAxis}
                          width={52}
                          domain={["dataMin - 100", "dataMax + 100"]}
                          tickFormatter={(v) =>
                            `₹${Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + "k" : Number(v)}`
                          }
                        />
                        <Tooltip
                          {...chartTooltip}
                          formatter={(v) => [formatINR(Number(v)), "Price"]}
                          labelFormatter={(l) => formatDate(l)}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke={C.primary}
                          strokeWidth={2.5}
                          fill="url(#priceGrad)"
                          dot={{ r: 3, fill: C.primary, strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: C.primary, stroke: "#fff", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="alert alert-info mt-4">
                    <TrendingDown size={16} className="flex-none mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      {priceTrendLow
                        ? `Lowest tracked run was ${formatINR(priceMin)} (${timeAgo(priceHistory[0]?.createdAt)}) — a good moment to watch or negotiate.`
                        : "Price tracking started at listing and updates whenever the seller reprices."}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* ================= RIGHT / BUY BOX ================= */}
          <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-[84px]">
            <div className="card overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="badge badge-primary">{product.categoryName}</span>
                  <span className={`badge border ${conditionTone(product.condition)}`}>{product.condition}</span>
                  {product.negotiable && <span className="badge badge-accent">Negotiable</span>}
                  {product.exchangeable && <span className="badge badge-info">Exchange OK</span>}
                  {isOwner && <span className="badge badge-neutral">Your listing</span>}
                  {product.status !== "available" && (
                    <span className={`badge border capitalize ${listingTone(product.status)}`}>
                      {listingLabel(product.status)}
                    </span>
                  )}
                </div>

                {/* A moderated listing is still reachable by its owner and by
                    admins, so this page has to explain the state rather than
                    showing a dead "Buy Now". */}
                {product.status !== "available" && (
                  <div
                    className={`alert ${isModerated(product.status) ? "alert-danger" : "alert-warning"} mt-4`}
                  >
                    <Flag size={15} className="flex-none mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold leading-relaxed">
                        {isOwner ? listingStatusSentence(product) : `This listing is ${listingLabel(product.status).toLowerCase()} and is not available to buy.`}
                      </p>
                      {isOwner && product.moderationNote && (
                        <p className="text-2xs leading-relaxed opacity-90">
                          Note from the moderation team: {product.moderationNote}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <h1 className="text-xl sm:text-2xl font-extrabold text-ink-900 tracking-tight leading-snug">
                  {product.title}
                </h1>
                <p className="text-sm text-muted mt-1.5">
                  {product.brand}
                  {product.model ? ` · ${product.model}` : ""}
                </p>

                <div className="flex items-end justify-between gap-4 mt-5 pt-5 border-t border-line">
                  <div>
                    <p className="label-eyebrow mb-1">Asking price</p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[32px] leading-none font-extrabold text-ink-900 tracking-tight tabular">
                        {formatINR(product.price)}
                      </span>
                      {product.originalPrice > product.price && (
                        <span className="text-sm font-medium text-muted-soft line-through tabular">
                          {formatINR(product.originalPrice)}
                        </span>
                      )}
                    </div>
                    {pct >= 10 && (
                      <p className="text-xs font-bold text-success mt-1.5">
                        {pct}% below original price
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-none">
                    <div className="flex items-center gap-1.5">
                      <StarRating value={product.rating} size={13} />
                      <span className="text-sm font-extrabold text-ink-900 tabular">
                        {Number(product.rating || 0).toFixed(1)}
                      </span>
                    </div>
                    <p className="text-2xs text-muted-soft mt-0.5">{product.reviewCount || 0} reviews</p>
                  </div>
                </div>

                {priceTrendLow && priceHistory.length > 1 && (
                  <div className="alert alert-success mt-5 !py-2.5">
                    <TrendingDown size={15} className="flex-none mt-0.5" />
                    <p className="text-xs leading-relaxed">
                      Price watch: lowest run was <b>{formatINR(priceMin)}</b>,{" "}
                      {timeAgo(priceHistory[0]?.createdAt)}.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-muted mt-5">
                  <MapPin size={15} className="text-accent flex-none" />
                  <span className="truncate">{product.location || "Not specified"}</span>
                  {product.isVerified && (
                    <span className="badge badge-success ml-auto flex-none">
                      <CheckCircle2 size={11} /> Quality checked
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 mt-5 pt-5 border-t border-line">
                  {!isOwner && product.status === "available" ? (
                    <>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button onClick={() => setBuyModal(true)} className="btn-accent">
                          <ShoppingBag size={16} /> Buy Now
                        </button>
                        <button onClick={addToCart} className="btn-primary">
                          <ShoppingCart size={16} /> Add to Cart
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button onClick={() => setOfferModal(true)} className="btn-secondary">
                          <Tag size={14} /> Make Offer
                        </button>
                        <button onClick={startChat} className="btn-secondary">
                          <MessageCircle size={15} />
                          {seller.isVerifiedSeller ? "Chat seller" : "Ask seller"}
                        </button>
                      </div>
                    </>
                  ) : isOwner ? (
                    <Link to="/sell" className="btn-secondary w-full">Manage your listing</Link>
                  ) : (
                    <p className="text-2xs text-muted-soft text-center py-1">
                      This listing is {listingLabel(product.status).toLowerCase()}, so buying and offers are closed.
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      onClick={toggleWishlist}
                      className={`btn-secondary btn-sm w-full ${saved ? "!bg-danger-soft !border-danger/25 !text-danger" : ""}`}
                    >
                      <Heart size={14} className={saved ? "fill-current" : ""} />
                      {saved ? "Saved" : "Save"}
                    </button>
                    <button
                      onClick={() => toggleCompare(id)}
                      title={inCompare ? "Remove this product from Compare" : "Add this product to Compare"}
                      aria-pressed={inCompare}
                      className={`btn-secondary btn-sm w-full ${inCompare ? "!bg-primary-soft !border-brand-200 !text-primary" : ""}`}
                    >
                      <ArrowLeftRight size={14} /> {inCompare ? "In Compare" : "Compare"}
                    </button>
                    <button
                      onClick={() => togglePriceWatch}
                      className={`btn-secondary btn-sm w-full ${watching ? "!bg-primary-soft !border-brand-200 !text-primary" : ""}`}
                    >
                      <Bell size={14} /> {watching ? "Watching" : "Watch"}
                    </button>
                  </div>

                  {/* Reporting is a moderation signal, not a support request, so it
                      lives on the buy box rather than behind a help menu. The
                      server rejects reports on your own listing, and the button
                      reflects that instead of offering an action that will fail. */}
                  {!isOwner && product.status === "available" && (
                    <button onClick={() => setReportModal(true)} className="btn-quiet btn-sm w-full">
                      <Flag size={13} /> Report this listing
                    </button>
                  )}
                </div>

                <p className="flex items-center gap-1.5 text-2xs text-muted-soft mt-4">
                  <Truck size={12} /> Local delivery or pickup available
                  <ArrowUpRight size={11} />
                </p>
              </div>
            </div>

            {/* seller */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-sm font-bold text-ink-900">Seller</h3>
                {seller.isVerifiedSeller && (
                  <span className="badge badge-success">
                    <Shield size={11} /> Verified
                  </span>
                )}
              </div>
              <Link to={`/seller/${seller._id}`} className="flex items-center gap-3 group">
                <span className="avatar w-12 h-12 text-base flex-none">
                  {seller.name?.charAt(0)?.toUpperCase() || "S"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-sm text-ink-900 group-hover:text-primary transition-colors truncate">
                    {seller.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                    <StarRating value={seller.sellerRating || 0} size={11} />
                    <span className="font-semibold">
                      {Number(seller.sellerRating || 0).toFixed(1)}
                    </span>
                    <span className="text-muted-soft">({seller.sellerRatingCount || 0})</span>
                    <span className="text-muted-soft">·</span>
                    <span className="truncate">{product.location}</span>
                  </span>
                </span>
                <ArrowUpRight size={15} className="text-muted-soft group-hover:text-primary transition-colors flex-none" />
              </Link>
            </div>

            {/* circular economy */}
            <div className="card p-5">
              <h3 className="text-sm font-bold text-ink-900 mb-3 flex items-center gap-2">
                <Leaf size={15} className="text-success" />
                What you give it &amp; life it gives back
              </h3>
              <ul className="space-y-2 text-xs text-muted leading-relaxed">
                <li className="flex gap-2">
                  <CheckCircle2 size={14} className="text-success flex-none mt-0.5" />
                  Buying second-hand saves roughly {Math.round(product.price / 1000) * 2} kg of CO₂ versus new.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 size={14} className="text-success flex-none mt-0.5" />
                  Every purchase funds circular, low-waste shopping on campus.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* ================= SIMILAR ================= */}
        {similar.length > 0 && (
          <section className="mt-14">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <h2 className="section-title">Similar products</h2>
                <p className="section-sub">More like this from the marketplace</p>
              </div>
              <Link to="/products" className="link-more">View all</Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {similar.map((p) =>
                String(p._id) === String(id) ? null : (
                  <Link key={p._id} to={`/products/${p._id}`} className="block">
                    <ProductCard product={p} compact />
                  </Link>
                )
              )}
            </div>
          </section>
        )}

        {/* ================= REVIEWS ================= */}
        <section id="reviews-section" className="mt-14 panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Reviews ({reviews.length})</h2>
              <p className="panel-sub">What buyers say about this item</p>
            </div>
            <div className="flex items-center gap-3">
              {reviews.length > 0 && (
                <div className="hidden sm:flex items-center gap-2">
                  <StarRating value={product.rating} size={14} />
                  <span className="text-sm font-extrabold text-ink-900 tabular">
                    {Number(product.rating || 0).toFixed(1)}
                  </span>
                </div>
              )}
              {user && !isOwner && (
                <button
                  onClick={() => {
                    setNewRating(0);
                    setNewComment("");
                    setReviewModal(true);
                  }}
                  className="btn-primary btn-sm"
                >
                  Write a review
                </button>
              )}
            </div>
          </div>
          <div className="panel-body">
            {reviews.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">
                No reviews yet — be the first to review after buying.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {reviews.map((r) => (
                  <div key={r._id} className="rounded-xl border border-line bg-raised p-4">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="avatar w-9 h-9 text-xs flex-none">
                        {r.userId?.name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-ink-900 truncate">
                          {r.userId?.name || "Anonymous"}
                        </p>
                        <p className="text-2xs text-muted-soft">{timeAgo(r.createdAt)}</p>
                      </div>
                      <StarRating value={r.rating} size={11} />
                    </div>
                    <p className="text-xs text-ink-700 leading-relaxed">{r.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ================= OFFER MODAL ================= */}
      <Modal
        open={offerModal}
        onClose={() => setOfferModal(false)}
        title="Make an offer"
        subtitle="Sellers respond instantly — accept, counter or decline."
        footer={
          <>
            <button onClick={() => setOfferModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={sendOffer} className="btn-primary">Send offer</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-primary-soft border border-brand-100 px-4 py-3">
            <span className="text-xs font-semibold text-muted">Listed at</span>
            <span className="text-lg font-extrabold text-primary tabular">
              {formatINR(product.price)}
            </span>
          </div>
          <div>
            <label className="input-label">Your offer (₹)</label>
            <input
              type="number"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              className="input-field"
              placeholder={formatINR(Math.round(product.price * 0.85)).replace("₹", "")}
              autoFocus
            />
            <p className="input-hint">
              Keep it fair — a realistic offer is far more likely to be accepted.
            </p>
          </div>
        </div>
      </Modal>

      {/* ================= BUY MODAL ================= */}
      <Modal
        open={buyModal}
        onClose={() => {
          setBuyModal(false);
          setActiveOfferId(null);
        }}
        title={activeOffer ? "Complete your negotiated purchase" : "Confirm purchase"}
        footer={
          <>
            <button
              onClick={() => {
                setBuyModal(false);
                setActiveOfferId(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button onClick={buyNow} className="btn-accent">
              {activeOffer ? `Confirm at ${formatINR(agreedPrice)}` : "Place order"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {activeOffer && (
            <div className="rounded-xl border border-brand-200 bg-primary-soft p-3.5">
              <p className="text-xs font-extrabold text-primary mb-1 flex items-center gap-1.5">
                <Tag size={12} /> Offer locked in — {activeOffer.rounds} negotiation{" "}
                {activeOffer.rounds === 1 ? "round" : "rounds"}
              </p>
              <p className="text-xs text-muted leading-relaxed">
                Listed <span className="line-through">{formatINR(activeOffer.listedPrice || product.price)}</span>{" "}
                · agreed at <b className="text-ink-900">{formatINR(agreedPrice)}</b> — saving{" "}
                {formatINR(Math.max(0, (activeOffer.listedPrice || product.price) - agreedPrice))}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <div className="w-14 h-14 rounded-lg bg-sunken overflow-hidden flex-none">
              <img alt={product.title} {...imageProps(product)} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900 truncate">{product.title}</p>
              <p className="text-xs text-muted mt-0.5">
                {product.condition} · {product.location}
              </p>
            </div>
            <div className="text-right flex-none">
              <p className="text-sm font-extrabold text-primary tabular">
                {formatINR(agreedPrice || product.price)}
              </p>
              {agreedPrice < product.price && (
                <p className="text-2xs text-muted-soft line-through">{formatINR(product.price)}</p>
              )}
            </div>
          </div>

          <div>
            <label className="input-label">What convinced you? (improves our recommendations)</label>
            <div className="flex flex-wrap gap-2">
              {PURCHASE_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setPurchaseReason(r)}
                  className={purchaseReason === r ? "chip-active" : "chip-idle"}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <p className="text-2xs text-muted-soft">
            Cash on delivery per seller agreement. Plan local pickup or delivery after the order is placed.
          </p>
        </div>
      </Modal>

      {/* ================= REVIEW MODAL ================= */}
      <Modal
        open={reviewModal}
        onClose={() => setReviewModal(false)}
        title="Write a review"
        subtitle="Help other buyers decide with confidence."
        footer={
          <>
            <button onClick={() => setReviewModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={submitReview} disabled={!newRating} className="btn-primary">
              Submit review
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="input-label">How was your experience?</label>
            <div className="flex gap-1.5 py-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setNewRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="transition-transform hover:scale-110"
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill={n <= newRating ? C.rating : "none"}
                    stroke={n <= newRating ? C.rating : C.grid}
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9L12 2.5z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="input-label">Your review</label>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={4}
              className="textarea-field"
              placeholder="Share the condition, delivery experience and value for money…"
            />
          </div>
        </div>
      </Modal>

      {/* ================= REPORT MODAL ================= */}
      <Modal
        open={reportModal}
        onClose={() => setReportModal(false)}
        title="Report this listing"
        subtitle="Our moderators review every report. Tell us what is wrong and we will take a look."
        footer={
          <>
            <button onClick={() => setReportModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={submitReport} disabled={reporting} className="btn-primary">
              {reporting ? "Sending…" : "Send report"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="input-label">What is the problem?</label>
            <div className="space-y-1.5 mt-1">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReportReason(r)}
                  aria-pressed={reportReason === r}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                    reportReason === r
                      ? "bg-primary-soft border-brand-200 text-primary"
                      : "border-line bg-raised text-muted hover:border-brand-100"
                  }`}
                >
                  {reasonLabel(r)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="input-label">Anything else we should know? (optional)</label>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              maxLength={1000}
              className="textarea-field"
              placeholder="Add specifics that help a moderator decide quickly…"
            />
            <p className="text-2xs text-muted-soft mt-1.5">{reportDetails.length}/1000</p>
          </div>
          <p className="text-2xs text-muted-soft leading-relaxed">
            Reports are private. The seller is not told who reported their listing.
          </p>
        </div>
      </Modal>
    </div>
  );
}
