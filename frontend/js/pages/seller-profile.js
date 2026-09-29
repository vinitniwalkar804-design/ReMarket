import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import { navigate } from "../navigation.js";
import ProductCard from "../components/product-card.js";
import StarRating from "../components/star-rating.js";
import EmptyState from "../components/empty-state.js";
import { SkeletonCard } from "../components/loading.js";
import { formatDate } from "../utils/format.js";
import compareStore from "../store/compare.js";
import auth from "../store/auth.js";

const TRUST = [
  { title: "Identity & contact verified", desc: "Every seller is verified at signup." },
  { title: "Ratings stay public", desc: "Response rates and reviews are visible." },
  { title: "Dispute-safe records", desc: "Orders and behaviour tracked end-to-end." },
];

/**
 * SellerProfile.
 *
 * Ported from the React build's SellerProfile.jsx. Loads /users/seller/:id
 * alongside the wishlist, renders the mesh-primary seller hero (verified
 * badge, stars, member-since, bio, stat band), the "Available from" listing
 * grid and the verified-seller trust section. Chat opens by posting a
 * starter message to /chats then navigating to the thread.
 *
 * Routes carry the seller id via router params; the back button calls
 * history.back() exactly like navigate(-1).
 */

export default function SellerProfile({ params }) {
  const id = params?.id;
  const st = { seller: null, products: [], wishlistIds: new Set(), loading: true };

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

  const toggleWishlist = async (productId) => {
    const present = st.wishlistIds.has(String(productId));
    try {
      if (present) {
        const wl = await api.get("/wishlist").catch(() => null);
        const items = wl?.data?.wishlist || wl?.data?.products || [];
        const item = items.find((w) => String(w.product?._id || w.productId || w._id) === String(productId));
        if (item) await api.delete(`/wishlist/${item._id}`);
        const s = new Set(st.wishlistIds);
        s.delete(String(productId));
        st.wishlistIds = s;
      } else {
        await api.post("/wishlist", { productId });
        st.wishlistIds = new Set(st.wishlistIds).add(String(productId));
      }
      repaint();
    } catch {
      // React swallows the failure silently.
    }
  };

  const chat = async () => {
    try {
      const { data } = await api.post("/chats", {
        otherUserId: id,
        text: "Hi! I'm interested in your listings.",
      });
      navigate(`/messages/${data.chatId}`);
    } catch {
      // React swallows chat failure silently.
    }
  };

  const load = async () => {
    try {
      const [sRes, wRes] = await Promise.all([
        api.get(`/users/seller/${id}`),
        api.get("/wishlist").catch(() => null),
      ]);
      if (!ensureAlive()) return;
      st.seller = sRes.data.seller;
      st.products = sRes.data.products || [];
      st.wishlistIds = new Set(
        (wRes?.data?.wishlist || wRes?.data?.products || []).map((w) => String(w.product?._id || w.productId || w._id))
      );
    } catch {
      if (!ensureAlive()) return;
    }
    st.loading = false;
    if (ensureAlive()) repaint();
  };

  const repaint = () => {
    if (st.loading) return;
    mount(root, page());
  };

  const page = () => {
    const { seller, products } = st;
    if (!seller) {
      return h(
        "div",
        { className: "page-container" },
        h(
          "div",
          { className: "panel" },
          EmptyState({
            iconName: "Store",
            title: "Seller not found",
            description: "This seller profile no longer exists.",
            action: h(
              "button",
              { type: "button", onClick: () => history.back(), className: "btn-primary" },
              "Go back"
            ),
          })
        )
      );
    }

    const listed = products.filter((p) => p.status !== "sold");
    const firstName = String(seller.name || "Seller").split(" ")[0];
    const user = auth.getState().user;

    return h(
      "div",
      { className: "animate-fade-in" },
      h(
        "div",
        { className: "page-container" },
        h(
          "button",
          { type: "button", onClick: () => history.back(), className: "btn-quiet btn-sm -ml-2 mb-4" },
          icon("ArrowLeft", { size: 15 }),
          " Back"
        ),
        h(
          "section",
          { className: "relative overflow-hidden rounded-3xl mesh-primary text-white p-6 sm:p-10" },
          h("div", { className: "absolute inset-0 bg-dots opacity-30" }),
          h("div", { className: "absolute -right-24 -top-28 w-80 h-80 rounded-full bg-brand-500/20 blur-3xl" }),
          h(
            "div",
            { className: "relative" },
            h(
              "div",
              { className: "flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8" },
              h(
                "div",
                { className: "flex items-start gap-5" },
                h(
                  "span",
                  { className: "w-20 h-20 rounded-2xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center text-3xl font-extrabold flex-none" },
                  (seller.name?.charAt(0) || "S").toUpperCase()
                ),
                h(
                  "div",
                  { className: "min-w-0" },
                  h(
                    "div",
                    { className: "flex items-center gap-2.5 flex-wrap" },
                    h("h1", { className: "text-2xl sm:text-3xl font-extrabold tracking-tight text-white" }, seller.name),
                    seller.isVerifiedSeller
                      ? h(
                          "span",
                          { className: "inline-flex items-center gap-1 bg-white/15 backdrop-blur border border-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full" },
                          icon("BadgeCheck", { size: 12 }),
                          " Verified seller"
                        )
                      : null
                  ),
                  h(
                    "div",
                    { className: "flex items-center gap-4 text-sm text-white/70 mt-2.5 flex-wrap" },
                    h("span", { className: "inline-flex items-center gap-1.5" }, icon("MapPin", { size: 14 }), " ", seller.location || "Location not set"),
                    h("span", { className: "inline-flex items-center gap-1.5" }, icon("Calendar", { size: 14 }), " Member since ", formatDate(seller.createdAt)),
                    h(
                      "span",
                      { className: "inline-flex items-center gap-1.5" },
                      StarRating({ value: seller.sellerRating || 0, size: 13 }),
                      h("b", { className: "text-white" }, Number(seller.sellerRating || 0).toFixed(1)),
                      h("span", { className: "text-white/55" }, `(${seller.sellerRatingCount || 0})`)
                    )
                  ),
                  seller.bio ? h("p", { className: "text-sm text-white/65 mt-3 max-w-xl leading-relaxed" }, seller.bio) : null
                )
              ),
              h(
                "div",
                { className: "grid grid-cols-3 gap-6 lg:gap-8 flex-none" },
                ...[
                  { v: listed.length, l: "Active listings" },
                  { v: products.length, l: "Total listed" },
                  { v: seller.sellerRatingCount || 0, l: "Ratings" },
                ].map((s) =>
                  h(
                    "div",
                    { key: s.l },
                    h("p", { className: "text-3xl font-extrabold text-white tabular leading-none" }, String(s.v)),
                    h("p", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-white/50 mt-1.5" }, s.l)
                  )
                )
              )
            )
          )
        ),
        h(
          "section",
          { className: "mt-10" },
          h(
            "div",
            { className: "flex flex-wrap items-end justify-between gap-3 mb-5" },
            h(
              "div",
              null,
              h("p", { className: "page-eyebrow" }, icon("Package", { size: 13 }), " Inventory"),
              h("h2", { className: "section-title" }, `Available from ${firstName}`),
              h("p", { className: "section-sub" }, `${listed.length} live ${listed.length === 1 ? "listing" : "listings"} · honest condition notes, negotiable prices`)
            ),
            h("button", { type: "button", onClick: chat, className: "btn-primary flex-none" }, icon("MessageCircle", { size: 16 }), " Chat with ", firstName)
          ),
          listed.length === 0
            ? h(
                "div",
                { className: "panel" },
                EmptyState({
                  iconName: "Package",
                  title: "No active listings",
                  description: "This seller doesn't have any available items right now.",
                })
              )
            : h(
                "div",
                { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
                ...listed.map((p) =>
                  h(
                    "a",
                    { key: p._id, href: `/products/${p._id}`, className: "block h-full" },
                    ProductCard({
                      product: p,
                      onWishlist: toggleWishlist,
                      wishlisted: st.wishlistIds.has(String(p._id)),
                      onCompare: user ? compareStore.toggle : undefined,
                      comparing: compareStore.isComparing(p._id),
                    })
                  )
                )
              )
        ),
        seller.isVerifiedSeller
          ? h(
              "section",
              { className: "card mt-10 p-6 sm:p-8" },
              h(
                "div",
                { className: "flex items-center gap-3 mb-5" },
                h("span", { className: "w-10 h-10 rounded-xl bg-success-soft text-success flex items-center justify-center flex-none" }, icon("Shield", { size: 20 })),
                h(
                  "div",
                  null,
                  h("h3", { className: "font-bold text-ink-900" }, "Why verified sellers matter"),
                  h("p", { className: "text-xs text-muted mt-0.5" }, "Trust signals every buyer can audit before paying")
                )
              ),
              h(
                "div",
                { className: "grid sm:grid-cols-3 gap-6" },
                ...TRUST.map((t) =>
                  h(
                    "div",
                    { key: t.title, className: "flex gap-2.5" },
                    icon("CheckCircle2", { size: 16, className: "text-success flex-none mt-0.5" }),
                    h(
                      "div",
                      null,
                      h("p", { className: "text-[13px] font-bold text-ink-900" }, t.title),
                      h("p", { className: "text-xs text-muted mt-1 leading-relaxed" }, t.desc)
                    )
                  )
                )
              )
            )
          : null
      )
    );
  };

  // ---------- init ----------
  const skeleton = () =>
    h(
      "div",
      { className: "page-container" },
      h(
        "div",
        { className: "animate-pulse space-y-6" },
        h("div", { className: "h-52 bg-sunken rounded-3xl" }),
        h(
          "div",
          { className: "grid grid-cols-2 lg:grid-cols-4 gap-4" },
          ...Array.from({ length: 4 }, () => SkeletonCard())
        )
      )
    );

  mount(root, skeleton());
  load();

  return root;
}