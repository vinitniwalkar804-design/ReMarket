import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Laptop, Smartphone, BookOpen, Calculator, Bike, Armchair, Zap, Gamepad2, Package, Tag,
  ArrowRight, ChevronRight, LayoutGrid,
} from "lucide-react";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import ProductCard from "../components/ProductCard.jsx";
import { SkeletonCard } from "../components/Loading.jsx";
import { seriesColor } from "../utils/theme.js";
import useCompare from "../hooks/useCompare.js";
import { useAuth } from "../context/AuthContext.jsx";

const CATEGORY_ICONS = {
  Laptops: Laptop,
  Smartphones: Smartphone,
  Books: BookOpen,
  Calculators: Calculator,
  Cycles: Bike,
  Furniture: Armchair,
  Electronics: Zap,
  Gaming: Gamepad2,
  Accessories: Package,
};

const CATEGORY_BLURBS = {
  Laptops: "Pre-loved laptops and MacBooks from final-semester students.",
  Smartphones: "Phones with honest condition reports and verified sellers.",
  Books: "Textbooks, novels and notes at a fraction of retail.",
  Calculators: "Scientific & graphing calculators that still crunch everything.",
  Cycles: "Campus commuters to weekend cruisers, recently serviced.",
  Furniture: "Desks, chairs and storage that move out with the batch.",
  Electronics: "Peripherals, audio and gadgets with negotiable prices.",
  Gaming: "Consoles, controllers and rigs for the campus squad.",
  Accessories: "Chargers, bags, stands and everyday college gear.",
};

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const { user } = useAuth();
  const { isComparing, toggleCompare } = useCompare();

  useEffect(() => {
    const load = async () => {
      try {
        const [cRes, wRes] = await Promise.all([
          api.get("/products/categories"),
          api.get("/wishlist").catch(() => null),
        ]);
        const cats = cRes.data.categories || [];
        setCategories(cats);
        setWishlistIds(
          new Set(
            (wRes?.data?.wishlist || wRes?.data?.products || []).map((w) =>
              String(w.product?._id || w.productId || w._id)
            )
          )
        );

        const previewResults = await Promise.allSettled(
          cats.slice(0, 8).map((c) => api.get(`/products?category=${c._id}&limit=4&sort=popular`))
        );
        const map = {};
        previewResults.forEach((r, i) => {
          if (r.status === "fulfilled") map[cats[i]._id] = r.value.data.products || [];
        });
        setPreviews(map);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const toggleWishlist = async (productId) => {
    const present = wishlistIds.has(String(productId));
    try {
      if (present) {
        const wishlist = await api.get("/wishlist").catch(() => null);
        const items = wishlist?.data?.wishlist || wishlist?.data?.products || [];
        const item = items.find(
          (w) => String(w.product?._id || w.productId || w._id) === String(productId)
        );
        if (item) await api.delete(`/wishlist/${item._id}`);
        setWishlistIds((prev) => {
          const s = new Set(prev);
          s.delete(String(productId));
          return s;
        });
      } else {
        await api.post("/wishlist", { productId });
        setWishlistIds((prev) => new Set(prev).add(String(productId)));
      }
    } catch {}
  };

  return (
    <div className="animate-fade-in">
      {/* ================= MASTHEAD ================= */}
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted mb-4">
            <Link to="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight size={12} className="text-muted-soft" />
            <span className="text-ink-900">Categories</span>
          </nav>
          <p className="page-eyebrow">
            <LayoutGrid size={13} /> Departments
          </p>
          <h1 className="page-title text-balance">Browse by category</h1>
          <p className="page-sub max-w-2xl">
            Every department of the campus marketplace — from last-semester laptops to
            barely-used cycling gear. Pick a category to see its most popular listings, or jump
            straight into the full catalog.
          </p>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* ================= CATEGORY GRID ================= */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-16">
          {categories.map((cat, ci) => {
            const Icon = CATEGORY_ICONS[cat.name] || Tag;
            const tint = seriesColor(ci);
            return (
              <Link
                key={cat._id}
                to={`/products?category=${cat._id}`}
                onClick={() => behavior.categoryView(cat.name)}
                className="card card-hover group relative overflow-hidden p-5"
              >
                <span className="absolute inset-x-0 top-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ backgroundColor: tint }} />
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110"
                  style={{ backgroundColor: `${tint}1A`, color: tint }}
                >
                  <Icon size={20} />
                </span>
                <h2 className="font-bold text-ink-900 group-hover:text-primary transition-colors">
                  {cat.name}
                </h2>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  {CATEGORY_BLURBS[cat.name] || "Second-hand finds with tracked history."}
                </p>
                <span className="link-more mt-3.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  Explore <ArrowRight size={12} />
                </span>
              </Link>
            );
          })}
        </div>

        {/* ================= PREVIEWS ================= */}
        <div className="space-y-14">
          {categories.slice(0, 8).map((cat) => {
            const products = previews[cat._id] || [];
            return (
              <section key={cat._id}>
                <div className="flex items-end justify-between gap-4 mb-5">
                  <div className="min-w-0">
                    <h2 className="section-title">{cat.name}</h2>
                    <p className="section-sub">
                      {CATEGORY_BLURBS[cat.name] || "Popular listings this week"}
                    </p>
                  </div>
                  <Link to={`/products?category=${cat._id}`} className="link-more flex-none">
                    View all <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {loading
                    ? Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
                    : products.map((p) => (
                        <Link key={p._id} to={`/products/${p._id}`} className="block h-full">
                          <ProductCard
                            product={p}
                            onWishlist={toggleWishlist}
                            wishlisted={wishlistIds.has(String(p._id))}
                            onCompare={user ? toggleCompare : undefined}
                            comparing={isComparing(p._id)}
                          />
                        </Link>
                      ))}
                  {!loading && products.length === 0 && (
                    <div className="col-span-2 lg:col-span-4">
                      <div className="sunken-panel py-8 text-center">
                        <p className="text-sm text-muted">
                          No listed items yet in this category — be the first to sell.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
