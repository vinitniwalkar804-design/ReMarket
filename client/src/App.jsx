import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { CompareProvider } from "./context/CompareContext.jsx";
import Layout from "./layouts/Layout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
const Home = lazy(() => import("./pages/Home.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const Products = lazy(() => import("./pages/Products.jsx"));
const Categories = lazy(() => import("./pages/Categories.jsx"));
const ProductDetail = lazy(() => import("./pages/ProductDetail.jsx"));
const SellerProfile = lazy(() => import("./pages/SellerProfile.jsx"));
const Compare = lazy(() => import("./pages/Compare.jsx"));
const Wishlist = lazy(() => import("./pages/Wishlist.jsx"));
const Cart = lazy(() => import("./pages/Cart.jsx"));
const Checkout = lazy(() => import("./pages/Checkout.jsx"));
const Orders = lazy(() => import("./pages/Orders.jsx"));
const Sell = lazy(() => import("./pages/Sell.jsx"));
const Offers = lazy(() => import("./pages/Offers.jsx"));
const Messages = lazy(() => import("./pages/Messages.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Notifications = lazy(() => import("./pages/Notifications.jsx"));
const Activity = lazy(() => import("./pages/Activity.jsx"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers.jsx"));
const AdminCustomerDetail = lazy(() => import("./pages/admin/AdminCustomerDetail.jsx"));
const AdminListings = lazy(() => import("./pages/admin/AdminListings.jsx"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers.jsx"));
const AdminModeration = lazy(() => import("./pages/admin/AdminModeration.jsx"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders.jsx"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics.jsx"));
const AdminPersonas = lazy(() => import("./pages/admin/AdminPersonas.jsx"));
const AdminClusters = lazy(() => import("./pages/admin/AdminClusters.jsx"));
const AdminMLLab = lazy(() => import("./pages/admin/AdminMLLab.jsx"));
const AdminJourney = lazy(() => import("./pages/admin/AdminJourney.jsx"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings.jsx"));
const AdminProductIntel = lazy(() => import("./pages/admin/AdminProductIntel.jsx"));
const AdminMarketplace = lazy(() => import("./pages/admin/AdminMarketplace.jsx"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts.jsx"));
const SellerIntelligence = lazy(() => import("./pages/admin/SellerIntelligence.jsx"));
const SalesInsights = lazy(() => import("./pages/admin/SalesInsights.jsx"));
import LoadingScreen from "./components/LoadingScreen.jsx";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || user.role !== "customer") return <Navigate to="/login" />;
  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/admin/login" />;
  // Authenticated but not an administrator: send back to the storefront rather
  // than bouncing through /admin/login, which PublicOnly would redirect anyway.
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

const PublicOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/"} />;
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { borderRadius: "10px", padding: "14px", fontSize: "14px" } }} />
      <BrowserRouter>
        {/* One compare tray for the whole app. It has to sit inside the router so
            the "Added to Compare" toast can link to /compare, and it reads the
            signed-in customer from AuthContext, so a sign-out empties the tray
            instead of leaving the previous customer's shortlist on screen. */}
        <CompareProvider>
          {/* Pages are code-split, so a route can be a chunk that has not arrived
              yet. One boundary here keeps every lazy page from needing its own,
              and reuses the same full-screen loader as the auth check so the two
              look identical. Layouts stay eager, so the nav renders immediately. */}
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/admin/login" element={<PublicOnly><AdminLogin /></PublicOnly>} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/seller/:id" element={<SellerProfile />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<Messages />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/activity" element={<Activity />} />
          </Route>

          {/* Admin shell. `path="/admin"` is required so that "/admin" and
              "/admin/" resolve to the index route instead of falling through
              to the router's no-match branch. AdminLayout renders <Outlet />.

              Route order below mirrors the sidebar: Overview, Customer
              Intelligence, Marketplace Intelligence, Catalog & Sales, Config.
              Each of those is a real page. The legacy destinations at the
              bottom are still fully functional and are deliberately *not*
              redirects - they are reachable from the "Advanced tools"
              disclosure in the rail, and any bookmark pointing at them keeps
              working. */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            {/* Overview */}
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />

            {/* Customer Intelligence */}
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="customers/:id" element={<AdminCustomerDetail />} />
            {/* legacy singular path kept so existing bookmarks still resolve */}
            <Route path="customer/:id" element={<AdminCustomerDetail />} />
            <Route path="personas" element={<AdminPersonas />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="customer-journeys" element={<AdminJourney />} />
            {/* legacy alias: the page was renamed, the path was not broken */}
            <Route path="journey" element={<AdminJourney />} />

            {/* Marketplace Intelligence */}
            <Route path="product-intelligence" element={<AdminProductIntel />} />
            <Route path="seller-intelligence" element={<SellerIntelligence />} />
            <Route path="sales-insights" element={<SalesInsights />} />

            {/* Catalog & Sales */}
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<AdminOrders />} />

            {/* Config */}
            <Route path="settings" element={<AdminSettings />} />

            {/* Still functional, no longer part of the primary navigation.
                These render the original pages rather than redirecting, so no
                capability was traded away for a tidier menu. */}
            <Route path="listings" element={<AdminListings />} />
            <Route path="sellers" element={<AdminSellers />} />
            <Route path="marketplace-health" element={<AdminMarketplace />} />
            <Route path="moderation/reports" element={<AdminModeration />} />
            <Route path="clusters" element={<AdminClusters />} />
            <Route path="ml-lab" element={<AdminMLLab />} />
            {/* the old combined page split: sellers moved to the seller pages */}
            <Route path="marketplace" element={<Navigate to="/admin/seller-intelligence" replace />} />
            {/* unknown admin sub-path -> dashboard instead of a blank page */}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
            </Routes>
          </Suspense>
        </CompareProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
