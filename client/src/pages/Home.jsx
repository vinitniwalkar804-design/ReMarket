import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, ArrowRight, ShieldCheck, BadgePercent, BellRing, MapPin, Laptop, Smartphone,
  BookOpen, Calculator, Bike, Armchair, Zap, Gamepad2, Package, Store, Heart, MessageCircle,
  Sparkles, Tag, Flame, TrendingUp, ArrowUpRight, Recycle,
} from "lucide-react";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import ProductCard from "../components/ProductCard.jsx";
import { SkeletonCard } from "../components/Loading.jsx";
import { initials } from "../utils/format.js";
import { seriesColor } from "../utils/theme.js";
import useCompare from "../hooks/useCompare.js";
import { useAuth } from "../context/AuthContext.jsx";

const CATEGORY_ICONS = {
  Laptops: Laptop,
  Smartphones: Smartphone,
  Books: BookOpen,
  Calculators: Calculator,
  Cycles: Bike,
  Furniture: Armchair,
  Electronics: Zap,
  Gaming: Gamepad2,
  Accessories: Package,
};

const PROMISES = [
  {
    icon: MapPin,
    title: "Local & campus pickups",
    desc: "Buy from verified sellers nearby and skip the shipping wait entirely.",
    to: "/products",
  },
  {
    icon: Heart,
    title: "Prices that make you smile",
    desc: "Sellers set honest prices — most listings save you 30%+ against buying new.",
    to: "/products",
  },
  {
    icon: MessageCircle,
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

function SectionHead({ eyebrow, title, sub, to, linkLabel }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {to && (
        <Link to={to} className="link-more flex-none">
          {linkLabel} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  const [settings, setSettings] = useState(null);
  const [trending, setTrending] = useState([]);
  const [deals, setDeals] = useState([]);
  const [nearby, setNearby] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recent, setRecent] = useState([]);
  const [recommended, setRecommended] = useState(null);
  const [continueItems, setContinueItems] = useState([]);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isComparing, toggleCompare } = useCompare();

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, tRes, cRes, rRes, nRes, wRes] = await Promise.all([
          api.get("/settings/public"),
          api.get("/products/trending?limit=8"),
          api.get("/products/categories"),
          api.get("/products/recent?limit=8").catch(() => null),
          api.get("/products/recommended?limit=4").catch(() => null),
          api.get("/wishlist").catch(() => null),
        ]);
        setSettings(sRes.data);
        setTrending(tRes.data.products || []);
        setCategories(cRes.data.categories || []);
        setRecent(rRes?.data?.products || []);
        setRecommended(nRes?.data || null);
        setWishlistIds(new Set((wRes?.data?.products || []).map((w) => String(w._id))));
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadPersonal = async () => {
      const [dRes, nbRes, sRes, cRes] = await Promise.all([
        api.get("/products/deals?limit=4").catch(() => null),
        api.get(`/products/nearby?location=${encodeURIComponent(user.location || "")}&limit=4`).catch(() => null),
        api.get("/users/verified-sellers").catch(() => null),
        api.get("/search/continue").catch(() => null),
      ]);
      setDeals(dRes?.data?.products || []);
      setNearby(nbRes?.data?.products?.length ? { ...nbRes.data, location: user.location } : null);
      setSellers(sRes?.data?.sellers || []);
      setContinueItems(cRes?.data?.items || []);
    };
    loadPersonal();
  }, [user]);

  const handleSearch = (e) => {
    e?.preventDefault();
    if (search.trim()) {
      behavior.search(search.trim());
      navigate(`/products?search=${encodeURIComponent(search.trim())}`);
    }
  };

  const toggleWishlist = async (productId) => {
    const present = wishlistIds.has(String(productId));
    try {
      if (present) {
        const wishlist = await api.get("/wishlist").catch(() => null);
        const item = (wishlist?.data?.products || []).find((w) => String(w._id) === String(productId));
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

  const hero = settings || {};

  const card = (p) => (
    <Link key={p._id} to={`/products/${p._id}`} className="block h-full">
      <ProductCard
        product={p}
        onWishlist={toggleWishlist}
        wishlisted={wishlistIds.has(String(p._id))}
        onCompare={user ? toggleCompare : undefined}
        comparing={isComparing(p._id)}
      />
    </Link>
  );

  const grid = (products) => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{products.map(card)}</div>
  );

  return (
    <div className="animate-fade-in">
      {/* ================= HERO ================= */}
      <section className="mesh-primary text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-dots opacity-40" />
        <div className="absolute -top-32 right-0 w-[26rem] h-[26rem] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-40 left-10 w-[24rem] h-[24rem] rounded-full bg-accent/20 blur-3xl" />

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur border border-white/15 px-3.5 py-1.5 text-2xs font-bold uppercase tracking-[0.14em] mb-6">
              <Recycle size={13} className="text-brand-300" />
              {hero.siteName || "ReMarket"} · {hero.siteTagline || "Give good things a second life."}
            </span>

            <h1 className="text-[2.4rem] sm:text-6xl font-extrabold leading-[1.05] tracking-[-0.03em] text-white text-balance">
              {hero.heroHeadline || "Great finds, second life, zero waste."}
            </h1>

            <p className="text-base sm:text-lg text-white/70 mt-5 max-w-2xl leading-relaxed">
              {hero.heroSubheadline ||
                "The campus marketplace where trusted sellers and smart buyers meet. Compare, negotiate, and let the platform learn your shopping style."}
            </p>

            <form
              onSubmit={handleSearch}
              className="flex items-center gap-2 bg-white rounded-2xl p-1.5 max-w-xl mt-8 shadow-pop"
            >
              <Search size={18} className="ml-3 text-muted-soft shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search laptops, phones, books…"
                aria-label="Search marketplace"
                className="flex-1 px-2 py-2.5 text-sm text-ink-900 bg-transparent outline-none placeholder:text-muted-soft min-w-0"
              />
              <button type="submit" className="btn-primary flex-none">
                Search <ArrowRight size={15} />
              </button>
            </form>

            <div className="grid sm:grid-cols-3 gap-3 mt-9 max-w-2xl">
              {[
                { icon: ShieldCheck, label: "Verified sellers", sub: "Rating & history", to: "/products" },
                { icon: BadgePercent, label: "Negotiable deals", sub: "Make offers", to: "/products" },
                { icon: BellRing, label: "Price-drop alerts", sub: "Watch & save", to: "/notifications" },
              ].map((f) => (
                <Link
                  key={f.label}
                  to={f.to}
                  className="group rounded-xl bg-white/[0.07] backdrop-blur border border-white/12 p-3.5
                    hover:bg-white/[0.13] hover:border-white/25 transition-all duration-200"
                >
                  <f.icon size={17} className="text-brand-300 mb-2" />
                  <p className="text-xs font-bold leading-tight">{f.label}</p>
                  <p className="text-2xs text-white/55 mt-0.5">{f.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= CONTINUE SEARCH ================= */}
        {continueItems.length > 0 && (
          <section className="py-12">
            <SectionHead
              eyebrow="Pick up where you left off"
              title="Continue your search"
              sub="Fresh matches for your most recent searches"
            />
            <div className="space-y-10">
              {continueItems.slice(0, 2).map((item) => (
                <div key={item.query}>
                  <Link
                    to={`/products?search=${encodeURIComponent(item.query)}`}
                    className="group inline-flex items-center gap-1.5 text-sm font-bold text-primary mb-4 hover:underline"
                  >
                    &ldquo;{item.query}&rdquo;
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
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

        {/* ================= TRENDING ================= */}
        <section className="py-12">
          <SectionHead
            eyebrow={<><Flame size={13} /> Trending now</>}
            title="Most wanted this week"
            sub="Most viewed and just-added listings"
            to="/products"
            linkLabel="View all"
          />
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            grid(trending)
          )}
        </section>
      </div>

      {/* ================= DEALS ================= */}
      {deals.length > 0 && (
        <section className="bg-card border-y border-line">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <SectionHead
              eyebrow={<><Tag size={13} /> Best value</>}
              title="Price drops & deep deals"
              sub="Haggled-down prices worth a second look"
              to="/products?minDiscount=10"
              linkLabel="All deals"
            />
            {grid(deals)}
          </div>
        </section>
      )}

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= NEARBY ================= */}
        {nearby && (
          <section className="py-12">
            <SectionHead
              eyebrow={<><MapPin size={13} /> Close to you</>}
              title={`Products near ${nearby.location || "you"}`}
              sub={`Local sellers close to ${nearby.location || "your location"} — fast pickup, zero shipping`}
              to={`/products?location=${encodeURIComponent(nearby.location || "")}`}
              linkLabel="Nearby all"
            />
            {grid(nearby.products)}
          </section>
        )}

        {/* ================= VERIFIED SELLERS ================= */}
        {sellers.length > 0 && (
          <section className="py-12">
            <SectionHead
              eyebrow={<><ShieldCheck size={13} /> Trusted on campus</>}
              title="Verified sellers"
              sub="Top-rated sellers with a real track record"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {sellers.slice(0, 4).map((s) => (
                <Link key={s._id} to={`/seller/${s._id}`} className="card card-hover p-5 flex flex-col">
                  <span className="avatar w-12 h-12 text-base mb-3.5">{initials(s.name)}</span>
                  <p className="font-bold text-ink-900 truncate">{s.name}</p>
                  <p className="text-xs text-muted mt-0.5">{s.location || "Campus"}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line">
                    <span className="badge badge-warning">★ {s.sellerRating?.toFixed?.(1) ?? "—"}</span>
                    <span className="badge badge-neutral">
                      {s.activeListings ?? 0} listing{s.activeListings === 1 ? "" : "s"}
                    </span>
                    <span className="badge badge-neutral">{s.soldCount ?? 0} sold</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ================= CATEGORIES ================= */}
        <section className="py-12">
          <SectionHead
            eyebrow={<><Package size={13} /> Departments</>}
            title="Browse categories"
            sub="From study must-haves to weekend gear"
            to="/categories"
            linkLabel="All categories"
          />
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
            {categories.map((cat, ci) => {
              const Icon = CATEGORY_ICONS[cat.name] || Package;
              const tint = seriesColor(ci);
              return (
                <Link
                  key={cat._id}
                  to={`/products?category=${cat._id}`}
                  onClick={() => behavior.categoryView(cat.name)}
                  className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-line
                    card-hover text-center"
                >
                  <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: `${tint}1A`, color: tint }}
                  >
                    <Icon size={19} />
                  </span>
                  <span className="text-xs font-bold text-ink-800 leading-tight">{cat.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* ================= RECOMMENDED ================= */}
      {recommended?.recommendations?.length > 0 && (
        <section className="bg-card border-y border-line">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-end justify-between gap-4 mb-6">
              <div className="min-w-0">
                <p className="page-eyebrow"><Sparkles size={13} /> Personalised for you</p>
                <h2 className="section-title">Picked for your style</h2>
                <p className="section-sub">
                  {recommended.strategy === "discount_focused"
                    ? "Based on your negotiation & cart activity — the best deals first"
                    : "Based on your browsing, reviews & trust signals — top-rated picks"}
                  {recommended.preferredCategories?.length > 0 &&
                    ` · favourites in ${recommended.preferredCategories.map((c) => c.name).join(", ")}`}
                </p>
              </div>
              <span className="badge badge-primary flex-none">
                {recommended.strategy === "discount_focused" ? "Deeper deals" : "Top rated"}
              </span>
            </div>
            {grid(recommended.recommendations)}
          </div>
        </section>
      )}

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ================= RECENT ================= */}
        {recent.length > 0 && (
          <section className="py-12">
            <SectionHead
              eyebrow={<><TrendingUp size={13} /> Just listed</>}
              title="Fresh arrivals"
              sub="Newest listings from local sellers"
              to="/products"
              linkLabel="View all"
            />
            {grid(recent)}
          </section>
        )}

        {/* ================= PROMISES ================= */}
        <section className="py-12">
          <div className="grid sm:grid-cols-3 gap-4">
            {PROMISES.map((f) => (
              <Link key={f.title} to={f.to} className="card card-hover p-6 group">
                <span className="feature-icon mb-4 group-hover:scale-105 transition-transform duration-200">
                  <f.icon size={20} />
                </span>
                <h3 className="text-[15px] font-bold text-ink-900 mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
                <span className="link-more mt-4">
                  Learn more <ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section className="pb-16">
          <div className="relative overflow-hidden rounded-3xl mesh-primary text-white p-8 sm:p-12">
            <div className="absolute inset-0 bg-dots opacity-30" />
            <div className="relative max-w-3xl">
              <span className="inline-flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.14em] bg-white/10 border border-white/15 rounded-full px-3 py-1 mb-5">
                <Store size={12} /> How ReMarket works
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-[1.12]">
                Sell what you&apos;ve outgrown.
                <br />
                Buy what you&apos;ve outshopped.
              </h2>
              <div className="grid sm:grid-cols-3 gap-6 mt-9">
                {STEPS.map((s) => (
                  <div key={s.n} className="flex gap-3">
                    <span className="text-3xl font-extrabold text-brand-300 tabular leading-none">
                      {s.n}
                    </span>
                    <div>
                      <h3 className="font-bold text-white text-sm">{s.label}</h3>
                      <p className="text-xs text-white/55 mt-1 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to="/sell"
                  className="btn bg-white text-ink-900 hover:bg-white/90 font-bold shadow-pop"
                >
                  Start selling <ArrowRight size={15} />
                </Link>
                <Link
                  to="/products"
                  className="btn bg-white/10 text-white border border-white/20 hover:bg-white/20"
                >
                  Browse marketplace
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
