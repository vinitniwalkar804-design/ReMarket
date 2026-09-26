import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  SlidersHorizontal, X, PackageSearch, Star, MapPin, LayoutGrid, List, Check, Rows3,
} from "lucide-react";
import api from "../services/api.js";
import behavior from "../utils/behavior.js";
import ProductCard from "../components/ProductCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { SkeletonCard } from "../components/Loading.jsx";
import { formatINR } from "../utils/format.js";
import { conditionTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";
import useCompare from "../hooks/useCompare.js";
import { useAuth } from "../context/AuthContext.jsx";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Most popular" },
  { value: "rating", label: "Top rated" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
];

const CONDITIONS = ["Like New", "Good", "Average"];

const pageNumbers = (totalPages, current) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, current - 1, current, current + 1]);
  return [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
};

const PER_PAGE = 20;

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState("grid");
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const { user } = useAuth();
  const { isComparing, toggleCompare } = useCompare();

  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const condition = (searchParams.get("condition") || "").split(",").filter(Boolean);
  const brand = searchParams.get("brand") || "";
  const location = searchParams.get("location") || "";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";
  const negotiable = searchParams.get("negotiable") === "true";
  const exchangeable = searchParams.get("exchangeable") === "true";
  const minRating = searchParams.get("minRating") || "";
  const sort = searchParams.get("sort") || "newest";
  const page = Number(searchParams.get("page") || 1);

  const updateFilter = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    setSearchParams(params);
  };

  const toggleCondition = (c) => {
    const next = condition.includes(c) ? condition.filter((x) => x !== c) : [...condition, c];
    updateFilter("condition", next.join(","));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (category) params.set("category", category);
        if (condition.length) params.set("condition", condition.join(","));
        if (brand) params.set("brand", brand);
        if (location) params.set("location", location);
        if (minPrice) params.set("minPrice", minPrice);
        if (maxPrice) params.set("maxPrice", maxPrice);
        if (negotiable) params.set("negotiable", "true");
        if (exchangeable) params.set("exchangeable", "true");
        if (minRating) params.set("minRating", minRating);
        params.set("sort", sort);
        params.set("page", String(page));
        params.set("limit", String(PER_PAGE));

        const [pRes, cRes, wRes] = await Promise.all([
          api.get(`/products?${params}`),
          api.get("/products/categories"),
          api.get("/wishlist").catch(() => null),
        ]);
        setProducts(pRes.data.products);
        setTotal(pRes.data.total);
        setCategories(cRes.data.categories);
        setWishlistIds(new Set((wRes?.data?.products || []).map((w) => String(w._id))));
        if (search) behavior.search(search, category);
      } catch {}
      setLoading(false);
    };
    load();
  }, [searchParams.toString()]);

  const toggleWishlist = async (productId) => {
    const present = wishlistIds.has(String(productId));
    try {
      if (present) {
        const wishlist = await api.get("/wishlist").catch(() => null);
        const item = (wishlist?.data?.products || []).find((w) => String(w._id) === String(productId));
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

  const activeFilterCount =
    [category, brand, location, minPrice, maxPrice, minRating].filter(Boolean).length +
    condition.length +
    (negotiable ? 1 : 0) +
    (exchangeable ? 1 : 0);

  const clearAll = () => setSearchParams(search ? { search } : {});
  const totalPages = Math.ceil(total / PER_PAGE);
  const activeCategoryName = categories.find((c) => c._id === category)?.name;

  return (
    <div className="animate-fade-in">
      {/* ================= MASTHEAD ================= */}
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-7">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="page-eyebrow">
                <Rows3 size={13} /> Marketplace
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="page-title">
                  {search ? `Results for “${search}”` : activeCategoryName || "All listings"}
                </h1>
                <span className="badge badge-primary">{total}</span>
              </div>
              <p className="page-sub">
                {total} item{total === 1 ? "" : "s"}
                {activeCategoryName ? ` in ${activeCategoryName}` : ""} from verified
                sellers
                {location ? ` near ${location}` : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-secondary flex-none ${showFilters ? "!bg-primary-soft !border-brand-200 !text-primary" : ""}`}
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[20px] h-5 px-1.5 bg-primary text-white text-2xs rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* category rail */}
          {!search && categories.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-6 -mb-1">
              <button
                onClick={() => updateFilter("category", "")}
                className={!category ? "chip-active" : "chip-idle"}
              >
                All
              </button>
              {categories.slice(0, 9).map((c) => (
                <button
                  key={c._id}
                  onClick={() => updateFilter("category", c._id)}
                  className={category === c._id ? "chip-active" : "chip-idle"}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* ================= FILTER PANEL ================= */}
        {showFilters && (
          <div className="panel mb-6 animate-slide-down">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Refine your search</h2>
                <p className="panel-sub">Narrow by category, condition, price and trust signals</p>
              </div>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} className="btn-quiet btn-sm">
                  Clear all
                </button>
              )}
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <label className="input-label">Category</label>
                <select
                  value={category}
                  onChange={(e) => updateFilter("category", e.target.value)}
                  className="select-field"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label">Condition</label>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleCondition(c)}
                      className={
                        condition.includes(c)
                          ? "chip bg-primary-soft text-primary border-brand-200"
                          : "chip-idle"
                      }
                    >
                      {condition.includes(c) && <Check size={12} />}
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="input-label">Location</label>
                <input
                  value={location}
                  onChange={(e) => updateFilter("location", e.target.value)}
                  placeholder="e.g. Mumbai, Delhi"
                  className="input-field"
                />
              </div>

              <div>
                <label className="input-label">Price range (₹)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => updateFilter("minPrice", e.target.value)}
                    placeholder="Min"
                    className="input-field"
                  />
                  <span className="text-muted-soft">–</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => updateFilter("maxPrice", e.target.value)}
                    placeholder="Max"
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Brand</label>
                <input
                  value={brand}
                  onChange={(e) => updateFilter("brand", e.target.value)}
                  placeholder="Apple, Dell, Sony…"
                  className="input-field"
                />
              </div>

              <div>
                <label className="input-label">Minimum rating</label>
                <select
                  value={minRating}
                  onChange={(e) => updateFilter("minRating", e.target.value)}
                  className="select-field"
                >
                  <option value="">Any rating</option>
                  <option value="4">4★ &amp; up</option>
                  <option value="4.5">4.5★ &amp; up</option>
                </select>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-line bg-raised flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {[
                  { label: "Negotiable only", value: negotiable, key: "negotiable" },
                  { label: "Accept exchange", value: exchangeable, key: "exchangeable" },
                ].map((t) => (
                  <label key={t.key} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={t.value}
                      onChange={(e) => updateFilter(t.key, e.target.checked ? "true" : "")}
                      className="checkbox-field"
                    />
                    <span className="text-[13px] font-semibold text-ink-800">{t.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-2xs font-bold uppercase tracking-[0.1em] text-muted">Sort</label>
                <select
                  value={sort}
                  onChange={(e) => updateFilter("sort", e.target.value)}
                  className="select-field w-auto input-field-sm"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ================= TOOLBAR ================= */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <p className="text-sm text-muted font-medium">
            {loading ? "Loading listings…" : `${total} item${total === 1 ? "" : "s"} found`}
          </p>
          <div className="tab-list">
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={`tab !px-2.5 ${view === "grid" ? "tab-active" : ""}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              aria-label="List view"
              className={`tab !px-2.5 ${view === "list" ? "tab-active" : ""}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* ================= RESULTS ================= */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={PackageSearch}
              title="No products match your filters"
              description="Try widening the price range, clearing a filter, or searching for something different."
              action={<button onClick={clearAll} className="btn-primary">Clear all filters</button>}
            />
          </div>
        ) : view === "list" ? (
          <div className="flex flex-col gap-3">
            {products.map((p) => (
              <Link
                key={p._id}
                to={`/products/${p._id}`}
                className="card card-hover p-4 group flex gap-4"
              >
                <div className="w-28 h-24 sm:w-36 sm:h-28 rounded-xl bg-sunken overflow-hidden flex-none">
                  <img alt={p.title} {...imageProps(p)} className="w-full h-full object-cover" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-neutral">{p.brand}</span>
                    <span className={`badge border ${conditionTone(p.condition)}`}>{p.condition}</span>
                    {p.negotiable && <span className="badge badge-accent">Negotiable</span>}
                    {p.seller?.isVerifiedSeller && <span className="badge badge-success">Verified seller</span>}
                  </div>
                  <h3 className="font-bold text-ink-900 group-hover:text-primary transition-colors line-clamp-1 mt-2">
                    {p.title}
                  </h3>
                  <p className="text-xs text-muted line-clamp-1 mt-1">{p.description}</p>
                  <div className="flex items-center gap-3 mt-auto pt-2">
                    <span className="text-lg font-extrabold text-ink-900 tabular">
                      {formatINR(p.price)}
                    </span>
                    {p.originalPrice > p.price && (
                      <span className="text-xs text-muted-soft line-through tabular">
                        {formatINR(p.originalPrice)}
                      </span>
                    )}
                    {p.location && (
                      <span className="inline-flex items-center gap-1 text-2xs text-muted ml-auto">
                        <MapPin size={11} /> {p.location}
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden sm:flex flex-col items-end justify-between flex-none">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-800">
                    <Star size={12} className="text-rating fill-rating" />
                    {p.rating ? Number(p.rating).toFixed(1) : "New"}
                  </span>
                  <span className="text-2xs text-muted">{p.categoryName}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((p) => (
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
          </div>
        )}

        {/* ================= PAGINATION ================= */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-10 flex-wrap">
            {pageNumbers(totalPages, page).map((pn, idx, arr) => (
              <span key={pn} className="contents">
                {idx > 0 && arr[idx - 1] !== pn - 1 && (
                  <>
                    <span className="text-xs text-muted-soft px-1">…</span>
                  </>
                )}
                <button
                  onClick={() => updateFilter("page", String(pn))}
                  aria-current={page === pn ? "page" : undefined}
                  className={`min-w-9 h-9 px-2 rounded-lg text-sm font-bold transition-all duration-150 ${
                    page === pn
                      ? "bg-primary text-white shadow-glow-primary"
                      : "bg-card border border-line text-muted hover:border-line-strong hover:text-ink-900"
                  }`}
                >
                  {pn}
                </button>
              </span>
            ))}
            <span className="text-xs text-muted ml-3">
              Page {page} of {totalPages}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
