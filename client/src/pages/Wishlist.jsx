import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Heart, Trash2, ShoppingBag, Scale, Bell, TrendingDown, ArrowLeftRight, ShoppingCart,
} from "lucide-react";
import api from "../services/api.js";
import toast from "react-hot-toast";
import ProductCard from "../components/ProductCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { SkeletonCard } from "../components/Loading.jsx";
import { formatINR } from "../utils/format.js";
import useCompare from "../hooks/useCompare.js";

export default function Wishlist() {
  const [products, setProducts] = useState([]);
  const [watches, setWatches] = useState({});
  const [loading, setLoading] = useState(true);
  const { compareIds, isComparing, toggleCompare } = useCompare();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [wRes, pwRes] = await Promise.all([
        api.get("/wishlist"),
        api.get("/price-watch").catch(() => null),
      ]);
      setProducts(wRes.data.products || []);
      const watchMap = {};
      (pwRes?.data?.watches || []).forEach((w) => {
        watchMap[String(w.product?._id)] = w;
      });
      setWatches(watchMap);
    } catch {}
    setLoading(false);
  };

  const toggleWatch = async (pid, price) => {
    const existing = watches[String(pid)];
    try {
      if (existing) {
        await api.delete(`/price-watch/${existing.watchId}`);
        setWatches((prev) => {
          const n = { ...prev };
          delete n[String(pid)];
          return n;
        });
        toast.success("Price watch removed");
      } else {
        await api.post("/price-watch", { productId: pid, targetPrice: Math.round(price * 0.9) });
        toast.success("We'll alert you on price drops");
        load();
      }
    } catch {}
  };

  const remove = async (pid) => {
    const wl = await api.get("/wishlist").catch(() => null);
    const item = (wl?.data?.products || []).find((p) => String(p._id) === String(pid));
    await api.delete(`/wishlist/${item?._id || pid}`);
    setProducts((prev) => prev.filter((p) => String(p._id) !== String(pid)));
    toast.success("Removed from wishlist");
  };

  const addToCart = async (pid) => {
    try {
      await api.post("/cart", { productId: pid });
      toast.success("Added to cart");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add");
    }
  };

  const totalValue = products.reduce((sum, p) => sum + (p.price || 0), 0);

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="page-eyebrow">
                <Heart size={13} /> Saved items
              </p>
              <div className="flex items-center gap-2.5">
                <h1 className="page-title">Wishlist</h1>
                <span className="badge badge-primary">{products.length}</span>
              </div>
              <p className="page-sub">
                Items you saved for later — refreshed with real-time prices.
              </p>
            </div>
            {products.length > 0 && (
              <div className="flex items-center gap-2.5">
                <div className="text-right hidden sm:block">
                  <p className="text-2xs font-bold uppercase tracking-[0.1em] text-muted">Total value</p>
                  <p className="text-lg font-extrabold text-ink-900 tabular">{formatINR(totalValue)}</p>
                </div>
                <Link to="/compare" className="btn-secondary">
                  <Scale size={16} /> Compare ({compareIds.size})
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {products.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={Heart}
              title="Your wishlist is empty"
              description="Tap the heart on any product to save it here — you'll spot price drops and deals fast."
              action={
                <Link to="/products" className="btn-primary">
                  <ShoppingBag size={16} /> Browse products
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((p) => {
              const watch = watches[String(p._id)];
              const comparing = isComparing(p._id);
              const savedPct =
                p.originalPrice > p.price
                  ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
                  : 0;
              return (
                <div key={String(p._id)} className="group relative">
                  {watch?.priceDropped ? (
                    <div className="absolute top-2.5 left-2.5 z-20">
                      <span className="badge bg-success text-white shadow-sm">
                        <TrendingDown size={11} /> Drop · {formatINR(p.price)}
                      </span>
                    </div>
                  ) : savedPct >= 10 ? (
                    <div className="absolute top-2.5 left-2.5 z-20">
                      <span className="badge bg-danger text-white shadow-sm">Save {savedPct}%</span>
                    </div>
                  ) : null}

                  <ProductCard product={p} />

                  <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5">
                    <button
                      onClick={() => addToCart(p._id)}
                      title="Add to cart"
                      aria-label="Add to cart"
                      className="w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border border-line shadow-xs
                        text-ink-700 hover:bg-primary hover:text-white hover:border-primary transition-all"
                    >
                      <span className="flex items-center justify-center h-full">
                        <ShoppingCart size={14} />
                      </span>
                    </button>
                    <button
                      onClick={() => toggleCompare(p._id)}
                      title={comparing ? "Remove from compare" : "Add to compare"}
                      aria-label="Toggle compare"
                      className={`w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border shadow-xs flex items-center
                        justify-center transition-all ${
                          comparing
                            ? "text-white bg-primary border-primary"
                            : "text-ink-700 border-line hover:bg-primary hover:text-white hover:border-primary"
                        }`}
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                    <button
                      onClick={() => toggleWatch(String(p._id), p.price)}
                      title={watch ? "Stop watching" : "Watch for price drops"}
                      aria-label="Toggle price watch"
                      className={`w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border shadow-xs flex items-center
                        justify-center transition-all ${
                          watch
                            ? "text-white bg-accent border-accent"
                            : "text-ink-700 border-line hover:bg-accent hover:text-white hover:border-accent"
                        }`}
                    >
                      <Bell size={14} className={watch ? "fill-current" : ""} />
                    </button>
                    <button
                      onClick={() => remove(String(p._id))}
                      title="Remove"
                      aria-label="Remove from wishlist"
                      className="w-8 h-8 rounded-lg bg-white/92 backdrop-blur-md border border-line shadow-xs
                        text-danger hover:bg-danger hover:text-white hover:border-danger flex items-center
                        justify-center transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {watch && (
                    <p className="mt-2 text-2xs text-muted flex items-center gap-1.5 px-0.5">
                      <Bell size={11} className="text-accent" />
                      Watching for {formatINR(watch.targetPrice)} or less
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
