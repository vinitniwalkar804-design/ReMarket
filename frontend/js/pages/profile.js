import { h, mount } from "../dom.js";
import { icon } from "../icons.js";
import api from "../services/api.js";
import toast from "../toast.js";
import auth from "../store/auth.js";
import { navigate } from "../navigation.js";
import Modal from "../components/modal.js";
import { formatINR, formatDate, conditionTone } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";

/**
 * Customer profile / account.
 *
 * Ported from `frontend/src/pages/Profile.jsx`: the same identity hero, the same
 * two stat cards fed by `GET /users/profile`, the same "My listings" management
 * surface fed by `GET /products/my`, and the same public-details form saved with
 * `PUT /users/profile`. Editing a listing routes to the seller studio with the
 * product in `location.state`, and the delete flow re-issues `DELETE /products/:id`
 * with the same 401/403/404 fall-through as the React page (the 409 "blocked"
 * handling belongs to the seller studio, not here).
 *
 * The router has no unmount hook, so the same teardown deal as Sell/Home applies:
 * a body-level observer notices when this page's root leaves the document and
 * stops the in-flight stats/listings fetches from painting. The page owns three
 * repaint regions - the identity hero, the stats grid and the listings body - and
 * only the parts that depend on changed data are rewritten.
 *
 * One detail is worth keeping deliberately. In React the two loading effects were
 * keyed on `[user]`, and `handleSave` replaced the user via `setUser`, so a
 * successful save re-ran them (skeleton flash on listings, then fresh data). This
 * port subscribes to the auth store and re-runs the same two fetches when the user
 * object is replaced, which keeps that repaint visible instead of relying on state
 * that was never part of the React page.
 */

const LISTING_TONE = {
  available: "badge-success",
  sold: "badge-neutral",
  reserved: "badge-warning",
  removed: "badge-danger",
};

