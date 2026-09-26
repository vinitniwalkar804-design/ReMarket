import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import toast from "react-hot-toast";
import { CreditCard, MapPin, Package, Lock, Store, Loader2, Banknote } from "lucide-react";
import { formatINR, initials } from "../utils/format.js";
import { imageProps } from "../utils/images.js";

const REASONS = [
  "Lowest price", "Best condition", "Seller rating",
  "Brand", "Location", "Reviews", "Urgent requirement", "Other",
];

const STEPS = ["Address", "Payment", "Review"];

export default function Checkout() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState({ line1: "", city: "", postalCode: "", phone: "" });
  const [payment, setPayment] = useState("card");

  useEffect(() => {
    api
      .get("/cart")
      .then(({ data }) => {
        setItems(data.products || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const total = items.reduce((s, i) => s + (i.product?.price || 0), 0);
  const savings = items.reduce(
    (s, i) => s + Math.max(0, (i.product?.originalPrice || 0) - (i.product?.price || 0)),
    0
  );

  const groups = Object.values(
    items.reduce((acc, item) => {
      const sid = item.product?.seller?._id || "unknown";
      if (!acc[sid]) acc[sid] = { seller: item.product?.seller || null, items: [] };
      acc[sid].items.push(item);
      return acc;
    }, {})
  );

  const handleCheckout = async () => {
    if (items.length === 0) return toast.error("Cart is empty");
    if (!address.line1.trim() || !address.city.trim() || !address.postalCode.trim())
      return toast.error("Add a complete delivery address");
    if (!/^\d{6}$/.test(address.postalCode.trim())) return toast.error("Enter a valid 6-digit PIN code");
    if (address.phone.trim() && !/^\+?[0-9 ()-]{7,15}$/.test(address.phone.trim()))
      return toast.error("Enter a valid phone number");
    setProcessing(true);
    behavior.checkoutStart("place_order", total);
    try {
      const { data } = await api.post("/orders/bulk", {
        items: items.map((item) => ({ productId: item.product._id })),
        purchaseReason: reason,
        paymentMethod: payment,
        shippingAddress: {
          line1: address.line1.trim(),
          city: address.city.trim(),
          postalCode: address.postalCode.trim(),
          phone: address.phone.trim() || undefined,
        },
      });
      toast.success("Orders placed successfully!");
      navigate("/orders");
    } catch (err) {
      toast.error(err.response?.data?.message || "Checkout failed");
    } finally {
      setProcessing(false);
    }
  };

  if (loading)
    return (
      <div className="page-container">
        <div className="h-8 w-1/3 bg-sunken rounded-lg animate-pulse mb-8 mx-auto" />
      </div>
    );

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 text-center">
          <p className="page-eyebrow justify-center">
            <Lock size={13} /> Secure checkout
          </p>
          <h1 className="page-title">Checkout</h1>
          <p className="page-sub mx-auto">
            Almost there — finalising {items.length} {items.length === 1 ? "item" : "items"}.
          </p>

          <ol className="flex items-center justify-center gap-2 mt-6">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink-700">
                  <span className="w-5 h-5 rounded-full bg-primary-soft text-primary flex items-center justify-center text-2xs">
                    {i + 1}
                  </span>
                  {s}
                </span>
                {i < STEPS.length - 1 && <span className="w-6 h-px bg-line-strong" />}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {/* ============ ADDRESS ============ */}
        <section className="card p-6">
          <h2 className="text-sm font-extrabold text-ink-900 mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-primary" /> Delivery address
          </h2>
          <div className="grid gap-3">
            <input
              value={address.line1}
              onChange={(e) => setAddress((prev) => ({ ...prev, line1: e.target.value }))}
              className="input-field"
              placeholder="Street / locality"
              autoComplete="address-line1"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={address.city}
                onChange={(e) => setAddress((prev) => ({ ...prev, city: e.target.value }))}
                className="input-field"
                placeholder="City"
                autoComplete="address-level2"
              />
              <input
                value={address.postalCode}
                onChange={(e) =>
                  setAddress((prev) => ({ ...prev, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))
                }
                className="input-field"
                placeholder="PIN code"
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </div>
            <input
              value={address.phone}
              onChange={(e) => setAddress((prev) => ({ ...prev, phone: e.target.value }))}
              className="input-field"
              placeholder="Phone (optional)"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
        </section>

        {/* ============ REASON ============ */}
        <section className="card p-6">
          <h2 className="text-sm font-extrabold text-ink-900 mb-1">Why did you pick these?</h2>
          <p className="text-xs text-muted mb-3.5">Helps us recommend better products to you.</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`chip ${reason === r ? "chip-active" : ""}`}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        {/* ============ PAYMENT ============ */}
        <section className="card p-6">
          <h2 className="text-sm font-extrabold text-ink-900 mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-primary" /> Payment method
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { key: "card", label: "Card / UPI", icon: CreditCard },
              { key: "cod", label: "Cash on delivery", icon: Banknote },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setPayment(key)}
                className={`chip justify-center py-3 ${payment === key ? "chip-active" : ""}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </section>

        {/* ============ REVIEW ============ */}
        <section className="card p-6">
          <h2 className="text-sm font-extrabold text-ink-900 mb-4 flex items-center gap-2">
            <Package size={16} className="text-primary" /> Review items ({items.length})
          </h2>

          <div className="space-y-4">
            {groups.map((group) => {
              const seller = group.seller;
              const groupTotal = group.items.reduce((s, i) => s + (i.product?.price || 0), 0);
              return (
                <div key={seller?._id || "unknown"}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-extrabold text-white flex-none ${
                        seller?.isVerifiedSeller ? "bg-primary" : "bg-ink-700"
                      }`}
                    >
                      {initials(seller?.name || "S")}
                    </span>
                    <span className="text-xs font-bold text-ink-900 flex items-center gap-1.5">
                      <Store size={12} className="text-muted" />
                      {seller?.name || "Marketplace seller"}
                    </span>
                    <span className="ml-auto text-xs font-bold text-ink-700 tabular">
                      {formatINR(groupTotal)}
                    </span>
                  </div>
                  <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                    {group.items.map((item) => (
                      <div key={item.cartId} className="flex items-center gap-3 py-2.5 px-3 bg-raised/40">
                        <div className="w-9 h-9 rounded-lg bg-sunken overflow-hidden flex-none">
                          <img
                            alt={item.product?.title || ""}
                            {...imageProps(item.product)}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-ink-900 truncate">{item.product?.title}</div>
                          <div className="text-2xs text-muted">{item.product?.condition}</div>
                        </div>
                        <span className="font-extrabold text-sm text-ink-900 tabular">
                          {formatINR(item.product?.price || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-line pt-4 mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-ink-600">
              <span>Subtotal</span>
              <span className="font-bold tabular">{formatINR(total)}</span>
            </div>
            {savings > 0 && (
              <div className="flex justify-between text-ink-600">
                <span>You save</span>
                <span className="font-bold text-success tabular">−{formatINR(savings)}</span>
              </div>
            )}
            <div className="flex justify-between text-ink-600">
              <span>Platform fee</span>
              <span className="font-bold text-success">Free</span>
            </div>
            <div className="flex justify-between font-extrabold text-lg text-ink-900 pt-1.5">
              <span>Total</span>
              <span className="tabular">{formatINR(total)}</span>
            </div>
            <p className="text-2xs text-muted pt-1">
              {groups.length > 1
                ? `Placed as ${groups.length} orders — one per seller.`
                : "Shipped directly by the seller."}
            </p>
          </div>
        </section>

        <button
          onClick={handleCheckout}
          disabled={processing || items.length === 0}
          className="btn-primary w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Placing order…
            </>
          ) : (
            <>
              <Lock size={16} />{" "}
              {payment === "cod" ? "Place order (cash on delivery)" : `Pay ${formatINR(total)}`}
            </>
          )}
        </button>

        <p className="text-2xs text-muted text-center pb-4">
          Encrypted payment · seller ships within 48h · easy returns
        </p>
      </div>
    </div>
  );
}
