import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, ShoppingBag, ShieldCheck, ArrowRight, Store, Sparkles, Tag } from "lucide-react";
import api from "../services/api.js";
import toast from "react-hot-toast";
import EmptyState from "../components/EmptyState.jsx";
import { formatINR, conditionTone, initials } from "../utils/format.js";
import { imageProps } from "../utils/images.js";
import behavior from "../utils/behavior.js";

export default function Cart() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    behavior.cartView();
  }, []);

  const load = async () => {
    try {
      const { data } = await api.get("/cart");
      setItems(data.products);
      setCount(data.count);
    } catch {}
    setLoading(false);
  };

  const remove = async (cartId) => {
    try {
      await api.delete(`/cart/${cartId}`);
      setItems((prev) => prev.filter((i) => i.cartId !== cartId));
      setCount((c) => Math.max(0, c - 1));
      toast.success("Removed from cart");
    } catch {}
  };

  const total = items.reduce((s, i) => s + (i.product?.price || 0), 0);
  const savings = items.reduce(
    (s, i) => s + Math.max(0, (i.product?.originalPrice || 0) - (i.product?.price || 0)),
    0
  );
  const sellers = new Set(items.map((i) => i.product?.seller?._id).filter(Boolean)).size;

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-24 bg-sunken rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-sunken rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="page-eyebrow">
                <ShoppingBag size={13} /> Your selection
              </p>
              <div className="flex items-center gap-2.5">
                <h1 className="page-title">Cart</h1>
                <span className="badge badge-primary">{count}</span>
              </div>
              <p className="page-sub">Review your selection before checkout — prices are live.</p>
            </div>
            {items.length > 0 && savings > 0 && (
              <span className="badge bg-success-soft text-success border-success/20">
                <ShieldCheck size={12} /> You're saving {formatINR(savings)} vs original
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {items.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Add items you'd like to buy — cart prices stay locked till checkout."
              action={
                <Link to="/products" className="btn-primary">
                  Browse products
                </Link>
              }
            />
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-5">
              {Object.values(
                items.reduce((groups, item) => {
                  const sid = item.product?.seller?._id || "unknown";
                  if (!groups[sid]) groups[sid] = { seller: item.product?.seller || null, items: [] };
                  groups[sid].items.push(item);
                  return groups;
                }, {})
              ).map((group) => {
                const seller = group.seller;
                const groupTotal = group.items.reduce((s, i) => s + (i.product?.price || 0), 0);
                return (
                  <section key={seller?._id || "unknown"} className="card overflow-hidden">
                    <header className="flex items-center gap-3 px-5 py-3.5 bg-raised border-b border-line">
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold text-white flex-none ${
                          seller?.isVerifiedSeller ? "bg-primary" : "bg-ink-700"
                        }`}
                      >
                        {initials(seller?.name || "Store")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Store size={13} className="text-muted flex-none" />
                          <Link
                            to={seller?._id ? `/products?seller=${seller._id}` : "/products"}
                            className="text-sm font-bold text-ink-900 hover:text-primary line-clamp-1 transition-colors"
                          >
                            {seller?.name || "Marketplace seller"}
                          </Link>
                          {seller?.isVerifiedSeller && (
                            <span className="badge bg-primary-soft text-primary border-brand-200">
                              <ShieldCheck size={10} /> Verified
                            </span>
                          )}
                        </div>
                        <p className="text-2xs text-muted mt-0.5">
                          {group.items.length} item{group.items.length === 1 ? "" : "s"} · {formatINR(groupTotal)}
                        </p>
                      </div>
                    </header>

                    <div className="divide-y divide-line">
                      {group.items.map((item) => {
                        const p = item.product;
                        return (
                          <div key={item.cartId} className="flex items-center gap-4 p-4">
                            <Link
                              to={`/products/${p?._id}`}
                              className="w-16 h-16 rounded-xl bg-sunken overflow-hidden flex-none"
                            >
                              <img alt={p?.title || ""} {...imageProps(p)} className="w-full h-full object-cover" />
                            </Link>

                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/products/${p?._id}`}
                                className="font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors"
                              >
                                {p?.title}
                              </Link>
                              <div className="flex items-center flex-wrap gap-2 mt-1.5">
                                <span className={`badge ${conditionTone(p?.condition)}`}>{p?.condition || "—"}</span>
                                {p?.negotiable && (
                                  <span className="badge bg-accent-soft text-accent border-accent/20">
                                    <Tag size={10} /> Negotiable
                                  </span>
                                )}
                              </div>
                              <div className="flex items-baseline gap-2 mt-1.5">
                                <span className="font-extrabold text-ink-900">{formatINR(p?.price || 0)}</span>
                                {p?.originalPrice > p?.price && (
                                  <span className="text-xs text-muted-soft line-through">
                                    {formatINR(p.originalPrice)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={() => remove(item.cartId)}
                              className="btn-ghost p-2 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-all flex-none"
                              title="Remove"
                              aria-label={`Remove ${p?.title} from cart`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* ================= SUMMARY ================= */}
            <aside className="panel p-6 sticky top-24">
              <h2 className="text-base font-extrabold text-ink-900 mb-4">Order summary</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-ink-600">
                  <span>
                    Subtotal ({count} {count === 1 ? "item" : "items"})
                  </span>
                  <span className="font-bold text-ink-900 tabular">{formatINR(total)}</span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>You save</span>
                  <span className="font-bold text-success tabular">
                    {savings > 0 ? `−${formatINR(savings)}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>Platform fee</span>
                  <span className="font-bold text-success">Free</span>
                </div>
                {sellers > 0 && (
                  <div className="flex justify-between text-ink-600">
                    <span>Sellers</span>
                    <span className="font-bold text-ink-900">{sellers}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-line pt-3.5 mt-3.5 mb-5">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-ink-900">Total</span>
                  <span className="font-extrabold text-2xl text-ink-900 tabular">{formatINR(total)}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  behavior.checkoutStart("cart", total);
                  navigate("/checkout");
                }}
                className="btn-primary w-full"
              >
                Proceed to checkout <ArrowRight size={16} />
              </button>

              <p className="flex items-start gap-1.5 text-2xs text-muted mt-3.5">
                <Sparkles size={12} className="flex-none mt-px text-accent" />
                Secure checkout · money-back guarantee on damaged items
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
