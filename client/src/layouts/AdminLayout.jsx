import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  LayoutDashboard, Users, Package, ShoppingCart, BarChart3, Brain, Network, Route,
  Settings, FlaskConical, LogOut, Menu, X, ChevronRight, Sparkles, Store, Lightbulb, ShieldCheck,
  Activity,
} from "lucide-react";
import { useState } from "react";

const GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard", match: ["/admin", "/admin/dashboard"], exact: true },
      { to: "/admin/journey", icon: Route, label: "Journey", match: ["/admin/journey"] },
    ],
  },
  {
    label: "Customer Intelligence",
    items: [
      { to: "/admin/customers", icon: Users, label: "Customers", match: ["/admin/customers", "/admin/customer/"] },
      { to: "/admin/analytics", icon: BarChart3, label: "Behavior", match: ["/admin/analytics"] },
      { to: "/admin/personas", icon: Brain, label: "Personas", match: ["/admin/personas"] },
    ],
  },
  {
    label: "Catalog & Sales",
    items: [
      { to: "/admin/product-intelligence", icon: Lightbulb, label: "Product Intelligence", match: ["/admin/product-intelligence"] },
      { to: "/admin/orders", icon: ShoppingCart, label: "Orders", match: ["/admin/orders"] },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/admin/listings", icon: Package, label: "Listings", match: ["/admin/listings", "/admin/products"] },
      { to: "/admin/sellers", icon: Store, label: "Sellers", match: ["/admin/sellers", "/admin/marketplace"] },
      { to: "/admin/moderation/reports", icon: ShieldCheck, label: "Moderation", match: ["/admin/moderation"] },
      { to: "/admin/marketplace-health", icon: Activity, label: "Trust & Flow", match: ["/admin/marketplace-health"] },
    ],
  },
  {
    label: "Config",
    items: [{ to: "/admin/settings", icon: Settings, label: "Settings", match: ["/admin/settings"] }],
  },
];

/**
 * Model tooling, deliberately kept out of the product navigation above.
 *
 * The clustering and ML labs are how an operator inspects and re-runs the
 * segmentation pipeline. They are the *mechanism* behind Personas and Behavior,
 * not a destination an admin is meant to work in day to day, so promoting them
 * to the same level as Customers or Orders made the admin area look like a
 * data-science workbench. They stay fully reachable - routes, pages and
 * features are untouched - just demoted to a subdued section at the bottom.
 */
const PLATFORM_TOOLS = [
  { to: "/admin/clusters", icon: Network, label: "Cluster Lab", match: ["/admin/clusters"] },
  { to: "/admin/ml-lab", icon: FlaskConical, label: "ML Lab", match: ["/admin/ml-lab"] },
];

const TITLES = {
  "/admin": "Dashboard",
  "/admin/dashboard": "Dashboard",
  "/admin/journey": "Customer Journey",
  "/admin/customers": "Customers",
  "/admin/analytics": "Behavior Intelligence",
  "/admin/personas": "Personas",
  "/admin/clusters": "Cluster Lab",
  "/admin/ml-lab": "ML Lab",
  "/admin/products": "Listings",
  "/admin/listings": "Listings",
  "/admin/product-intelligence": "Product Intelligence",
  "/admin/orders": "Orders",
  "/admin/sellers": "Sellers",
  "/admin/marketplace": "Sellers",
  "/admin/marketplace-health": "Trust & Order Flow",
  "/admin/moderation/reports": "Moderation",
  "/admin/settings": "Settings",
};

