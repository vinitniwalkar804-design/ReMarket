import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Store, MapPin, Shield, MessageCircle, Calendar, Package, CheckCircle2, ArrowLeft, BadgeCheck,
} from "lucide-react";
import api from "../services/api.js";
import ProductCard from "../components/ProductCard.jsx";
import StarRating from "../components/StarRating.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { SkeletonCard } from "../components/Loading.jsx";
import { formatDate } from "../utils/format.js";
import useCompare from "../hooks/useCompare.js";
import { useAuth } from "../context/AuthContext.jsx";

const TRUST = [
  { title: "Identity & contact verified", desc: "Every seller is verified at signup." },
  { title: "Ratings stay public", desc: "Response rates and reviews are visible." },
  { title: "Dispute-safe records", desc: "Orders and behaviour tracked end-to-end." },
];

export default function SellerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { isComparing, toggleCompare } = useCompare();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sRes, wRes] = await Promise.all([
          api.get(`/users/seller/${id}`),
          api.get("/wishlist").catch(() => null),
        ]);
        setSeller(sRes.data.seller);
        setProducts(sRes.data.products || []);
        setWishlistIds(
          new Set(
            (wRes?.data?.wishlist || wRes?.data?.products || []).map((w) =>
              String(w.product?._id || w.productId || w._id)
            )
          )
        );
      } catch {}
      setLoading(false);
    };
    load();
  }, [id]);

  const toggleWishlist = async (productId) => {
    const present = wishlistIds.has(String(productId));
    try {
      if (present) {
        const wl = await api.get("/wishlist").catch(() => null);
        const items = wl?.data?.wishlist || wl?.data?.products || [];
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

  const chat = async () => {
    try {
      const { data } = await api.post("/chats", {
        otherUserId: id,
        text: "Hi! I'm interested in your listings.",
      });
      navigate(`/messages/${data.chatId}`);
    } catch {}
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="animate-pulse space-y-6">
          <div className="h-52 bg-sunken rounded-3xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="page-container">
        <div className="panel">
          <EmptyState
            icon={Store}
            title="Seller not found"
            description="This seller profile no longer exists."
            action={
              <button onClick={() => navigate(-1)} className="btn-primary">
                Go back
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const listed = products.filter((p) => p.status !== "sold");
  const firstName = String(seller.name || "Seller").split(" ")[0];

  return (
    <div className="animate-fade-in">
      <div className="page-container">
        <button
          onClick={() => navigate(-1)}
          className="btn-quiet btn-sm -ml-2 mb-4"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {/* ================= SELLER HERO ================= */}
        <section className="relative overflow-hidden rounded-3xl mesh-primary text-white p-6 sm:p-10">
          <div className="absolute inset-0 bg-dots opacity-30" />
          <div className="absolute -right-24 -top-28 w-80 h-80 rounded-full bg-brand-500/20 blur-3xl" />

          <div className="relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div className="flex items-start gap-5">
                <span className="w-20 h-20 rounded-2xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center text-3xl font-extrabold flex-none">
                  {seller.name?.charAt(0)?.toUpperCase() || "S"}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                      {seller.name}
                    </h1>
                    {seller.isVerifiedSeller && (
                      <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur border border-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        <BadgeCheck size={12} /> Verified seller
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-white/70 mt-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={14} /> {seller.location || "Location not set"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={14} /> Member since {formatDate(seller.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <StarRating value={seller.sellerRating || 0} size={13} />
                      <b className="text-white">
                        {Number(seller.sellerRating || 0).toFixed(1)}
                      </b>
                      <span className="text-white/55">({seller.sellerRatingCount || 0})</span>
                    </span>
                  </div>
                  {seller.bio && (
                    <p className="text-sm text-white/65 mt-3 max-w-xl leading-relaxed">{seller.bio}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 lg:gap-8 flex-none">
                {[
                  { v: listed.length, l: "Active listings" },
                  { v: products.length, l: "Total listed" },
                  { v: seller.sellerRatingCount || 0, l: "Ratings" },
                ].map((s) => (
                  <div key={s.l}>
                    <p className="text-3xl font-extrabold text-white tabular leading-none">{s.v}</p>
                    <p className="text-2xs font-bold uppercase tracking-[0.1em] text-white/50 mt-1.5">
                      {s.l}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ================= LISTINGS ================= */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <p className="page-eyebrow">
                <Package size={13} /> Inventory
              </p>
              <h2 className="section-title">Available from {firstName}</h2>
              <p className="section-sub">
                {listed.length} live {listed.length === 1 ? "listing" : "listings"} · honest
                condition notes, negotiable prices
              </p>
            </div>
            <button onClick={chat} className="btn-primary flex-none">
              <MessageCircle size={16} /> Chat with {firstName}
            </button>
          </div>

          {listed.length === 0 ? (
            <div className="panel">
              <EmptyState
                icon={Package}
                title="No active listings"
                description="This seller doesn't have any available items right now."
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {listed.map((p) => (
                <Link key={p._id} to={`/products/${p._id}`} className="block h-full">
                  <ProductCard
                    product={p}
                    onWishlist={toggleWishlist}
                    wishlisted={wishlistIds.has(String(p._id))}
                    onCompare={user ? toggleCompare : undefined}
                    comparing={isComparing(p._id)}
                  />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ================= TRUST ================= */}
        {seller.isVerifiedSeller && (
          <section className="card mt-10 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-10 h-10 rounded-xl bg-success-soft text-success flex items-center justify-center flex-none">
                <Shield size={20} />
              </span>
              <div>
                <h3 className="font-bold text-ink-900">Why verified sellers matter</h3>
                <p className="text-xs text-muted mt-0.5">
                  Trust signals every buyer can audit before paying
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {TRUST.map((t) => (
                <div key={t.title} className="flex gap-2.5">
                  <CheckCircle2 size={16} className="text-success flex-none mt-0.5" />
                  <div>
                    <p className="text-[13px] font-bold text-ink-900">{t.title}</p>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
