/**
 * Static shell enhancers.
 *
 * The multi-page build renders the customer header/nav/footer and the admin
 * rail as real static HTML in each physical page. These enhancers are the port
 * of `Layout.js`/`AdminLayout.js` interactive behaviour onto that DOM: search
 * suggestions and clear, notification and profile popovers, the mobile drawer,
 * count badges, active-link highlighting and the admin sidebar, each bound to
 * the same nodes React's shell owned so the behaviour is unchanged.
 *
 * Only the *interactive* regions are repainted (panels, drawer, badges, active
 * states). The static scaffolding itself - which page it points at, what its
 * hrefs are - came from the HTML generator, and the navigation bridge rewrites
 * any virtual `href` the panels produce into a physical file on insertion, so a
 * suggestion or notification link behaves like any other anchor.
 */
import { h, cx, mount } from "./dom.js";
import { icon } from "./icons.js";
import api from "./services/api.js";
import auth from "./store/auth.js";
import compareStore from "./store/compare.js";
import behavior from "./utils/behavior.js";
import { formatINR, timeAgo } from "./utils/format.js";
import { productImg } from "./utils/images.js";
import { navigate, getLocation } from "./navigation.js";

const NAV = [
  { to: "/products", icon: "Compass", label: "Explore" },
  { to: "/categories", icon: "LayoutGrid", label: "Categories" },
  { to: "/sell", icon: "Tag", label: "Sell" },
  { to: "/compare", icon: "ArrowLeftRight", label: "Compare" },
];

const QUICK = [
  { to: "/wishlist", icon: "Heart", label: "Wishlist" },
  { to: "/messages", icon: "MessageCircle", label: "Messages" },
  { to: "/cart", icon: "ShoppingCart", label: "Cart" },
];

const MOBILE_TABS = [
  { to: "/", icon: "Store", label: "Home" },
  { to: "/products", icon: "Compass", label: "Explore" },
  { to: "/sell", icon: "Sparkles", label: "Sell" },
  { to: "/cart", icon: "ShoppingCart", label: "Cart" },
  { to: "/notifications", icon: "Bell", label: "Alerts" },
];

const ME = [
  { to: "/profile", icon: "User", label: "My Profile" },
  { to: "/activity", icon: "Activity", label: "Shopping Insights" },
  { to: "/orders", icon: "Package", label: "My Orders" },
  { to: "/notifications", icon: "Bell", label: "Notifications" },
];

/** An in-app anchor. The navigation bridge rewrites virtual hrefs on insert. */
const A = (to, props = {}, ...children) => h("a", { href: to, ...props }, ...children);

// ---------------------------------------------------------------------------
// Storefront shell
// ---------------------------------------------------------------------------

let customerBound = false;

