import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import toast from "../toast.js";
import { navigate } from "../navigation.js";
import { formatINR, initials } from "../utils/format.js";
import { imageProps } from "../utils/images.js";
import behavior from "../utils/behavior.js";

/**
 * Checkout.
 *
 * Ported from `frontend/src/pages/Checkout.jsx`: same single-page form, same
 * validation order and messages, same `POST /orders/bulk` payload, same toasts,
 * same navigation, same copy.
 *
 * API contract, verbatim from the React page:
 *
 *   POST /api/orders/bulk
 *   {
 *     items: [{ productId }],            // no quantity - it is always 1
 *     purchaseReason: string,
 *     paymentMethod: "card" | "cod",
 *     shippingAddress: { line1, city, postalCode, phone? },
 *   }
 *
 * `phone` is `address.phone.trim() || undefined`, i.e. the key is dropped from
 * the JSON body entirely when the field is blank. That is reproduced literally
 * rather than sent as `""`, because `undefined` values are dropped by
 * `JSON.stringify` and the backend treats a missing phone differently from an
 * empty one.
 *
 * The backend creates ONE order per item, not one per seller. The
 * "Placed as N orders - one per seller." line below is presentational grouping
 * and is wrong about the API; it is kept because this phase is a behaviour
 * preserving port. Flagged in the phase report.
 *
 * Form inputs are created ONCE and are never repainted away, so typed text can
 * never be clobbered by a state change. Repaints are scoped to the four regions
 * that actually change (reason chips, payment chips, review block, submit
 * button), and all clicks/input events are delegated from the page root, so
 * repainting never attaches a second listener.
 *
 * On success this calls `navigate("/orders")`, exactly as React does. The
 * vanilla `/orders` route is not registered yet because Orders is out of scope
 * for this phase, so that destination is a known, deliberate gap.
 */

const REASONS = [
  "Lowest price",
  "Best condition",
  "Seller rating",
  "Brand",
  "Location",
  "Reviews",
  "Urgent requirement",
  "Other",
];

const STEPS = ["Address", "Payment", "Review"];

const PAYMENT_METHODS = [
  { key: "card", label: "Card / UPI", icon: "CreditCard" },
  { key: "cod", label: "Cash on delivery", icon: "Banknote" },
];

const ADDRESS_FIELDS = {
  line1: { placeholder: "Street / locality", autoComplete: "address-line1" },
  city: { placeholder: "City", autoComplete: "address-level2" },
  postalCode: {
    placeholder: "PIN code",
    inputMode: "numeric",
    autoComplete: "postal-code",
  },
  phone: { placeholder: "Phone (optional)", inputMode: "tel", autoComplete: "tel" },
};

