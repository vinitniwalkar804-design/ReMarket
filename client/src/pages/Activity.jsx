import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Eye, Search, GitCompareArrows, Heart, BellRing, Tag, ShoppingBag, ArrowRight,
  Timer, TrendingUp, Sparkles, ShieldCheck, ChevronRight,
} from "lucide-react";
import api from "../services/api.js";
import { formatINR, timeAgo } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import ProductCard from "../components/ProductCard.jsx";
import { EmptyState } from "../components/Loading.jsx";
import { imageProps } from "../utils/images.js";

export default function Activity() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState(new Set());

  useEffect(() => {
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
        setState({
          events: timeline?.data?.events || [],
          wishlist: wishlist?.data?.wishlist || wishlist?.data?.products || [],
          compare: compare?.data?.products || [],
          watches: watches?.data?.watches || [],
          offers: offers?.data?.offers || offers?.data || [],
          orders: orders?.data?.orders || orders?.data || [],
          recommended: recommended?.data || null,
          continue: continueRes?.data?.items || [],
        });
        setWishlistIds(
          new Set(
            (wishlist?.data?.wishlist || wishlist?.data?.products || []).map((w) =>
              String(w.product?._id || w.productId || w._id)
            )
          )
        );
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const {
    events = [], wishlist = [], compare = [], watches = [],
    offers = [], orders = [], recommended = null, continue: continueItems = [],
  } = state || {};

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

  const stats = [
    { icon: Eye, label: "Products viewed", value: views.length },
    { icon: Search, label: "Searches", value: searches.length },
    { icon: GitCompareArrows, label: "Compared", value: compare.length },
    { icon: Heart, label: "Saved", value: wishlist.length },
    { icon: BellRing, label: "Price watches", value: watches.length },
    { icon: Tag, label: "Offers sent", value: offers.length },
    { icon: ShoppingBag, label: "Purchases", value: orders.length },
  ];

  const toggleWishlist = async (productId) => {
    const present = wishlistIds.has(String(productId));
    try {
      if (present) {
        const wishlistData = await api.get("/wishlist").catch(() => null);
        const items = wishlistData?.data?.wishlist || wishlistData?.data?.products || [];
        const item = items.find(
          (w) => String(w.product?._id || w.productId || w._id) === String(productId)
        );
        if (item) await api.delete(`/wishlist/${item._id}`);
        setWishlistIds((prev) => {
          const s = new Set(prev);
          s.delete(String(productId));
          return s;
        });
      } else {
        await api.post("/wishlist", { productId });
        setWishlistIds((prev) => new Set(prev).add(String(productId)));
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="h-10 bg-sunken rounded-lg animate-pulse w-1/2" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-24 bg-surface border border-line rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-sunken rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted mb-4">
            <Link to="/profile" className="hover:text-primary transition-colors">Profile</Link>
            <ChevronRight size={12} className="text-muted-soft" />
            <span className="text-ink-900">Shopping insights</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <h1 className="page-title text-balance">Your shopping insights</h1>
              <p className="page-sub max-w-2xl">
                A quiet look at your own activity — what you've viewed, compared and saved. This is how the
                marketplace learns your style and personalizes the home feed for you.
              </p>
            </div>
            <span className="badge bg-primary-soft text-primary border-brand-200 flex-none">
              <ShieldCheck size={13} /> Private to you
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-8">
            {stats.map((s) => (
              <div key={s.label} className="surface-panel p-4 flex flex-col gap-2">
                <s.icon size={17} className="text-primary" />
                <span className="text-xl font-extrabold tabular text-ink-900">{s.value}</span>
                <span className="text-2xs font-semibold text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {continueItems.length > 0 && (
          <section>
            <h2 className="section-title">Pick up where you left off</h2>
            <p className="section-sub mb-4">Matches for your most recent searches</p>
            <div className="space-y-6">
              {continueItems.map((item) => (
                <div key={item.query}>
                  <Link
                    to={`/products?search=${encodeURIComponent(item.query)}`}
                    className="group inline-flex items-center gap-2 text-sm font-bold text-primary mb-3 hover:underline"
                  >
                    <Search size={13} /> "{item.query}"
                    <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {item.products.map((p) => (
                      <Link key={p._id} to={`/products/${p._id}`} className="block h-full">
                        <ProductCard
                          product={{ ...p, seller: p.seller || {} }}
                          onWishlist={toggleWishlist}
                          wishlisted={wishlistIds.has(String(p._id))}
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {recentSearches.length > 0 && (
          <section>
            <h2 className="section-title">Recent searches</h2>
            <p className="section-sub mb-4">Tap to jump back into the search</p>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((q) => (
                <Link
                  key={q}
                  to={`/products?search=${encodeURIComponent(q)}`}
                  className="chip"
                >
                  <Search size={12} /> {q}
                </Link>
              ))}
            </div>
          </section>
        )}

        {viewedProducts.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title">Recently viewed</h2>
                <p className="section-sub">Your browsing trail, kept short and simple</p>
              </div>
              <Link to="/products" className="link-more flex-none">Browse more <ArrowRight size={14} /></Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {viewedProducts.map((v) => {
                const p = v.productId;
                return (
                  <Link
                    key={String(p._id || p)}
                    to={`/products/${p._id || p}`}
                    className="surface-panel p-4 flex items-center gap-4 card-hover"
                  >
                    <div className="w-14 h-14 rounded-xl bg-sunken flex items-center justify-center overflow-hidden flex-none">
                      <img alt="" {...imageProps(p)} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink-800 truncate">{p.title}</p>
                      <p className="text-2xs text-muted mt-0.5">
                        {p.categoryName} · {timeAgo(v.timestamp)}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold text-primary tabular flex-none">
                      {formatINR(p.price)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {compare.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title flex items-center gap-2">
                  <GitCompareArrows size={19} className="text-primary" /> Your comparisons
                </h2>
                <p className="section-sub">Products you put side by side this session</p>
              </div>
              <Link to="/compare" className="link-more flex-none">Open compare <ArrowRight size={14} /></Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {compare.map((p) => (
                <Link key={p._id} to={`/products/${p._id}`} className="block h-full">
                  <ProductCard product={p} />
                </Link>
              ))}
            </div>
          </section>
        )}

        {watches.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title flex items-center gap-2">
                  <BellRing size={19} className="text-primary" /> Price watches
                </h2>
                <p className="section-sub">We'll nudge you the moment these drop to your target</p>
              </div>
              <Link to="/wishlist" className="link-more flex-none">Manage <ArrowRight size={14} /></Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {watches.map((w) => (
                <Link
                  key={w.watchId}
                  to={`/products/${w.product?._id}`}
                  className="surface-panel p-4 flex items-center gap-4 card-hover"
                >
                  <div className="w-12 h-12 rounded-xl bg-sunken flex items-center justify-center overflow-hidden flex-none">
                    <img
                      alt={w.product?.title || ""}
                      {...imageProps(w.product)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-800 truncate">{w.product?.title || "Product"}</p>
                    <p className="text-2xs text-muted mt-0.5">
                      Now <span className="font-bold text-primary tabular">{formatINR(w.product?.price)}</span>
                      {w.targetPrice ? (
                        <span className="text-muted-soft"> → target {formatINR(w.targetPrice)}</span>
                      ) : null}
                    </p>
                  </div>
                  {w.priceDropped && <span className="badge bg-success-soft text-success border-success/20 flex-none">Drop!</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {offers.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title flex items-center gap-2">
                  <Tag size={19} className="text-primary" /> Your offers
                </h2>
                <p className="section-sub">{offersPending} awaiting a seller response</p>
              </div>
              <Link to="/offers" className="link-more flex-none">All offers <ArrowRight size={14} /></Link>
            </div>
            <div className="space-y-2">
              {offers.slice(0, 5).map((o) => (
                <Link
                  key={o._id}
                  to={`/products/${o.productId?._id}`}
                  className="surface-panel p-4 flex items-center gap-4 card-hover"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-800 truncate">{o.productId?.title || "Product"}</p>
                    <p className="text-2xs text-muted mt-0.5">
                      Listed {formatINR(o.listedPrice)} · offered {formatINR(o.offerAmount)} · {timeAgo(o.createdAt)}
                    </p>
                  </div>
                  <span className={`badge capitalize ${orderTone(o.status)}`}>{o.status}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {orders.length > 0 && (
          <section>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title flex items-center gap-2">
                  <ShoppingBag size={19} className="text-primary" /> Your purchases
                </h2>
                <p className="section-sub">Recently bought on the marketplace</p>
              </div>
              <Link to="/orders" className="link-more flex-none">All orders <ArrowRight size={14} /></Link>
            </div>
            <div className="space-y-2">
              {orders.slice(0, 5).map((o) => (
                <Link
                  key={o._id}
                  to={`/products/${o.productId?._id}`}
                  className="surface-panel p-4 flex items-center gap-4 card-hover"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-800 truncate">{o.productTitle || o.productId?.title}</p>
                    <p className="text-2xs text-muted mt-0.5">
                      {timeAgo(o.createdAt)} · {o.purchaseReason || "buy"}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-primary tabular flex-none">
                    {formatINR(o.finalPrice)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {recommended?.recommendations?.length > 0 && (
          <section>
            <h2 className="section-title flex items-center gap-2">
              <Sparkles size={19} className="text-primary" /> Recommended for you
            </h2>
            <p className="section-sub mb-4">
              {recommended.strategy === "discount_focused"
                ? "Deep deals matched to your negotiation style"
                : "Top-rated picks in your favorite categories"}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {recommended.recommendations.map((p) => (
                <Link key={p._id} to={`/products/${p._id}`} className="block h-full">
                  <ProductCard
                    product={p}
                    onWishlist={toggleWishlist}
                    wishlisted={wishlistIds.has(String(p._id))}
                  />
                </Link>
              ))}
            </div>
          </section>
        )}

        {events.length === 0 &&
          wishlist.length === 0 &&
          compare.length === 0 &&
          offers.length === 0 &&
          orders.length === 0 && (
            <div className="panel">
              <EmptyState
                icon={TrendingUp}
                title="No activity yet"
                description="Your shopping trail will appear here as you explore. Search, view and compare a few products and this space will fill up with useful insights."
                action={
                  <Link to="/products" className="btn-primary">
                    Start exploring
                  </Link>
                }
              />
            </div>
          )}

        <section className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-brand-200 bg-primary-soft p-6">
          <span className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center flex-none">
            <Timer size={18} />
          </span>
          <div className="flex-1">
            <h3 className="font-extrabold text-ink-900 text-sm">How your activity helps (without stalking you)</h3>
            <p className="text-xs text-ink-600 mt-1 leading-relaxed">
              Every view, search and comparison quietly shapes your recommendations and the "For you" feed. You
              only ever see your own aggregate numbers here — the marketplace never shows your activity to others.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