export function initCustomerShell() {
  if (customerBound) return;
  customerBound = true;

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    mobileOpen: false,
    notifOpen: false,
    profileOpen: false,
    notifCount: 0,
    notifs: [],
    cartCount: 0,
    wishlistCount: 0,
    query: "",
    suggestions: null,
    suggestOpen: false,
  };

  const refs = {};
  refs.search = $("[data-search-form]");
  refs.searchInput = $("[data-search-input]");
  refs.affixHost = $("[data-search-affix]");
  refs.suggestHost = $("[data-search-suggest]");
  refs.notif = $("[data-notif]");
  refs.notifBtn = $("[data-notif-btn]");
  refs.notifBadge = $("[data-notif-badge]");
  refs.notifPanel = $("[data-notif-panel]");
  refs.profile = $("[data-profile]");
  refs.profileBtn = $("[data-profile-btn]");
  refs.profileAvatar = $("[data-profile-avatar]");
  refs.profileName = $("[data-profile-name]");
  refs.profilePanel = $("[data-profile-panel]");
  refs.menuBtn = $("[data-menu-btn]");
  refs.menuOpen = $("[data-menu-open]");
  refs.menuClose = $("[data-menu-close]");
  refs.drawerHost = $("[data-drawer-host]");

  let debounceTimer = null;

  const readLinks = (rootSel, variant) =>
    [...document.querySelectorAll(rootSel)].map((el) => ({
      el,
      iconEl: el.querySelector("svg"),
      badge: el.querySelector("[data-badge]"),
      to: el.dataset.to,
      variant,
    }));

  const navLinks = readLinks("[data-nav]", "nav");
  const quickLinks = readLinks("[data-quick]", "icon");
  const tabLinks = readLinks("[data-tab]", "tab");

  const drawerBrowse = [{ to: "/", icon: "Store", label: "Home" }, ...NAV].map((item) => {
    const badge = h("span", {
      className:
        "hidden ml-auto min-w-[20px] h-[20px] px-1.5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center tabular",
    });
    const el = A(
      item.to,
      {
        onClick: () => {
          ui.mobileOpen = false;
        },
        className: "grid-item",
      },
      icon(item.icon, { size: 16 }),
      item.label,
      item.to === "/compare" ? badge : null
    );
    return { el, badge, item, variant: "grid" };
  });

  const drawerMe = ME.map((item) => {
    const el = A(
      item.to,
      {
        onClick: () => {
          ui.mobileOpen = false;
        },
        className:
          "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
      },
      icon(item.icon, { size: 16 }),
      item.label
    );
    return { el, badge: null, item, variant: "list" };
  });

  const isActive = (to) => {
    const p = getLocation()?.path || "/";
    return to === "/" ? p === "/" : p.startsWith(to);
  };

  const countFor = (to) => {
    if (to === "/wishlist") return ui.wishlistCount;
    if (to === "/cart") return ui.cartCount;
    return 0;
  };

  const badgeText = (count) => (count > 9 ? "9+" : count);
  const paintBadge = (el, count) => {
    if (!el) return;
    el.textContent = badgeText(count);
    el.classList.toggle("hidden", count <= 0);
  };

  // ---------- header counts ----------

  async function loadCounts() {
    try {
      const [nRes, cRes, wRes] = await Promise.all([
        api.get("/notifications?limit=6"),
        api.get("/cart").catch(() => null),
        api.get("/wishlist").catch(() => null),
      ]);
      ui.notifCount = nRes.data.unreadCount || 0;
      ui.notifs = nRes.data.notifications || [];
      ui.cartCount = cRes?.data?.cart?.items?.length || cRes?.data?.count || 0;
      ui.wishlistCount = wRes?.data?.wishlist?.length || wRes?.data?.products?.length || 0;
      paint();
    } catch {
      /* a failed poll leaves the previous counts in place */
    }
  }

  // ---------- search ----------

  function onQueryChange(value) {
    ui.query = value;
    if (value.trim().length < 2) {
      ui.suggestions = null;
      ui.suggestOpen = false;
      paint();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search/suggestions?q=${encodeURIComponent(value.trim())}`);
        ui.suggestions = data;
        ui.suggestOpen = true;
        paint();
      } catch {
        /* suggestions are an enhancement; a failure leaves the field usable */
      }
    }, 220);
    paint();
  }

  function submitSearch() {
    if (ui.query.trim()) {
      behavior.search(ui.query.trim());
      ui.suggestOpen = false;
      navigate(`/products?search=${encodeURIComponent(ui.query.trim())}`);
    }
  }

  function clearQuery() {
    ui.query = "";
    ui.suggestions = null;
    ui.suggestOpen = false;
    if (refs.searchInput) {
      refs.searchInput.value = "";
      refs.searchInput.focus();
    }
    paint();
  }

  async function markAllRead() {
    try {
      await api.post("/notifications/read", { all: true });
      ui.notifCount = 0;
      ui.notifs = ui.notifs.map((n) => ({ ...n, read: true }));
      paint();
    } catch {
      /* leave the badge as-is so the customer can retry */
    }
  }

  function logout() {
    // Ordering matters: the auth state has to be cleared before the navigation
    // so the route guard sees a signed-out customer and allows /login.
    auth.logout();
    navigate("/login");
  }

  // ---------- dismiss on outside click ----------

  document.addEventListener("pointerdown", (e) => {
    const target = e.target;
    const inside = (host) => Boolean(host && host.isConnected && host.contains(target));
    let changed = false;

    if (!inside(refs.search) && ui.suggestOpen) {
      ui.suggestOpen = false;
      changed = true;
    }
    if (!inside(refs.notif) && ui.notifOpen) {
      ui.notifOpen = false;
      changed = true;
    }
    if (!inside(refs.profile) && ui.profileOpen) {
      ui.profileOpen = false;
      changed = true;
    }
    if (!inside(refs.mobile) && ui.mobileOpen) {
      ui.mobileOpen = false;
      changed = true;
    }
    if (changed) paint();
  });

  auth.subscribe(paint);
  compareStore.subscribe(paint);

  // ---------- static node wiring ----------

  if (refs.search && refs.searchInput) {
    refs.search.addEventListener("submit", (e) => {
      e.preventDefault();
      submitSearch();
    });
    refs.searchInput.addEventListener("input", (e) => onQueryChange(e.target.value));
    refs.searchInput.addEventListener("focus", () => {
      if (ui.query.trim().length >= 2) {
        ui.suggestOpen = true;
        paint();
      }
    });
  }

  if (refs.notifBtn) {
    refs.notifBtn.addEventListener("click", () => {
      ui.notifOpen = !ui.notifOpen;
      ui.profileOpen = false;
      paint();
    });
  }

  if (refs.profileBtn) {
    refs.profileBtn.addEventListener("click", () => {
      ui.profileOpen = !ui.profileOpen;
      ui.notifOpen = false;
      paint();
    });
  }

  if (refs.menuBtn) {
    refs.menuBtn.addEventListener("click", () => {
      ui.mobileOpen = !ui.mobileOpen;
      paint();
    });
  }

  const setLinkClass = ({ el, iconEl, to, variant }) => {
    const active = isActive(to);
    if (!el) return;
    el.className = cx(
      variant === "nav"
        ? "relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-150"
        : variant === "icon"
          ? "relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150"
          : "relative flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-bold transition-colors duration-150",
      active
        ? variant === "tab"
          ? "bg-primary text-white shadow-glow-primary"
          : "text-primary bg-primary-soft"
        : variant === "tab"
          ? "text-muted"
          : "text-ink-700 hover:bg-sunken"
    );
    if (variant === "nav" && iconEl) iconEl.classList.toggle("text-muted-soft", !active);
  };

  // ---------- panels ----------

  function renderNotifications() {
    return h(
      "div",
      {
        className:
          "w-[22rem] max-w-[calc(100vw-2rem)] bg-card rounded-2xl border border-line shadow-pop overflow-hidden animate-slide-down",
      },
      h(
        "div",
        { className: "flex items-center justify-between px-4 py-3 border-b border-line bg-raised" },
        h(
          "div",
          { className: "flex items-center gap-2" },
          h("p", { className: "text-sm font-bold text-ink-900" }, "Notifications"),
          ui.notifCount > 0 ? h("span", { className: "badge badge-primary" }, `${ui.notifCount} new`) : null
        ),
        h(
          "div",
          { className: "flex items-center gap-3" },
          ui.notifCount > 0
            ? h(
                "button",
                {
                  type: "button",
                  onClick: markAllRead,
                  className: "text-2xs font-bold text-primary hover:underline",
                },
                "Mark all read"
              )
            : null,
          A("/notifications", { className: "text-2xs font-bold text-primary hover:underline" }, "View all")
        )
      ),
      h(
        "div",
        { className: "max-h-80 overflow-y-auto" },
        ui.notifs.length === 0
          ? h("p", { className: "text-sm text-muted text-center py-10" }, "You’re all caught up!")
          : ui.notifs.map((n) =>
              A(
                n.link || "/notifications",
                {
                  className: cx(
                    "flex items-start gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-raised transition-colors",
                    n.read ? "" : "bg-primary-soft/40"
                  ),
                },
                h("span", {
                  className: cx(
                    "w-2 h-2 mt-1.5 rounded-full flex-none",
                    n.read ? "bg-line-strong" : "bg-primary"
                  ),
                }),
                h(
                  "span",
                  { className: "min-w-0 flex-1" },
                  h("span", { className: "block text-sm font-semibold text-ink-900 truncate" }, n.title),
                  h("span", { className: "block text-xs text-muted line-clamp-2 mt-0.5" }, n.message),
                  h("span", { className: "block text-2xs text-muted-soft mt-1" }, timeAgo(n.createdAt))
                )
              )
            )
      )
    );
  }

  function renderProfileMenu(user) {
    return h(
      "div",
      { className: "w-64 bg-card rounded-2xl border border-line shadow-pop overflow-hidden animate-slide-down" },
      h(
        "div",
        { className: "px-4 py-3.5 border-b border-line bg-raised" },
        h("p", { className: "text-sm font-bold text-ink-900 truncate" }, user?.name),
        h("p", { className: "text-2xs text-muted truncate mt-0.5" }, user?.email),
        user?.location ? h("p", { className: "text-2xs text-muted-soft truncate mt-0.5" }, user.location) : null
      ),
      h(
        "div",
        { className: "py-1.5" },
        ME.map((m) =>
          A(
            m.to,
            {
              className: cx(
                "flex items-center gap-2.5 px-4 py-2 text-[13px] font-semibold transition-colors",
                isActive(m.to) ? "bg-primary-soft text-primary" : "text-ink-700 hover:bg-raised"
              ),
            },
            icon(m.icon, { size: 15 }),
            m.label
          )
        )
      ),
      h(
        "div",
        { className: "p-1.5 border-t border-line" },
        h(
          "button",
          {
            type: "button",
            onClick: logout,
            className:
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-danger hover:bg-danger-soft transition-colors",
          },
          icon("LogOut", { size: 15 }),
          "Logout"
        )
      )
    );
  }

  function renderSuggestions() {
    const s = ui.suggestions;
    const cats = s.categories || s.category || [];
    const hasAny =
      (s.products || []).length > 0 || (s.popular || []).length > 0 || (s.recent || []).length > 0;

    const close = () => {
      ui.suggestOpen = false;
      paint();
    };
    const searchTerm = (term) => {
      ui.query = term;
      ui.suggestOpen = false;
      submitSearch();
    };

    return h(
      "div",
      {
        className:
          "mt-2 bg-card rounded-2xl border border-line shadow-pop overflow-hidden animate-slide-down max-h-[26rem] overflow-y-auto",
      },
      (s.products || []).length > 0
        ? h(
            "div",
            { className: "py-1.5" },
            h("p", { className: "px-4 pt-2 pb-1.5 label-eyebrow" }, "Products"),
            s.products.map((p) =>
              A(
                `/products/${p._id}`,
                {
                  onClick: close,
                  className: "flex items-center gap-3 px-4 py-2.5 hover:bg-raised transition-colors",
                },
                productImg(p, { className: "w-10 h-10 rounded-lg object-cover bg-sunken flex-none" }),
                h(
                  "div",
                  { className: "flex-1 min-w-0" },
                  h("p", { className: "text-sm font-semibold text-ink-900 truncate" }, p.title),
                  h(
                    "p",
                    { className: "text-2xs text-muted truncate mt-0.5" },
                    `${p.categoryName} · ${p.brand}`
                  )
                ),
                h(
                  "span",
                  { className: "text-sm font-extrabold text-primary tabular flex-none" },
                  formatINR(p.price)
                )
              )
            )
          )
        : null,

      cats.length > 0
        ? h(
            "div",
            { className: "py-1.5 border-t border-line" },
            h("p", { className: "px-4 pt-2 pb-1.5 label-eyebrow" }, "Categories"),
            cats.map((c) =>
              A(
                `/products?category=${c._id}`,
                {
                  onClick: close,
                  className: "flex items-center gap-2.5 px-4 py-2 hover:bg-raised transition-colors",
                },
                icon("LayoutGrid", { size: 14, className: "text-accent flex-none" }),
                h("span", { className: "text-sm font-semibold text-ink-800" }, c.name)
              )
            )
          )
        : null,

      (s.popular || []).length > 0
        ? h(
            "div",
            { className: "py-2.5 border-t border-line" },
            h("p", { className: "px-4 pb-2 label-eyebrow" }, "Popular right now"),
            h(
              "div",
              { className: "flex flex-wrap gap-2 px-4" },
              s.popular.slice(0, 6).map((term) =>
                h(
                  "button",
                  { type: "button", className: "chip-idle", onClick: () => searchTerm(term) },
                  term
                )
              )
            )
          )
        : null,

      (s.recent || []).length > 0
        ? h(
            "div",
            { className: "py-2.5 border-t border-line" },
            h("p", { className: "px-4 pb-2 label-eyebrow" }, "Your recent"),
            h(
              "div",
              { className: "flex flex-wrap gap-2 px-4" },
              s.recent.slice(0, 4).map((term) =>
                h(
                  "button",
                  {
                    type: "button",
                    className: "chip bg-primary-soft text-primary border-brand-100 hover:bg-brand-100",
                    onClick: () => searchTerm(term),
                  },
                  icon("Search", { size: 11 }),
                  ` ${term}`
                )
              )
            )
          )
        : null,

      !hasAny
        ? h("p", { className: "px-4 py-7 text-sm text-muted text-center" }, "No matches — try a different keyword")
        : null
    );
  }

  // ---------- painting ----------

  function paint() {
    const user = auth.user;
    const compareCount = compareStore.getState().count;

    for (const l of navLinks) {
      setLinkClass(l);
      paintBadge(l.badge, l.to === "/compare" ? compareCount : 0);
    }
    for (const l of quickLinks) {
      setLinkClass(l);
      paintBadge(l.badge, countFor(l.to));
    }
    for (const l of tabLinks) {
      setLinkClass(l);
      if (!l.badge) continue;
      const count = l.to === "/cart" ? ui.cartCount : l.to === "/notifications" ? ui.notifCount : 0;
      l.badge.textContent = badgeText(count);
      l.badge.className = cx(
        "absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center",
        count > 0 ? "" : "hidden",
        isActive(l.to) ? "bg-white text-primary" : "bg-danger text-white"
      );
    }

    // search affix: clear button, or the "/" hint
    if (refs.affixHost) {
      mount(
        refs.affixHost,
        ui.query
          ? h(
              "button",
              {
                type: "button",
                onClick: clearQuery,
                "aria-label": "Clear search",
                className: "text-muted-soft hover:text-ink-900 transition-colors",
              },
              icon("X", { size: 14 })
            )
          : h(
              "kbd",
              {
                className:
                  "hidden sm:block text-2xs font-bold text-muted-soft bg-white border border-line rounded px-1.5 py-0.5",
              },
              "/"
            )
      );
    }
    if (refs.searchInput && refs.searchInput.value !== ui.query) refs.searchInput.value = ui.query;

    if (refs.suggestHost) mount(refs.suggestHost, ui.suggestOpen && ui.suggestions ? renderSuggestions() : null);
    if (refs.notifPanel) mount(refs.notifPanel, ui.notifOpen ? renderNotifications() : null);
    if (refs.profilePanel) mount(refs.profilePanel, ui.profileOpen ? renderProfileMenu(user) : null);

    if (refs.notifBadge) paintBadge(refs.notifBadge, ui.notifCount);
    if (refs.notifBtn) {
      refs.notifBtn.className = cx(
        "relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150",
        ui.notifOpen ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink-900"
      );
    }
    if (refs.profileBtn) {
      refs.profileBtn.className = cx(
        "flex items-center gap-2 pl-1.5 pr-1.5 py-1.5 rounded-xl transition-colors duration-150",
        ui.profileOpen ? "bg-sunken" : "hover:bg-sunken"
      );
    }
    if (refs.profileAvatar) refs.profileAvatar.textContent = (user?.name || "U").charAt(0).toUpperCase();
    if (refs.profileName) refs.profileName.textContent = user?.name || "";

    if (refs.menuOpen) refs.menuOpen.classList.toggle("hidden", ui.mobileOpen);
    if (refs.menuClose) refs.menuClose.classList.toggle("hidden", !ui.mobileOpen);
    if (refs.menuBtn) refs.menuBtn.setAttribute("aria-expanded", String(ui.mobileOpen));

    // mobile drawer
    for (const l of drawerBrowse) {
      l.el.className = cx(
        "grid-item flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
        isActive(l.item.to) ? "bg-primary-soft text-primary" : "text-ink-700 hover:bg-sunken"
      );
      if (l.item.to === "/compare") paintBadge(l.badge, compareCount);
    }
    for (const l of drawerMe) {
      l.el.className = cx(
        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors",
        isActive(l.item.to) ? "bg-primary-soft text-primary" : "text-ink-700 hover:bg-sunken"
      );
    }

    if (ui.mobileOpen && refs.drawerHost) {
      refs.mobile = mount(
        refs.drawerHost,
        h(
          "div",
          {
            className: "border-t border-line bg-card animate-slide-down max-h-[75vh] overflow-y-auto",
          },
          h(
            "div",
            { className: "px-4 py-4 space-y-5 max-w-[1400px] mx-auto" },
            h(
              "div",
              null,
              h("p", { className: "label-eyebrow px-1 pb-2" }, "Browse"),
              h(
                "div",
                { className: "grid grid-cols-2 gap-1.5" },
                ...drawerBrowse.map((l) => l.el)
              )
            ),
            h(
              "div",
              null,
              h("p", { className: "label-eyebrow px-1 pb-2" }, "You"),
              h(
                "div",
                { className: "space-y-1" },
                ...drawerMe.map((l) => l.el),
                logoutButton()
              )
            )
          )
        )
      ).firstElementChild;
    } else if (refs.drawerHost) {
      mount(refs.drawerHost);
      refs.mobile = null;
    }
  }

  function logoutButton() {
    return h(
      "button",
      {
        type: "button",
        onClick: logout,
        className:
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold text-danger hover:bg-danger-soft transition-colors",
      },
      icon("LogOut", { size: 16 }),
      "Logout"
    );
  }

  loadCounts();
  setInterval(loadCounts, 30000);
  paint();
}

// ---------------------------------------------------------------------------
// Admin shell
// ---------------------------------------------------------------------------

/** The primary navigation, unchanged from AdminLayout.js. */
const GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/admin", icon: "LayoutDashboard", label: "Dashboard", match: ["/admin", "/admin/dashboard"], exact: true },
    ],
  },
  {
    label: "Customer Intelligence",
    items: [
      { to: "/admin/customers", icon: "Users", label: "Customers", match: ["/admin/customers", "/admin/customer/"] },
      { to: "/admin/personas", icon: "Brain", label: "Personas", match: ["/admin/personas"] },
      { to: "/admin/analytics", icon: "BarChart3", label: "Behavior Analytics", match: ["/admin/analytics"] },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/admin/product-intelligence", icon: "Lightbulb", label: "Product Intelligence", match: ["/admin/product-intelligence"] },
    ],
  },
  {
    label: "Catalog & Sales",
    items: [
      { to: "/admin/products", icon: "Package", label: "Products", match: ["/admin/products"] },
      { to: "/admin/orders", icon: "ShoppingCart", label: "Orders", match: ["/admin/orders"] },
    ],
  },
  {
    label: "Config",
    items: [{ to: "/admin/settings", icon: "Settings", label: "Settings", match: ["/admin/settings"] }],
  },
];

const TITLES = {
  "/admin": "Dashboard",
  "/admin/dashboard": "Dashboard",
  "/admin/customers": "Customers",
  "/admin/analytics": "Behavior Analytics",
  "/admin/personas": "Personas",
  "/admin/product-intelligence": "Product Intelligence",
  "/admin/products": "Products",
  "/admin/orders": "Orders",
  "/admin/settings": "Settings",
  "/admin/customer-journeys": "Customer Journeys",
  "/admin/journey": "Customer Journeys",
  "/admin/seller-intelligence": "Seller Intelligence",
  "/admin/sales-insights": "Sales Insights",
  "/admin/sellers": "Seller Directory",
  "/admin/listings": "Listings",
  "/admin/marketplace-health": "Trust & Order Flow",
  "/admin/moderation/reports": "Moderation",
  "/admin/clusters": "Cluster Lab",
  "/admin/ml-lab": "ML Lab",
};

export function initAdminShell() {
  const $ = (sel) => document.querySelector(sel);

  const ui = { sidebarOpen: false };

  const aside = $("[data-admin-aside]");
  const navHost = $("[data-admin-nav]");
  const railHost = $("[data-admin-rail]");
  const titleEl = $("[data-admin-title]");
  const nameEl = $("[data-admin-name]");
  const avatarEl = $("[data-admin-avatar]");
  const scrimHost = $("[data-admin-scrim]");
  const openBtn = $("[data-admin-open]");
  const closeBtn = $("[data-admin-close]");

  const isCustomerDetail = (pathname) => /^\/admin\/customers?\/[^/]+$/.test(pathname);

  const isActive = (item) => {
    const pathname = getLocation()?.path || "";
    return item.match.some((p) =>
      item.exact ? pathname === p : p.endsWith("/") ? pathname === p : pathname.startsWith(p)
    );
  };

  const currentTitle = () => {
    const pathname = getLocation()?.path || "";
    return TITLES[pathname] || (isCustomerDetail(pathname) ? "Customer Detail" : "Admin");
  };

  function paint() {
    const user = auth.user;
    if (!aside) return;

    aside.className = cx(
      "fixed inset-y-0 left-0 z-50 w-[264px] bg-ink-900 text-white flex flex-col transition-transform duration-200 ease-smooth lg:translate-x-0 lg:static lg:inset-auto lg:z-auto",
      ui.sidebarOpen ? "translate-x-0 shadow-pop" : "-translate-x-full"
    );

    if (navHost) {
      mount(
        navHost,
        GROUPS.map((g) =>
          h(
            "div",
            null,
            h("p", { className: "nav-rail-group" }, g.label),
            h(
              "div",
              { className: "space-y-0.5" },
              g.items.map((n) => {
                const active = isActive(n);
                return A(
                  n.to,
                  {
                    onClick: () => {
                      ui.sidebarOpen = false;
                      paint();
                    },
                    className: cx("nav-rail-item", active ? "nav-rail-item-active" : ""),
                  },
                  active
                    ? h("span", {
                        className: "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary",
                      })
                    : null,
                  icon(n.icon, {
                    size: 16,
                    className: active ? "text-brand-300 flex-none" : "flex-none",
                  }),
                  h("span", { className: "truncate" }, n.label),
                  active ? icon("ChevronRight", { size: 13, className: "ml-auto text-white/40 flex-none" }) : null
                );
              })
            )
          )
        )
      );
    }

    if (railHost) {
      mount(
        railHost,
        A("/", { className: "nav-rail-item" }, icon("Store", { size: 16, className: "flex-none" }), "View storefront"),
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              auth.logout();
              navigate("/admin/login");
            },
            className: "nav-rail-item w-full text-rose-300 hover:text-rose-200 hover:bg-rose-500/10",
          },
          icon("LogOut", { size: 16, className: "flex-none" }),
          "Logout"
        )
      );
    }

    if (titleEl) titleEl.textContent = currentTitle();
    if (nameEl) nameEl.textContent = user?.name || "";
    if (avatarEl) avatarEl.textContent = (user?.name || "A").charAt(0).toUpperCase();

    if (scrimHost) {
      mount(
        scrimHost,
        ui.sidebarOpen
          ? h("div", {
              className: "fixed inset-0 bg-ink-950/55 backdrop-blur-[2px] z-40",
              onClick: () => {
                ui.sidebarOpen = false;
                paint();
              },
            })
          : null
      );
    }
  }

  openBtn?.addEventListener("click", () => {
    ui.sidebarOpen = true;
    paint();
  });
  closeBtn?.addEventListener("click", () => {
    ui.sidebarOpen = false;
    paint();
  });

  auth.subscribe(paint);
  paint();
}