export default function Checkout() {
  const st = {
    items: [],
    processing: false,
    reason: "",
    address: { line1: "", city: "", postalCode: "", phone: "" },
    payment: "card",
  };

  // ---------- teardown ----------

  let disposed = false;
  const cleanups = [];

  const root = h("div", null);

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---------- derived values ----------

  const priceOf = (item) => item.product?.price || 0;

  const total = () => st.items.reduce((s, i) => s + priceOf(i), 0);

  const savings = () =>
    st.items.reduce(
      (s, i) => s + Math.max(0, (i.product?.originalPrice || 0) - priceOf(i)),
      0
    );

  const groups = () => {
    const out = {};
    for (const item of st.items) {
      const sid = item.product?.seller?._id || "unknown";
      if (!out[sid]) out[sid] = { seller: item.product?.seller || null, items: [] };
      out[sid].items.push(item);
    }
    return Object.values(out);
  };

  // ---------- paint regions (created once) ----------

  const subtitleHost = h("p", { className: "page-sub mx-auto" });
  const addressHost = h("div", { className: "grid gap-3" });
  const reasonHost = h("div", { className: "flex flex-wrap gap-2" });
  const paymentHost = h("div", { className: "grid grid-cols-2 gap-2.5" });
  const reviewHost = h("div", null);
  const submitHost = h("div", null);

  /** The controlled inputs own their value; read them back into state. */
  const syncFromDom = () => {
    for (const el of addressHost.querySelectorAll("input[data-field]")) {
      st.address[el.dataset.field] = el.value;
    }
  };

  const paintSubtitle = () => {
    const n = st.items.length;
    mount(subtitleHost, `Almost there — finalising ${n} ${n === 1 ? "item" : "items"}.`);
  };

  const paintReasons = () =>
    mount(
      reasonHost,
      ...REASONS.map((r) =>
        h(
          "button",
          {
            type: "button",
            dataset: { reason: r },
            className: `chip ${st.reason === r ? "chip-active" : ""}`,
          },
          r
        )
      )
    );

  const paintPayments = () =>
    mount(
      paymentHost,
      ...PAYMENT_METHODS.map(({ key, label, icon: iconName }) =>
        h(
          "button",
          {
            type: "button",
            dataset: { payment: key },
            className: `chip justify-center py-3 ${st.payment === key ? "chip-active" : ""}`,
          },
          icon(iconName, { size: 14 }),
          " ",
          label
        )
      )
    );

  const sellerGroup = (group) => {
    const seller = group.seller;
    const groupTotal = group.items.reduce((s, i) => s + priceOf(i), 0);
    return h(
      "div",
      null,
      h(
        "div",
        { className: "flex items-center gap-2 mb-2" },
        h(
          "span",
          {
            className: `w-6 h-6 rounded-full flex items-center justify-center text-2xs font-extrabold text-white flex-none ${
              seller?.isVerifiedSeller ? "bg-primary" : "bg-ink-700"
            }`,
          },
          initials(seller?.name || "S")
        ),
        h(
          "span",
          { className: "text-xs font-bold text-ink-900 flex items-center gap-1.5" },
          icon("Store", { size: 12, className: "text-muted" }),
          " ",
          seller?.name || "Marketplace seller"
        ),
        h(
          "span",
          { className: "ml-auto text-xs font-bold text-ink-700 tabular" },
          formatINR(groupTotal)
        )
      ),
      h(
        "div",
        { className: "divide-y divide-line rounded-xl border border-line overflow-hidden" },
        ...group.items.map((item) =>
          h(
            "div",
            { className: "flex items-center gap-3 py-2.5 px-3 bg-raised/40" },
            h(
              "div",
              { className: "w-9 h-9 rounded-lg bg-sunken overflow-hidden flex-none" },
              h("img", {
                ...imageProps(item.product),
                className: "w-full h-full object-cover",
                alt: item.product?.title || "",
              })
            ),
            h(
              "div",
              { className: "flex-1 min-w-0" },
              h(
                "div",
                { className: "text-sm font-bold text-ink-900 truncate" },
                item.product?.title
              ),
              h(
                "div",
                { className: "text-2xs text-muted" },
                item.product?.condition
              )
            ),
            h(
              "span",
              { className: "font-extrabold text-sm text-ink-900 tabular" },
              formatINR(priceOf(item))
            )
          )
        )
      )
    );
  };

  const paintReview = () => {
    const t = total();
    const save = savings();
    const gs = groups();
    mount(
      reviewHost,
      h("div", { className: "space-y-4" }, ...gs.map(sellerGroup)),
      h(
        "div",
        { className: "border-t border-line pt-4 mt-4 space-y-2 text-sm" },
        h(
          "div",
          { className: "flex justify-between text-ink-600" },
          h("span", null, "Subtotal"),
          h("span", { className: "font-bold tabular" }, formatINR(t))
        ),
        save > 0
          ? h(
              "div",
              { className: "flex justify-between text-ink-600" },
              h("span", null, "You save"),
              h(
                "span",
                { className: "font-bold text-success tabular" },
                `−${formatINR(save)}`
              )
            )
          : null,
        h(
          "div",
          { className: "flex justify-between text-ink-600" },
          h("span", null, "Platform fee"),
          h("span", { className: "font-bold text-success" }, "Free")
        ),
        h(
          "div",
          { className: "flex justify-between font-extrabold text-lg text-ink-900 pt-1.5" },
          h("span", null, "Total"),
          h("span", { className: "tabular" }, formatINR(t))
        ),
        h(
          "p",
          { className: "text-2xs text-muted pt-1" },
          gs.length > 1
            ? `Placed as ${gs.length} orders — one per seller.`
            : "Shipped directly by the seller."
        )
      )
    );
  };

  const paintSubmit = () => {
    if (st.processing) {
      mount(
        submitHost,
        h(
          "button",
          {
            type: "button",
            dataset: { submit: "true" },
            disabled: true,
            className:
              "btn-primary w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed",
          },
          icon("Loader2", { size: 16, className: "animate-spin" }),
          " Placing order…"
        )
      );
      return;
    }
    mount(
      submitHost,
      h(
        "button",
        {
          type: "button",
          dataset: { submit: "true" },
          disabled: st.items.length === 0,
          className: "btn-primary w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed",
        },
        icon("Lock", { size: 16 }),
        " ",
        st.payment === "cod" ? "Place order (cash on delivery)" : `Pay ${formatINR(total())}`
      )
    );
  };

  const repaint = () => {
    paintSubtitle();
    paintReasons();
    paintPayments();
    paintReview();
    paintSubmit();
  };

  // ---------- views ----------

  const skeleton = () =>
    h(
      "div",
      { className: "page-container" },
      h("div", { className: "h-8 w-1/3 bg-sunken rounded-lg animate-pulse mb-8 mx-auto" })
    );

  const buildPage = () => {
    // The address inputs are created once here and are never replaced.
    mount(
      addressHost,
      h("input", {
        value: st.address.line1,
        dataset: { field: "line1" },
        className: "input-field",
        placeholder: ADDRESS_FIELDS.line1.placeholder,
        autoComplete: ADDRESS_FIELDS.line1.autoComplete,
      }),
      h(
        "div",
        { className: "grid grid-cols-2 gap-3" },
        h("input", {
          value: st.address.city,
          dataset: { field: "city" },
          className: "input-field",
          placeholder: ADDRESS_FIELDS.city.placeholder,
          autoComplete: ADDRESS_FIELDS.city.autoComplete,
        }),
        h("input", {
          value: st.address.postalCode,
          dataset: { field: "postalCode" },
          className: "input-field",
          placeholder: ADDRESS_FIELDS.postalCode.placeholder,
          inputMode: ADDRESS_FIELDS.postalCode.inputMode,
          autoComplete: ADDRESS_FIELDS.postalCode.autoComplete,
        })
      ),
      h("input", {
        value: st.address.phone,
        dataset: { field: "phone" },
        className: "input-field",
        placeholder: ADDRESS_FIELDS.phone.placeholder,
        inputMode: ADDRESS_FIELDS.phone.inputMode,
        autoComplete: ADDRESS_FIELDS.phone.autoComplete,
      })
    );

    return h(
      "div",
      { className: "animate-fade-in" },
      h(
        "header",
        { className: "page-masthead" },
        h(
          "div",
          { className: "max-w-3xl mx-auto px-4 sm:px-6 py-8 text-center" },
          h(
            "p",
            { className: "page-eyebrow justify-center" },
            icon("Lock", { size: 13 }),
            " Secure checkout"
          ),
          h("h1", { className: "page-title" }, "Checkout"),
          subtitleHost,
          h(
            "ol",
            { className: "flex items-center justify-center gap-2 mt-6" },
            ...STEPS.flatMap((s, i) => [
              h(
                "li",
                { className: "flex items-center gap-2" },
                h(
                  "span",
                  { className: "flex items-center gap-1.5 text-xs font-bold text-ink-700" },
                  h(
                    "span",
                    {
                      className:
                        "w-5 h-5 rounded-full bg-primary-soft text-primary flex items-center justify-center text-2xs",
                    },
                    i + 1
                  ),
                  s
                ),
                i < STEPS.length - 1 ? h("span", { className: "w-6 h-px bg-line-strong" }) : null
              ),
            ])
          )
        )
      ),
      h(
        "div",
        { className: "max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4" },
        h(
          "section",
          { className: "card p-6" },
          h(
            "h2",
            { className: "text-sm font-extrabold text-ink-900 mb-4 flex items-center gap-2" },
            icon("MapPin", { size: 16, className: "text-primary" }),
            " Delivery address"
          ),
          addressHost
        ),
        h(
          "section",
          { className: "card p-6" },
          h("h2", { className: "text-sm font-extrabold text-ink-900 mb-1" }, "Why did you pick these?"),
          h(
            "p",
            { className: "text-xs text-muted mb-3.5" },
            "Helps us recommend better products to you."
          ),
          reasonHost
        ),
        h(
          "section",
          { className: "card p-6" },
          h(
            "h2",
            { className: "text-sm font-extrabold text-ink-900 mb-4 flex items-center gap-2" },
            icon("CreditCard", { size: 16, className: "text-primary" }),
            " Payment method"
          ),
          paymentHost
        ),
        h(
          "section",
          { className: "card p-6" },
          h(
            "h2",
            { className: "text-sm font-extrabold text-ink-900 mb-4 flex items-center gap-2" },
            icon("Package", { size: 16, className: "text-primary" }),
            ` Review items (${st.items.length})`
          ),
          reviewHost
        ),
        submitHost,
        h(
          "p",
          { className: "text-2xs text-muted text-center pb-4" },
          "Encrypted payment · seller ships within 48h · easy returns"
        )
      )
    );
  };

  // ---------- actions ----------

  const load = () =>
    api
      .get("/cart")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.items = data.products || [];
        mount(root, buildPage());
        repaint();
      })
      .catch(() => {
        // React: `.catch(() => setLoading(false))` - a failed load still leaves
        // the form on screen with an empty review list, never a stuck skeleton.
        if (!ensureAlive()) return;
        st.items = [];
        mount(root, buildPage());
        repaint();
      });

  const handleCheckout = async () => {
    if (st.items.length === 0) return toast.error("Cart is empty");
    if (!st.address.line1.trim() || !st.address.city.trim() || !st.address.postalCode.trim())
      return toast.error("Add a complete delivery address");
    if (!/^\d{6}$/.test(st.address.postalCode.trim()))
      return toast.error("Enter a valid 6-digit PIN code");
    if (st.address.phone.trim() && !/^\+?[0-9 ()-]{7,15}$/.test(st.address.phone.trim()))
      return toast.error("Enter a valid phone number");

    st.processing = true;
    paintSubmit();
    behavior.checkoutStart("place_order", total());
    try {
      await api.post("/orders/bulk", {
        items: st.items.map((item) => ({ productId: item.product._id })),
        purchaseReason: st.reason,
        paymentMethod: st.payment,
        shippingAddress: {
          line1: st.address.line1.trim(),
          city: st.address.city.trim(),
          postalCode: st.address.postalCode.trim(),
          phone: st.address.phone.trim() || undefined,
        },
      });
      toast.success("Orders placed successfully!");
      navigate("/orders");
    } catch (err) {
      toast.error(err.response?.data?.message || "Checkout failed");
    } finally {
      st.processing = false;
      if (ensureAlive()) paintSubmit();
    }
  };

  // ---------- delegated handlers, bound once ----------

  const onRootClick = (event) => {
    const reasonBtn = event.target.closest?.("[data-reason]");
    if (reasonBtn) {
      event.preventDefault();
      st.reason = reasonBtn.dataset.reason;
      paintReasons();
      return;
    }
    const paymentBtn = event.target.closest?.("[data-payment]");
    if (paymentBtn) {
      event.preventDefault();
      st.payment = paymentBtn.dataset.payment;
      paintPayments();
      paintSubmit();
      return;
    }
    if (event.target.closest?.("[data-submit]")) {
      event.preventDefault();
      syncFromDom();
      handleCheckout();
    }
  };

  const onRootInput = (event) => {
    const el = event.target;
    if (!el.dataset?.field) return;
    if (el.dataset.field === "postalCode") {
      // React sanitises in the onChange handler: digits only, max 6.
      const clean = el.value.replace(/\D/g, "").slice(0, 6);
      if (clean !== el.value) el.value = clean;
      st.address.postalCode = clean;
      return;
    }
    st.address[el.dataset.field] = el.value;
  };

  root.addEventListener("click", onRootClick);
  root.addEventListener("input", onRootInput);
  cleanups.push(() => {
    root.removeEventListener("click", onRootClick);
    root.removeEventListener("input", onRootInput);
  });

  mount(root, skeleton());
  load();

  return root;
}
