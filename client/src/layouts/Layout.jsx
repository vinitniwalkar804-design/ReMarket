import { useState, useEffect, useRef } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCompareStore } from "../context/CompareContext.jsx";
import {
  Search, ShoppingCart, Heart, Package, Tag, MessageCircle, Bell, User, LogOut,
  Menu, X, Store, ArrowLeftRight, Sparkles, Compass, LayoutGrid, Activity,
} from "lucide-react";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import { formatINR, timeAgo } from "../utils/format.js";
import { imageProps } from "../utils/images.js";

const NAV = [
  { to: "/products", icon: Compass, label: "Explore" },
  { to: "/categories", icon: LayoutGrid, label: "Categories" },
  { to: "/sell", icon: Tag, label: "Sell" },
  { to: "/compare", icon: ArrowLeftRight, label: "Compare" },
];

const QUICK = [
  { to: "/wishlist", icon: Heart, label: "Wishlist" },
  { to: "/messages", icon: MessageCircle, label: "Messages" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
];

const MOBILE_TABS = [
  { to: "/", icon: Store, label: "Home" },
  { to: "/products", icon: Compass, label: "Explore" },
  { to: "/sell", icon: Sparkles, label: "Sell" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
  { to: "/notifications", icon: Bell, label: "Alerts" },
];

const ME = [
  { to: "/profile", icon: User, label: "My Profile" },
  { to: "/activity", icon: Activity, label: "Shopping Insights" },
  { to: "/orders", icon: Package, label: "My Orders" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  // The compare tray lives in context, so the nav badge is the same number the
  // Compare page will show and there is no second copy to fall out of date.
  const { count: compareCount } = useCompareStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchBoxRef = useRef(null);
  const debounceRef = useRef(null);
  // Each dismissible surface needs its own ref so the document-level listener
  // can tell "the user clicked this panel's toggle" from "the user clicked
  // somewhere else entirely". Without them a mousedown *inside* a panel closed
  // the panel before the browser could deliver `click`, so every item in the
  // profile and notification menus was rendered but permanently unclickable.
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [nRes, cRes, wRes] = await Promise.all([
          api.get("/notifications?limit=6"),
          api.get("/cart").catch(() => null),
          api.get("/wishlist").catch(() => null),
        ]);
        setNotifCount(nRes.data.unreadCount || 0);
        setNotifs(nRes.data.notifications || []);
        setCartCount(cRes?.data?.cart?.items?.length || cRes?.data?.count || 0);
        setWishlistCount(wRes?.data?.wishlist?.length || wRes?.data?.products?.length || 0);
      } catch {}
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  useEffect(() => {
    // Dismiss-on-outside-click for the three dismissible surfaces in the header.
    //
    // This has to be a containment test per panel, not a blanket "close
    // everything". React flushes state synchronously for discrete events, so a
    // mousedown that sets `profileOpen` to false unmounts the menu *before* the
    // browser dispatches `click` on the item the user actually pressed. The item
    // then never receives the click and the menu is unusable: it opens, it looks
    // correct, and no entry navigates or logs out.
    //
    // `pointerdown` is used rather than `mousedown` so the decision is made once
    // per interaction and before any focus/selection side effects, and each
    // panel keeps its own ref so a press on the profile menu never closes the
    // notification panel's state by accident (and vice versa).
    const onPointerDown = (e) => {
      const target = e.target;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) setSuggestOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    setSuggestOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const onQueryChange = (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions(null);
      setSuggestOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(
          `/search/suggestions?q=${encodeURIComponent(value.trim())}`
        );
        setSuggestions(data);
        setSuggestOpen(true);
      } catch {}
    }, 220);
  };

  const submitSearch = (e) => {
    e?.preventDefault();
    if (query.trim()) {
      behavior.search(query.trim());
      navigate(`/products?search=${encodeURIComponent(query.trim())}`);
      setSuggestOpen(false);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read", { all: true });
      setNotifCount(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const isActive = (to) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const countFor = (to) =>
    to === "/wishlist" ? wishlistCount : to === "/cart" ? cartCount : 0;

  return (
    <div className="min-h-screen bg-canvas flex flex-col pb-20 md:pb-0">
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-line">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 h-[68px]">
            {/* logo */}
            <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
              <span
                className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center
                  text-[15px] font-extrabold shadow-glow-primary transition-transform
                  duration-200 group-hover:-translate-y-0.5"
              >
                R
              </span>
              <span className="hidden sm:block font-display font-extrabold text-[17px] tracking-tight text-ink-900">
                Re<span className="text-primary">Market</span>
              </span>
            </Link>

            <span className="hidden lg:block w-px h-6 bg-line flex-none" />

            {/* search */}
            <form
              ref={searchBoxRef}
              onSubmit={submitSearch}
              className="relative flex-1 max-w-2xl lg:mx-2"
            >
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft pointer-events-none"
                />
                <input
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onFocus={() => query.trim().length >= 2 && setSuggestOpen(true)}
                  placeholder="Search laptops, phones, books…"
                  aria-label="Search marketplace"
                  className="w-full pl-10 pr-20 py-2.5 rounded-xl bg-raised border border-transparent
                    text-sm text-ink-900 placeholder:text-muted-soft outline-none transition-all duration-150
                    focus:bg-white focus:border-brand-300 focus:shadow-focus"
                />
                {query ? (
                  <button
                    onClick={() => {
                      setQuery("");
                      setSuggestions(null);
                      setSuggestOpen(false);
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-soft hover:text-ink-900 transition-colors"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <kbd
                    className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2
                      text-2xs font-bold text-muted-soft bg-white border border-line rounded
                      px-1.5 py-0.5"
                  >
                    /
                  </kbd>
                )}
              </div>

              {suggestOpen && suggestions && (
                <div
                  className="absolute top-full mt-2 inset-x-0 bg-card rounded-2xl border border-line
                    shadow-pop overflow-hidden animate-slide-down max-h-[26rem] overflow-y-auto z-50"
                >
                  {suggestions.products?.length > 0 && (
                    <div className="py-1.5">
                      <p className="px-4 pt-2 pb-1.5 label-eyebrow">Products</p>
                      {suggestions.products.map((p) => (
                        <Link
                          key={p._id}
                          to={`/products/${p._id}`}
                          onClick={() => setSuggestOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised transition-colors"
                        >
                          <img
                            alt={p.title}
                            {...imageProps(p)}
                            className="w-10 h-10 rounded-lg object-cover bg-sunken flex-none"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink-900 truncate">{p.title}</p>
                            <p className="text-2xs text-muted truncate mt-0.5">
                              {p.categoryName} · {p.brand}
                            </p>
                          </div>
                          <span className="text-sm font-extrabold text-primary tabular flex-none">
                            {formatINR(p.price)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {(suggestions.categories || suggestions.category || []).length > 0 && (
                    <div className="py-1.5 border-t border-line">
                      <p className="px-4 pt-2 pb-1.5 label-eyebrow">Categories</p>
                      {(suggestions.categories || suggestions.category || []).map((c) => (
                        <Link
                          key={c._id}
                          to={`/products?category=${c._id}`}
                          onClick={() => setSuggestOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 hover:bg-raised transition-colors"
                        >
                          <LayoutGrid size={14} className="text-accent flex-none" />
                          <span className="text-sm font-semibold text-ink-800">{c.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {suggestions.popular?.length > 0 && (
                    <div className="py-2.5 border-t border-line">
                      <p className="px-4 pb-2 label-eyebrow">Popular right now</p>
                      <div className="flex flex-wrap gap-2 px-4">
                        {suggestions.popular.slice(0, 6).map((term) => (
                          <button
                            key={term}
                            onClick={() => {
                              setQuery(term);
                              submitSearch();
                            }}
                            className="chip-idle"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {suggestions.recent?.length > 0 && (
                    <div className="py-2.5 border-t border-line">
                      <p className="px-4 pb-2 label-eyebrow">Your recent</p>
                      <div className="flex flex-wrap gap-2 px-4">
                        {suggestions.recent.slice(0, 4).map((term) => (
                          <button
                            key={term}
                            onClick={() => {
                              setQuery(term);
                              submitSearch();
                            }}
                            className="chip bg-primary-soft text-primary border-brand-100 hover:bg-brand-100"
                          >
                            <Search size={11} /> {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!suggestions.products?.length &&
                    !suggestions.popular?.length &&
                    !suggestions.recent?.length && (
                      <p className="px-4 py-7 text-sm text-muted text-center">
                        No matches — try a different keyword
                      </p>
                    )}
                </div>
              )}
            </form>

            {/* primary nav */}
            <nav className="hidden xl:flex items-center gap-1 flex-none">
              {NAV.map((n) => {
                const isCompare = n.to === "/compare";
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm
                      font-semibold transition-colors duration-150 ${
                        isActive(n.to)
                          ? "text-primary bg-primary-soft"
                          : "text-muted hover:text-ink-900 hover:bg-sunken"
                      }`}
                  >
                    <n.icon size={16} className={isActive(n.to) ? "" : "text-muted-soft"} />
                    {n.label}
                    {isCompare && compareCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1.5 bg-primary text-white
                        text-[10px] font-bold rounded-full flex items-center justify-center tabular">
                        {compareCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* actions */}
            <div className="flex items-center gap-1 shrink-0">
              {QUICK.map((n) => {
                const active = isActive(n.to);
                const count = countFor(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    title={n.label}
                    aria-label={n.label}
                    className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted hover:bg-sunken hover:text-ink-900"
                    }`}
                  >
                    <n.icon size={19} />
                    {count > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-primary
                          text-white text-[10px] font-bold rounded-full flex items-center justify-center
                          ring-2 ring-white"
                      >
                        {count > 9 ? "9+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}

              {/* notifications */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setNotifOpen(!notifOpen);
                    setProfileOpen(false);
                  }}
                  aria-label="Notifications"
                  className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${
                    notifOpen ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink-900"
                  }`}
                >
                  <Bell size={19} />
                  {notifCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger
                        text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white"
                    >
                      {notifCount > 9 ? "9+" : notifCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)]
                      bg-card rounded-2xl border border-line shadow-pop overflow-hidden
                      animate-slide-down z-50"
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-raised">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-ink-900">Notifications</p>
                        {notifCount > 0 && <span className="badge badge-primary">{notifCount} new</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {notifCount > 0 && (
                          <button onClick={markAllRead} className="text-2xs font-bold text-primary hover:underline">
                            Mark all read
                          </button>
                        )}
                        <Link to="/notifications" className="text-2xs font-bold text-primary hover:underline">
                          View all
                        </Link>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifs.length === 0 ? (
                        <p className="text-sm text-muted text-center py-10">You&apos;re all caught up!</p>
                      ) : (
                        notifs.map((n) => (
                          <Link
                            key={n._id}
                            to={n.link || "/notifications"}
                            className={`flex items-start gap-3 px-4 py-3 border-b border-line
                              last:border-0 hover:bg-raised transition-colors ${n.read ? "" : "bg-primary-soft/40"}`}
                          >
                            <span
                              className={`w-2 h-2 mt-1.5 rounded-full flex-none ${
                                n.read ? "bg-line-strong" : "bg-primary"
                              }`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-ink-900 truncate">
                                {n.title}
                              </span>
                              <span className="block text-xs text-muted line-clamp-2 mt-0.5">{n.message}</span>
                              <span className="block text-2xs text-muted-soft mt-1">{timeAgo(n.createdAt)}</span>
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* profile */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => {
                    setProfileOpen(!profileOpen);
                    setNotifOpen(false);
                  }}
                  className={`flex items-center gap-2 pl-1.5 pr-1.5 py-1.5 rounded-xl transition-colors duration-150 ${
                    profileOpen ? "bg-sunken" : "hover:bg-sunken"
                  }`}
                >
                  <span className="avatar w-8 h-8 text-[13px]">
                    {user?.name?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                  <span className="hidden xl:block text-sm font-semibold text-ink-800 max-w-[110px] truncate">
                    {user?.name}
                  </span>
                </button>

                {profileOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-64 bg-card rounded-2xl border border-line
                      shadow-pop overflow-hidden animate-slide-down z-50"
                  >
                    <div className="px-4 py-3.5 border-b border-line bg-raised">
                      <p className="text-sm font-bold text-ink-900 truncate">{user?.name}</p>
                      <p className="text-2xs text-muted truncate mt-0.5">{user?.email}</p>
                      {user?.location && (
                        <p className="text-2xs text-muted-soft truncate mt-0.5">{user.location}</p>
                      )}
                    </div>
                    <div className="py-1.5">
                      {ME.map((m) => (
                        <Link
                          key={m.to}
                          to={m.to}
                          className={`flex items-center gap-2.5 px-4 py-2 text-[13px] font-semibold transition-colors ${
                            isActive(m.to)
                              ? "bg-primary-soft text-primary"
                              : "text-ink-700 hover:bg-raised"
                          }`}
                        >
                          <m.icon size={15} />
                          {m.label}
                        </Link>
                      ))}
                    </div>
                    <div className="p-1.5 border-t border-line">
                      <button
                        onClick={() => {
                          logout();
                          navigate("/login");
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]
                          font-semibold text-danger hover:bg-danger-soft transition-colors"
                      >
                        <LogOut size={15} /> Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
                className="xl:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-sunken"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* mobile drawer */}
        {mobileOpen && (
          <div className="xl:hidden border-t border-line bg-card animate-slide-down max-h-[75vh] overflow-y-auto">
            <div className="px-4 py-4 space-y-5 max-w-[1400px] mx-auto">
              <div>
                <p className="label-eyebrow px-1 pb-2">Browse</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[{ to: "/", icon: Store, label: "Home" }, ...NAV].map((n) => (
                    <Link
                      key={n.to + n.label}
                      to={n.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors ${
                        isActive(n.to)
                          ? "bg-primary-soft text-primary"
                          : "text-ink-700 hover:bg-sunken"
                      }`}
                    >
                      <n.icon size={16} />
                      {n.label}
                      {n.to === "/compare" && compareCount > 0 && (
                        <span className="ml-auto min-w-[20px] h-[20px] px-1.5 bg-primary text-white
                          text-[10px] font-bold rounded-full flex items-center justify-center tabular">
                          {compareCount}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <p className="label-eyebrow px-1 pb-2">You</p>
                <div className="space-y-1">
                  {ME.map((n) => (
                    <Link
                      key={n.to + n.label}
                      to={n.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors ${
                        isActive(n.to) ? "bg-primary-soft text-primary" : "text-ink-700 hover:bg-sunken"
                      }`}
                    >
                      <n.icon size={16} />
                      {n.label}
                    </Link>
                  ))}
                  <button
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px]
                      font-semibold text-danger hover:bg-danger-soft transition-colors"
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="hidden md:block border-t border-line bg-card mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center text-[12px] font-extrabold">
              R
            </span>
            <p className="text-xs text-muted">
              © {new Date().getFullYear()} ReMarket · Trusted second-hand, campus wide.
            </p>
          </div>
          <nav className="flex items-center gap-5 text-xs font-semibold text-muted">
            <Link to="/products" className="hover:text-primary transition-colors">Explore</Link>
            <Link to="/categories" className="hover:text-primary transition-colors">Categories</Link>
            <Link to="/sell" className="hover:text-primary transition-colors">Sell</Link>
            <Link to="/compare" className="hover:text-primary transition-colors">Compare</Link>
          </nav>
        </div>
      </footer>

      {/* ================= MOBILE TAB BAR ================= */}
      <nav
        className="md:hidden fixed bottom-3 inset-x-3 z-40 bg-white/92 backdrop-blur-xl
          border border-line rounded-2xl shadow-pop flex items-stretch p-1.5
          pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
      >
        {MOBILE_TABS.map((n) => {
          const active = isActive(n.to);
          const count = n.to === "/cart" ? cartCount : n.to === "/notifications" ? notifCount : 0;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px]
                font-bold transition-colors duration-150 ${
                  active ? "bg-primary text-white shadow-glow-primary" : "text-muted"
                }`}
            >
              <span className="relative">
                <n.icon size={18} />
                {count > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full
                      text-[9px] font-bold flex items-center justify-center ${
                        active ? "bg-white text-primary" : "bg-danger text-white"
                      }`}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
