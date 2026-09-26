import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Package, Truck, Star, MessageCircle, ArrowRight } from "lucide-react";
import api from "../services/api.js";
import EmptyState from "../components/EmptyState.jsx";
import { formatINR, formatDate, conditionTone } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/orders")
      .then(({ data }) => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const chatSeller = async (o) => {
    try {
      const { data } = await api.post("/chats", {
        otherUserId: o.productId?.seller?._id || o.sellerId,
        productId: o.productId?._id,
        text: "Hi! Following up on my order.",
      });
      window.open(`/messages/${data.chatId}`, "_self");
    } catch {}
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-8 w-1/4 bg-sunken rounded-lg animate-pulse mb-6" />
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="h-24 bg-sunken rounded-2xl animate-pulse mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="page-eyebrow">
            <Package size={13} /> Purchase history
          </p>
          <div className="flex items-center gap-2.5">
            <h1 className="page-title">My Orders</h1>
            <span className="badge badge-primary">{orders.length}</span>
          </div>
          <p className="page-sub">Track deliveries and re-connect with sellers.</p>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {orders.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={Package}
              title="No orders yet"
              description="Once you purchase something, you'll find the whole trail here — order, tracking and returns."
              action={
                <Link to="/products" className="btn-primary">
                  Start shopping
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const p = o.productId;
              const canReview = o.status === "delivered";
              return (
                <article key={o._id} className="card p-4 card-hover">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <Link
                      to={`/products/${p?._id}`}
                      className="w-16 h-16 rounded-xl bg-sunken overflow-hidden flex-none"
                    >
                      <img alt={p?.title || ""} {...imageProps(p)} className="w-full h-full object-cover" />
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <Link
                          to={`/products/${p?._id}`}
                          className="font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors"
                        >
                          {o.productTitle || p?.title}
                        </Link>
                        {p?.condition && (
                          <span className={`badge ${conditionTone(p.condition)}`}>{p.condition}</span>
                        )}
                        {o.type === "offer" && (
                          <span className="badge bg-accent-soft text-accent border-accent/20">
                            Bought via offer
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-2xs text-muted mt-1.5">
                        <span className="font-mono">Order {String(o._id).slice(-6).toUpperCase()}</span>
                        <span>· {formatDate(o.createdAt)}</span>
                        {o.shippingAddress?.city && <span>· {o.shippingAddress.city}</span>}
                      </div>
                      {o.purchaseReason && (
                        <p className="text-2xs text-muted-soft mt-1">Reason: {o.purchaseReason}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 sm:flex-col sm:items-end gap-y-1.5 flex-none">
                      <span className="font-extrabold text-ink-900 tabular">
                        {formatINR(o.finalPrice || o.amount)}
                      </span>
                      <span className={`badge ${orderTone(o.status)} capitalize`}>{o.status}</span>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-3.5 border-t border-line flex items-center gap-2 flex-wrap">
                    {o.status === "shipped" && (
                      <span className="text-2xs inline-flex items-center gap-1.5 font-bold text-accent">
                        <Truck size={13} /> On its way to you
                      </span>
                    )}
                    {canReview && (
                      <Link to={`/products/${p?._id}?review=1`} className="btn-accent btn-sm">
                        <Star size={13} /> Review this product
                      </Link>
                    )}
                    {p?.seller?._id && (
                      <button onClick={() => chatSeller(o)} className="btn-secondary btn-sm">
                        <MessageCircle size={13} /> Chat with seller
                      </button>
                    )}
                    <Link to={`/products/${p?._id}`} className="link-more ml-auto">
                      View product <ArrowRight size={12} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