const isCustomerDetail = (pathname) =>
  /^\/admin\/customers?\/[^/]+$/.test(pathname);

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item) =>
    item.match.some((p) =>
      item.exact
        ? location.pathname === p
        : p.endsWith("/")
        ? location.pathname === p
        : location.pathname.startsWith(p)
    );

  const currentTitle =
    TITLES[location.pathname] ||
    (isCustomerDetail(location.pathname) ? "Customer Detail" : "Admin");

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* ================= SIDEBAR ================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[264px] bg-ink-900 text-white flex flex-col
          transition-transform duration-200 ease-smooth
          lg:translate-x-0 lg:static lg:inset-auto lg:z-auto
          ${sidebarOpen ? "translate-x-0 shadow-pop" : "-translate-x-full"}`}
      >
        {/* brand */}
        <div className="px-5 h-[68px] flex items-center border-b border-white/[0.07] flex-none">
          <Link to="/admin" className="flex items-center gap-3 group">
            <span
              className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-[15px]
                font-extrabold shadow-glow-primary transition-transform duration-200 group-hover:-translate-y-0.5"
            >
              R
            </span>
            <span className="leading-tight">
              <span className="block font-display font-extrabold text-[13px] tracking-tight">
                ReMarket Cloud
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
                Command Center
              </span>
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="ml-auto lg:hidden text-white/50 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* nav */}
        <nav className="px-3 py-4 space-y-5 overflow-y-auto flex-1">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="nav-rail-group">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map((n) => {
                  const active = isActive(n);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setSidebarOpen(false)}
                      className={`nav-rail-item ${active ? "nav-rail-item-active" : ""}`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                      )}
                      <n.icon
                        size={16}
                        className={active ? "text-brand-300 flex-none" : "flex-none"}
                      />
                      <span className="truncate">{n.label}</span>
                      {active && <ChevronRight size={13} className="ml-auto text-white/40 flex-none" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Kept out of the product navigation above, but always rendered: gating
              this on "already inside a lab" made the two tools unreachable by
              navigation from every other admin page, so the only way in was
              typing the URL. Separate group + divider + dimmed text is what
              keeps them subordinate; hiding them is not. */}
          <div className="pt-4 border-t border-white/[0.07]">
            <p className="nav-rail-group">Model tooling</p>
            <div className="space-y-0.5">
              {PLATFORM_TOOLS.map((n) => {
                const active = isActive(n);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`nav-rail-item text-white/55 hover:text-white/80 ${active ? "nav-rail-item-active !text-brand-300" : ""}`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                    )}
                    <n.icon size={16} className="flex-none" />
                    <span className="truncate">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* footer */}
        <div className="p-3 border-t border-white/[0.07] space-y-1 flex-none">
          <Link
            to="/"
            className="nav-rail-item"
          >
            <Store size={16} className="flex-none" />
            View storefront
          </Link>
          <button
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
            className="nav-rail-item w-full text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
          >
            <LogOut size={16} className="flex-none" />
            Logout
          </button>
        </div>
      </aside>

      {/* ================= CONTENT ================= */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="sticky top-0 z-40 h-[68px] bg-white/85 backdrop-blur-xl border-b border-line
            px-4 lg:px-8 flex items-center gap-3"
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-sunken"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2 text-xs font-semibold text-muted min-w-0">
            <span className="hidden sm:inline">ReMarket Cloud</span>
            <ChevronRight size={12} className="hidden sm:block text-muted-soft flex-none" />
            <span className="text-ink-900 truncate">{currentTitle}</span>
          </div>

          <span className="badge badge-primary hidden md:inline-flex ml-1">
            <ShieldCheck size={11} /> Admin
          </span>

          <div className="flex-1" />

          <Link
            to="/"
            className="btn-quiet hidden sm:inline-flex text-xs"
            title="Open storefront"
          >
            <Sparkles size={15} /> Storefront
          </Link>

          <span className="w-px h-7 bg-line hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block leading-tight">
              <div className="text-[13px] font-bold text-ink-900">{user?.name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-soft">
                Administrator
              </div>
            </div>
            <span className="avatar w-9 h-9 text-[13px]">
              {user?.name?.charAt(0)?.toUpperCase() || "A"}
            </span>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink-950/55 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