export default function Profile({ location } = {}) {
  const st = {
    form: { name: "", location: "", phone: "", bio: "" },
    stats: { productsSold: 0, activeListings: 0 },
    loading: false,
    listings: [],
    listingsLoading: true,
    deleteTarget: null,
    deleting: false,
  };

  // ---------- teardown ----------

  let disposed = false;
  const cleanups = [];

  function ensureAlive() {
    if (root.isConnected) return true;
    if (!disposed) {
      disposed = true;
      for (const fn of cleanups.splice(0)) fn();
    }
    return false;
  }

  cleanups.push(() => {
    st.deleteTarget = null;
    st.deleting = false;
  });

  const observer = new MutationObserver(() => {
    if (!ensureAlive()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---------- data loads (React's two [user] effects) ----------

  const seedForm = () => {
    const user = auth.user;
    st.form = {
      name: user?.name || "",
      location: user?.location || "",
      phone: user?.phone || "",
      bio: user?.bio || "",
    };
    nameInput.value = st.form.name;
    locationInput.value = st.form.location;
    phoneInput.value = st.form.phone;
    bioInput.value = st.form.bio;
  };

  const loadStats = () => {
    api
      .get("/users/profile")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.stats = data.stats || { productsSold: 0, activeListings: 0 };
        paintStats();
      })
      .catch(() => {});
  };

  const loadListings = () => {
    st.listingsLoading = true;
    paintListings();
    api
      .get("/products/my")
      .then(({ data }) => {
        if (!ensureAlive()) return;
        st.listings = data.products || [];
      })
      .catch(() => {})
      .finally(() => {
        if (!ensureAlive()) return;
        st.listingsLoading = false;
        paintListings();
      });
  };

  // React's effects were keyed on [user]: a replaced user object re-runs the form
  // seed plus both fetches. The auth store emits exactly when `setUser` replaces
  // it, so this subscription is the faithful translation.
  const onAuthChange = () => {
    if (!ensureAlive()) return;
    if (!auth.user) return; // sign-out is handled by the route change itself
    seedForm();
    paintIdentity();
    loadStats();
    loadListings();
  };

  // ---------- handlers ----------

  const handleSave = (e) => {
    e.preventDefault();
    if (st.loading) return;
    st.loading = true;
    paintSubmit();
    api
      .put("/users/profile", st.form)
      .then(({ data }) => {
        if (!ensureAlive()) return;
        auth.setUser(data.user);
        toast.success("Profile updated");
      })
      .catch((err) => {
        if (!ensureAlive()) return;
        toast.error(err?.response?.data?.message || "Failed");
      })
      .finally(() => {
        st.loading = false;
        if (ensureAlive()) paintSubmit();
      });
  };

  const performDelete = () => {
    if (!st.deleteTarget || st.deleting) return;
    st.deleting = true;
    paintModal();
    api
      .delete(`/products/${st.deleteTarget._id}`)
      .then(() => {
        if (!ensureAlive()) return;
        st.listings = st.listings.filter((x) => x._id !== st.deleteTarget._id);
        st.deleteTarget = null;
        toast.success("Listing deleted");
      })
      .catch((err) => {
        if (!ensureAlive()) return;
        const code = err.response?.status;
        if (code === 401) toast.error("Please log in again.");
        else if (code === 403) toast.error("You can only delete your own listings.");
        else if (code === 404) toast.error("This listing no longer exists.");
        else toast.error("Unable to delete the listing right now. Please try again.");
      })
      .finally(() => {
        st.deleting = false;
        if (!ensureAlive()) return;
        paintListings();
        paintModal();
      });
  };

  const signOut = () => {
    auth.logout();
    navigate("/login");
  };

  // ---------- painters ----------

  const paintIdentity = () => {
    const user = auth.user || {};
    mount(
      identityBody,
      h("span", { className: "w-16 h-16 rounded-2xl bg-white/12 backdrop-blur border border-white/20 text-2xl font-extrabold flex items-center justify-center flex-none" },
        (user.name && user.name.charAt(0) ? user.name.charAt(0).toUpperCase() : null) || "U"),
      h(
        "div",
        { className: "min-w-0" },
        h("div", { className: "font-extrabold text-lg truncate text-white" }, user.name || ""),
        h("div", { className: "text-sm text-white/60 truncate" }, user.email || ""),
        h(
          "div",
          { className: "flex items-center gap-2 mt-2 flex-wrap" },
          h("span", { className: "badge bg-white/15 border border-white/20 text-white capitalize" }, user.role || ""),
          user.isVerifiedSeller
            ? h("span", { className: "badge bg-white/15 border border-white/20 text-white inline-flex items-center gap-1" },
                icon("ShieldCheck", { size: 11 }), " Verified seller")
            : null
        )
      )
    );
  };

  const paintStats = () => {
    mount(
      statsGrid,
      h("div", { className: "stat-card" },
        h("div", { className: "text-2xl font-extrabold text-ink-900 tabular" }, st.stats.productsSold),
        h("div", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-1" }, "Products sold")),
      h("div", { className: "stat-card" },
        h("div", { className: "text-2xl font-extrabold text-ink-900 tabular" }, st.stats.activeListings),
        h("div", { className: "text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-1" }, "Active listings"))
    );
  };

  const listingCard = (p) =>
    h(
      "article",
      { key: p._id, className: "card p-4 card-hover" },
      h(
        "div",
        { className: "flex items-center gap-4" },
        h("a", { href: `/products/${p._id}`, className: "w-20 h-20 rounded-xl bg-sunken overflow-hidden flex-none" },
          h("img", { ...imageProps(p), className: "w-full h-full object-cover" })),
        h(
          "div",
          { className: "flex-1 min-w-0" },
          h("a", { href: `/products/${p._id}`, className: "font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors" }, p.title),
          h(
            "div",
            { className: "flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-1" },
            h("span", { className: "font-extrabold text-primary text-sm tabular" }, formatINR(p.price)),
            p.originalPrice > p.price
              ? h("span", { className: "text-muted-soft line-through" }, formatINR(p.originalPrice))
              : null,
            h("span", { className: "inline-flex items-center gap-1" },
              icon("MapPin", { size: 11 }), " ", p.location || "—"),
            h("span", null, formatDate(p.createdAt))
          ),
          h(
            "div",
            { className: "flex items-center gap-2 mt-2" },
            h("span", { className: `badge ${conditionTone(p.condition)}` }, p.condition),
            h("span", { className: `badge capitalize ${LISTING_TONE[p.status] || orderTone(p.status)}` }, p.status)
          )
        )
      ),
      h(
        "div",
        { className: "mt-3.5 pt-3.5 border-t border-line flex items-center gap-2" },
        h("button", { type: "button", onClick: () => navigate("/sell", { state: { editProduct: p } }), className: "btn-secondary btn-sm" },
          icon("Pencil", { size: 12 }), " Edit"),
        h("button", { type: "button", onClick: () => { st.deleteTarget = p; paintModal(); }, className: "btn-danger btn-sm ml-auto" },
          icon("Trash2", { size: 12 }), " Delete")
      )
    );

  const paintListings = () => {
    if (st.listingsLoading) {
      mount(listingsBody, ...Array(2).fill(0).map((_, i) =>
        h("div", { key: i, className: "h-28 bg-surface border border-line rounded-2xl animate-pulse mb-3" })));
      return;
    }
    if (st.listings.length === 0) {
      mount(listingsBody,
        h("div", { className: "panel py-10 text-center" },
          h("span", { className: "w-14 h-14 rounded-2xl bg-sunken flex items-center justify-center mx-auto mb-3" },
            icon("LayoutGrid", { size: 26, className: "text-muted-soft" })),
          h("h3", { className: "font-bold text-ink-900" }, "No listings yet"),
          h("p", { className: "text-sm text-muted mt-1" }, "List your first item and it will show up here for editing or deletion.")));
      return;
    }
    mount(listingsBody, h("div", { className: "space-y-3" }, st.listings.map(listingCard)));
  };

  const paintSubmit = () => {
    submitBtn.disabled = st.loading;
    mount(submitBtn,
      st.loading
        ? [icon("Loader2", { size: 16, className: "animate-spin" }), " Saving…"]
        : [icon("Save", { size: 16 }), " Save changes"]);
  };

  const paintModal = () => {
    if (!st.deleteTarget) {
      mount(modalHost);
      return;
    }
    const children = h(
      "div",
      null,
      h(
        "div",
        { className: "flex items-start gap-3" },
        h("span", { className: "w-10 h-10 rounded-xl bg-danger-soft text-danger flex items-center justify-center flex-none" },
          icon("Trash2", { size: 18 })),
        h(
          "div",
          null,
          h("p", { className: "text-sm font-bold text-ink-900" }, st.deleteTarget.title),
          h("p", { className: "text-sm text-ink-600 mt-1" },
            "This product will be removed from your marketplace listings. This action cannot be undone.")
        )
      ),
      h(
        "div",
        { className: "mt-5 flex items-center gap-3" },
        h("button", { type: "button", onClick: () => { st.deleteTarget = null; paintModal(); }, disabled: st.deleting, className: "btn-secondary flex-1" }, "Cancel"),
        h("button", { type: "button", onClick: performDelete, disabled: st.deleting, className: "btn-danger flex-1 disabled:opacity-50" },
          st.deleting ? [icon("Loader2", { size: 15, className: "animate-spin" }), " Deleting…"] : "Delete listing")
      )
    );
    mount(modalHost, Modal({ onClose: () => { st.deleteTarget = null; paintModal(); }, title: "Delete this listing?", children }));
  };

  // ---------- page shell ----------

  const identityBody = h("div", { className: "relative flex items-center gap-4" });
  const statsGrid = h("div", { className: "grid grid-cols-2 gap-3 mb-8" });
  const listingsBody = h("div");

  const listingsSection = h(
    "section",
    { className: "mb-8" },
    h(
      "div",
      { className: "flex items-end justify-between mb-4" },
      h(
        "div",
        null,
        h("h2", { className: "section-title flex items-center gap-2" },
          icon("LayoutGrid", { size: 18, className: "text-primary" }), " My Listings"),
        h("p", { className: "section-sub" }, "Edit pricing, condition notes or remove an item entirely.")
      ),
      h("a", { href: "/sell", className: "btn-primary btn-sm flex-none" },
        icon("Plus", { size: 13 }), " List an item")
    ),
    listingsBody
  );

  const nameInput = h("input", { className: "input-field", required: true, onInput: (e) => { st.form.name = e.target.value; } });

  const locationInput = h("input", {
    className: "input-field pl-10",
    placeholder: "City",
    onInput: (e) => { st.form.location = e.target.value; },
  });
  const locationField = h("div", { className: "relative" },
    icon("MapPin", { size: 16, className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }),
    locationInput);

  const phoneInput = h("input", {
    className: "input-field pl-10",
    placeholder: "Phone number",
    onInput: (e) => { st.form.phone = e.target.value; },
  });
  const phoneField = h("div", { className: "relative" },
    icon("Phone", { size: 16, className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }),
    phoneInput);

  const bioInput = h("textarea", {
    className: "input-field",
    rows: 2,
    placeholder: "A short line buyers see on your seller profile",
    onInput: (e) => { st.form.bio = e.target.value; },
  });

  const submitBtn = h("button", { type: "submit", className: "btn-primary flex-1 disabled:opacity-50" });

  const form = h(
    "form",
    { onSubmit: handleSave, className: "panel p-6 space-y-4" },
    h("div", null,
      h("h2", { className: "text-base font-extrabold text-ink-900" }, "Public details"),
      h("p", { className: "text-xs text-muted mt-0.5" }, "Buyers see this on your seller profile and listings.")),
    h("div", null,
      h("label", { className: "input-label" }, "Name"),
      nameInput),
    h("div", null,
      h("label", { className: "input-label" }, "Location"),
      locationField),
    h("div", null,
      h("label", { className: "input-label" }, "Phone"),
      phoneField),
    h("div", null,
      h("label", { className: "input-label" }, "Bio"),
      bioInput),
    h("div", { className: "flex gap-3 pt-1" },
      submitBtn,
      h("button", { type: "button", onClick: signOut, className: "btn-danger px-5" },
        icon("LogOut", { size: 16 }), " Sign out"))
  );

  const body = h(
    "div",
    { className: "max-w-3xl mx-auto px-4 sm:px-6 py-8" },
    h("section", { className: "relative overflow-hidden rounded-3xl mesh-primary text-white p-6 sm:p-8 mb-5" },
      h("div", { className: "absolute inset-0 bg-dots opacity-30" }),
      h("div", { className: "absolute -right-16 -top-16 w-56 h-56 rounded-full bg-brand-500/20 blur-3xl" }),
      identityBody),
    statsGrid,
    listingsSection,
    form,
    h("a", { href: "/sell", className: "mt-4 flex items-center justify-center gap-2 text-sm text-primary hover:underline font-bold" },
      icon("Store", { size: 14 }), " Want to start selling? List an item")
  );

  const masthead = h(
    "header",
    { className: "page-masthead" },
    h("div", { className: "max-w-3xl mx-auto px-4 sm:px-6 py-8" },
      h("p", { className: "page-eyebrow" }, icon("User", { size: 13 }), " Account"),
      h("h1", { className: "page-title" }, "Your profile"),
      h("p", { className: "page-sub" }, "Manage your public details, listings and account security."))
  );

  const modalHost = h("div");
  const root = h("div", { className: "animate-fade-in" }, masthead, body, modalHost);

  // ---------- first paint + loads ----------

  // Not guarded with ensureAlive(): these paint synchronously during init, before
  // the router has mounted this root; the async loads guard themselves.
  seedForm();
  paintIdentity();
  paintStats();
  paintListings();
  paintSubmit();
  loadStats();
  loadListings();
  cleanups.push(auth.subscribe(onAuthChange));

  return root;
}