import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Plus, ImagePlus, Sparkles, MapPin, ArrowRight, CheckCircle2, LayoutGrid, Eye, Heart, Scale,
  Pencil, Trash2, PackageCheck, PackageX, Loader2, Trash, Info, X, Link2, Tag, TrendingDown,
  ShieldAlert,
} from "lucide-react";
import api from "../services/api.js";
import toast from "react-hot-toast";
import { formatINR, timeAgo } from "../utils/format.js";
import { imageProps } from "../utils/images.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { listingTone } from "../utils/theme.js";
import { isModerated, listingLabel, listingStatusSentence, reasonLabel } from "../utils/moderation.js";

const conditions = ["Like New", "Good", "Average", "Used"];
const conditionTips = {
  "Like New": "Almost no signs of wear — used a few times.",
  Good: "Light wear, fully functional, well cared for.",
  Average: "Visible wear but works perfectly.",
  Used: "Heavy wear or cosmetic issues — priced to move.",
};

const emptyForm = {
  title: "", description: "", category: "", brand: "", model: "", originalPrice: "",
  price: "", condition: "Good", negotiable: true, exchangeable: false, location: "", images: [],
};
const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

export default function Sell() {
  const location = useLocation();
  const { user } = useAuth();
  const [tab, setTab] = useState("create");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [manage, setManage] = useState([]);
  const [imageUrl, setImageUrl] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef(null);
  const [pendingImages, setPendingImages] = useState([]);
  const [uploading, setUploading] = useState(false);
const [deleteTarget, setDeleteTarget] = useState(null);
const [deleting, setDeleting] = useState(false);
const [deleteBlocked, setDeleteBlocked] = useState(null);


  useEffect(() => {
    api.get("/products/categories").then(({ data }) => setCategories(data.categories || []));
  }, []);

  useEffect(() => {
    const p = location.state?.editProduct;
    if (!p) return;
    setTab("create");
    setForm({
      title: p.title, description: p.description || "", category: p.category, brand: p.brand || "", model: p.model || "",
      originalPrice: p.originalPrice || "", price: p.price, condition: p.condition, negotiable: p.negotiable,
      exchangeable: p.exchangeable, location: p.location || "", images: (p.images || []).filter(Boolean),
    });
    setEditingId(p._id);
    window.history.replaceState({}, "");
  }, [location.state]);

  const loadManage = async () => {
    setManageLoading(true);
    try {
      const { data } = await api.get("/products/my");
      setManage(data.products || []);
    } catch {}
    setManageLoading(false);
  };

  useEffect(() => {
    if (tab === "manage") loadManage();
  }, [tab]);

  const addImage = () => {
    const value = imageUrl.trim();
    if (!value) return;
    if (form.images.length >= MAX_IMAGES) return toast.error(`You can add up to ${MAX_IMAGES} photos`);
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return toast.error("Enter a valid image URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return toast.error("Image URL must use http or https");
    setForm((f) => ({ ...f, images: [...f.images, value] }));
    setImageUrl("");
  };

  const releasePending = () => {
    setPendingImages((p) => {
      p.forEach((en) => URL.revokeObjectURL(en.blobUrl));
      return [];
    });
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_FILE_SIZE);
    if (!imageFiles.length) return toast.error("Choose JPG, PNG, or WebP images up to 8 MB");
    const used = form.images.length + pendingImages.length;
    const room = Math.max(0, MAX_IMAGES - used);
    if (room === 0) return toast.error(`You can add up to ${MAX_IMAGES} photos`);
    const accepted = imageFiles.slice(0, room);
    if (files.length !== imageFiles.length)
      toast.error("Some files were skipped; use JPG, PNG, or WebP images up to 8 MB");
    if (imageFiles.length > room) toast.error(`Up to ${MAX_IMAGES} photos — skipped ${imageFiles.length - room}`);
    if (!accepted.length) return;
    const entries = accepted.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      blobUrl: URL.createObjectURL(file),
    }));
    setPendingImages((p) => [...p, ...entries]);
    setUploading(true);
    const fd = new FormData();
    entries.forEach((en) => fd.append("images", en.file));
    try {
      const { data } = await api.post("/uploads", fd);
      const urls = (data.urls || []).filter(Boolean);
      if (!urls.length) throw new Error(data.message || "Upload returned no URLs");
      setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
      entries.forEach((en) => URL.revokeObjectURL(en.blobUrl));
      setPendingImages((p) => p.filter((en) => !entries.includes(en)));
      toast.success(`${urls.length} photo${urls.length === 1 ? "" : "s"} uploaded`);
    } catch (err) {
      entries.forEach((en) => URL.revokeObjectURL(en.blobUrl));
      setPendingImages((p) => p.filter((en) => !entries.includes(en)));
      toast.error(err.response?.data?.message || "Image upload failed — please try again");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePendingImage = (key) => {
    setPendingImages((p) => {
      const target = p.find((x) => x.key === key);
      if (target) URL.revokeObjectURL(target.blobUrl);
      return p.filter((x) => x.key !== key);
    });
  };

  const removeImage = (src) => setForm((f) => ({ ...f, images: f.images.filter((x) => x !== src) }));

  const startEdit = (p) => {
    setTab("create");
    setEditingId(p._id);
    releasePending();
    setUploading(false);
    setForm({
      title: p.title, description: p.description || "", category: p.category, brand: p.brand || "", model: p.model || "",
      originalPrice: p.originalPrice || "", price: p.price, condition: p.condition, negotiable: p.negotiable,
      exchangeable: p.exchangeable, location: p.location || "", images: (p.images || []).filter(Boolean),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    releasePending();
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    const price = Number(form.price);
    const originalPrice = form.originalPrice === "" ? Math.round(price * 1.3) : Number(form.originalPrice);
    if (!user) return toast.error("Please log in before listing an item");
    if (!title || !description || !form.category)
      return toast.error("Title, description, and category are required");
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid selling price");
    if (!Number.isFinite(originalPrice) || originalPrice <= 0) return toast.error("Enter a valid original price");
    if (originalPrice < price) return toast.error("Original price cannot be lower than the selling price");
    if (uploading || pendingImages.length > 0) return toast.error("Wait for photos to finish uploading");
    setLoading(true);
    try {
      const payload = {
        ...form,
        title,
        description,
        originalPrice,
        price,
        location: form.location.trim() || user.location || "",
      };
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        toast.success("Listing updated!");
      } else {
        await api.post("/products", payload);
        toast.success("Product listed!");
        setTimeout(() => window.scrollTo({ top: 0 }), 0);
      }
      setTab("manage");
      cancelEdit();
      loadManage();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save listing");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (p) => {
    const next = p.status === "available" ? "sold" : "available";
    try {
      await api.put(`/products/${p._id}`, { status: next });
      toast.success(next === "sold" ? "Marked as sold" : "Back on the market");
      loadManage();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${deleteTarget._id}`);
      setManage((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      toast.success("Listing deleted");
      setDeleteTarget(null);
    } catch (err) {
      const code = err.response?.status;
      /* 409 is the interesting one: the server refuses because the listing has
         history. Show the actual blockers rather than "try again", because
         retrying will never succeed and the seller's next step is different. */
      const blockers = err.response?.data?.blockers;
      if (code === 401) toast.error("Please log in again.");
      else if (code === 403) toast.error("You can only delete your own listings.");
      else if (code === 404) toast.error("This listing no longer exists.");
      else if (code === 409 && blockers?.length) {
        const summary = blockers.map((b) => `${b.count} ${b.label}${b.count === 1 ? "" : "s"}`).join(", ");
        setDeleteBlocked({ summary, hint: err.response?.data?.hint });
        toast.error("This listing has history attached");
      } else if (code === 409) toast.error(err.response?.data?.message || "This listing cannot be deleted yet.");
      else toast.error("Unable to delete the listing right now. Please try again.");
    }
    setDeleting(false);
  };

  const original = Number(form.originalPrice) || 0;
  const ask = Number(form.price) || 0;
  const savings = Math.max(0, original - ask);
  const savingsPct = original > 0 ? Math.round((savings / original) * 100) : 0;

  return (
    <div className="animate-fade-in">
      {/* ================= MASTHEAD ================= */}
      <header className="page-masthead">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <span className="icon-tile-primary">
              <Sparkles size={22} />
            </span>
            <div className="flex-1">
              <h1 className="page-title">Seller studio</h1>
              <p className="page-sub max-w-2xl">
                Honest listings sell faster. Clear photos and an accurate condition note reliably
                bring in more — and better — offers.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => {
                  setTab("create");
                  if (editingId) cancelEdit();
                }}
                className={`btn ${tab === "create" ? "btn-primary" : "btn-secondary"}`}
              >
                <Plus size={15} /> {editingId ? "Editing listing" : "List an item"}
              </button>
              <button
                onClick={() => setTab("manage")}
                className={`btn ${tab === "manage" ? "btn-primary" : "btn-secondary"}`}
              >
                <LayoutGrid size={15} /> Manage listings
                {manage.length > 0 && <span className="badge-neutral">{manage.length}</span>}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* ================= CREATE / EDIT ================= */}
        {tab === "create" && (
          <form onSubmit={handleSubmit} className="grid lg:grid-cols-12 gap-6">
            {editingId && (
              <div className="lg:col-span-12 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-primary-soft px-4 py-3">
                <span className="text-sm font-bold text-primary">Editing an existing listing</span>
                <button type="button" onClick={cancelEdit} className="text-xs font-bold text-primary hover:underline">
                  Discard & start fresh
                </button>
              </div>
            )}

            {/* ---------- photos ---------- */}
            <section className="lg:col-span-7 panel">
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">Photos</h2>
                  <p className="panel-sub">Up to {MAX_IMAGES} images · JPG, PNG or WebP · 8 MB each</p>
                </div>
                <span className="badge-neutral">{form.images.length + pendingImages.length}/{MAX_IMAGES}</span>
              </div>
              <div className="panel-body space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: MAX_IMAGES }).map((_, i) => {
                    const urlImg = form.images[i];
                    const pendingImg = urlImg === undefined ? pendingImages[i - form.images.length] : null;
                    if (urlImg) {
                      return (
                        <div key={`u-${i}`} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-line group">
                          <img src={urlImg} alt="" className="w-full h-full object-cover" />
                          {i === 0 && (
                            <span className="absolute left-2 top-2 badge bg-ink-900/70 text-white backdrop-blur">Cover</span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeImage(urlImg)}
                            className="btn-icon absolute top-2 right-2 bg-ink-950/70 text-white backdrop-blur hover:bg-danger opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove photo"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    }
                    if (pendingImg) {
                      return (
                        <div key={pendingImg.key} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-line">
                          <img src={pendingImg.blobUrl} alt="" className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 size={22} className="text-primary animate-spin" />
                          </div>
                          <button
                            type="button"
                            onClick={() => removePendingImage(pendingImg.key)}
                            className="btn-icon absolute top-2 right-2 bg-ink-950/70 text-white backdrop-blur hover:bg-danger"
                            aria-label="Remove photo"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button
                        type="button"
                        key={`empty-${i}`}
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-[4/3] rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center gap-1.5 bg-raised hover:border-primary hover:bg-primary-soft transition-colors"
                      >
                        {uploading ? (
                          <Loader2 size={20} className="text-primary animate-spin" />
                        ) : (
                          <ImagePlus size={20} className="text-muted-soft" />
                        )}
                        <span className="text-2xs font-bold text-muted">{i === 0 ? "Main photo" : "Add photo"}</span>
                      </button>
                    );
                  })}
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary">
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                    {uploading ? "Uploading…" : "Upload photos"}
                  </button>
                  <span className="text-2xs text-muted-soft font-bold uppercase tracking-[0.1em]">or</span>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addImage())}
                    className="input-field flex-1 min-w-[180px]"
                    placeholder="Paste an image URL"
                  />
                  <button type="button" onClick={addImage} className="btn-secondary shrink-0">
                    <Link2 size={15} /> Add
                  </button>
                </div>
              </div>
            </section>

            {/* ---------- details ---------- */}
            <section className="lg:col-span-5 space-y-6">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h2 className="panel-title">The basics</h2>
                    <p className="panel-sub">What is it, and what condition is it in?</p>
                  </div>
                </div>
                <div className="panel-body space-y-4">
                  <div>
                    <label className="input-label">Title *</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="input-field"
                      placeholder="e.g. iPhone 13 128GB — 9/10 condition"
                      required
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="input-label">Description *</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="textarea-field"
                      rows={4}
                      placeholder="Condition details, accessories, why you're selling…"
                      required
                    />
                  </div>
                  <div>
                    <label className="input-label">Category *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="select-field"
                      required
                    >
                      <option value="">Select category</option>
                      {categories.map((c) => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Condition</label>
                    <div className="flex flex-wrap gap-2">
                      {conditions.map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setForm({ ...form, condition: c })}
                          className={`chip ${form.condition === c ? "chip-active" : "chip-idle"}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <p className="input-hint">{conditionTips[form.condition]}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">Brand</label>
                      <input
                        value={form.brand}
                        onChange={(e) => setForm({ ...form, brand: e.target.value })}
                        className="input-field"
                        placeholder="Apple, Samsung…"
                      />
                    </div>
                    <div>
                      <label className="input-label">Model</label>
                      <input
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        className="input-field"
                        placeholder="Model / variant"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h2 className="panel-title flex items-center gap-2">
                      <Tag size={16} className="text-primary" /> Price & terms
                    </h2>
                    <p className="panel-sub">Pricing relative to original retail is your strongest hook.</p>
                  </div>
                </div>
                <div className="panel-body space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">Original price (₹)</label>
                      <input
                        type="number"
                        value={form.originalPrice}
                        onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
                        className="input-field"
                        placeholder="What you paid"
                      />
                    </div>
                    <div>
                      <label className="input-label">Selling price (₹) *</label>
                      <input
                        type="number"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        className="input-field"
                        placeholder="Your price"
                        required
                      />
                    </div>
                  </div>

                  {savings > 0 && (
                    <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3">
                      <TrendingDown size={16} className="text-success flex-none" />
                      <p className="text-xs text-ink-800">
                        Shoppers see{" "}
                        <span className="font-extrabold text-success tabular">-{savingsPct}%</span> —{" "}
                        <span className="text-muted">
                          {formatINR(original)} → {formatINR(ask)}, saving {formatINR(savings)}.
                        </span>
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="input-label">Location</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
                      <input
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        className="input-field pl-10"
                        placeholder="City / locality"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={form.negotiable}
                        onChange={(e) => setForm({ ...form, negotiable: e.target.checked })}
                      />
                      <span>Open to offers</span>
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={form.exchangeable}
                        onChange={(e) => setForm({ ...form, exchangeable: e.target.checked })}
                      />
                      <span>Accept exchange</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- submit bar ---------- */}
            <div className="lg:col-span-12 flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-line bg-surface p-5">
              <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center flex-none">
                <CheckCircle2 size={17} />
              </span>
              <p className="text-xs text-muted leading-relaxed flex-1">
                Listing is free and stays live until sold. Buyers can compare, negotiate and chat before
                committing — you keep control of the final price.
              </p>
              <button type="submit" disabled={loading || uploading} className="btn-primary btn-lg sm:w-auto w-full">
                {loading || uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Working…
                  </>
                ) : (
                  <>
                    {editingId ? "Save changes" : "Publish listing"} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ================= MANAGE ================= */}
        {tab === "manage" && (
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="section-title">Your listings</h2>
                <p className="section-sub">Edit, mark sold or remove anything you've posted.</p>
              </div>
              <button onClick={() => setTab("create")} className="btn-primary">
                <Plus size={15} /> List an item
              </button>
            </div>

            {manageLoading ? (
              <div className="space-y-3">
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl border border-line bg-surface animate-pulse" />
                ))}
              </div>
            ) : manage.length === 0 ? (
              <div className="panel p-12 text-center">
                <span className="icon-tile-primary mx-auto mb-4">
                  <LayoutGrid size={22} />
                </span>
                <h3 className="font-extrabold text-ink-900">No listings yet</h3>
                <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
                  List your first item and manage it right here — edit, mark sold or remove.
                </p>
                <button onClick={() => setTab("create")} className="btn-primary mt-5">
                  <Plus size={15} /> List an item
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {manage.map((p) => (
                  <article key={p._id} className="card-interactive p-4 flex flex-col gap-3">
                    <div className="flex gap-4">
                      <Link
                        to={`/products/${p._id}`}
                        className="w-20 h-20 rounded-xl overflow-hidden bg-sunken flex-none"
                      >
                        <img alt={p.title} {...imageProps(p)} className="w-full h-full object-cover" />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/products/${p._id}`}
                          className="font-bold text-sm text-ink-900 hover:text-primary line-clamp-1"
                        >
                          {p.title}
                        </Link>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-2xs text-muted mt-1.5">
                          <span className="text-sm font-extrabold text-primary tabular">{formatINR(p.price)}</span>
                          {p.originalPrice > p.price && (
                            <span className="text-muted-soft line-through tabular">{formatINR(p.originalPrice)}</span>
                          )}
                          <span className="inline-flex items-center gap-1"><Eye size={11} /> {p.views ?? 0}</span>
                          <span className="inline-flex items-center gap-1"><Heart size={11} /> {p.wishlistCount ?? 0}</span>
                          <span className="inline-flex items-center gap-1"><Scale size={11} /> {p.compareCount ?? 0}</span>
                        </div>
                        <p className="text-2xs text-muted-soft mt-1">{timeAgo(p.createdAt)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-line">
                      <span className={`badge border ${listingTone(p.status)}`}>
                        {listingLabel(p.status)}
                      </span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button onClick={() => startEdit(p)} className="btn-ghost btn-sm">
                          <Pencil size={12} /> Edit
                        </button>
                        {/* A moderated listing can still be corrected, but the seller
                            cannot flip it back to live or mark it sold - only a
                            moderator can. Offering the button and failing server-side
                            reads as a bug, so it is replaced with the reason. */}
                        {isModerated(p.status) ? (
                          <span className="text-2xs text-muted-soft">Awaiting moderator review</span>
                        ) : (
                          p.status !== "removed" &&
                          (p.status === "sold" ? (
                            <button onClick={() => toggleStatus(p)} className="btn-secondary btn-sm">
                              <PackageCheck size={13} /> Relist
                            </button>
                          ) : (
                            <button onClick={() => toggleStatus(p)} className="btn-secondary btn-sm">
                              <PackageX size={13} /> Mark sold
                            </button>
                          ))
                        )}
                        <button
                          onClick={() => {
                            setDeleteBlocked(null);
                            setDeleteTarget(p);
                          }}
                          className="btn-ghost btn-sm text-danger hover:bg-danger-soft"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {isModerated(p.status) && (
                      <div
                        className={`alert ${p.status === "hidden" ? "alert-warning" : "alert-danger"} mt-3 !py-2.5`}
                      >
                        <ShieldAlert size={15} className="flex-none mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold leading-relaxed">
                            {listingStatusSentence(p)}
                            {p.moderationReason ? ` Reason: ${reasonLabel(p.moderationReason)}.` : ""}
                          </p>
                          {p.moderationNote && (
                            <p className="text-2xs leading-relaxed opacity-90">
                              Note from the moderation team: {p.moderationNote}
                            </p>
                          )}
                          <p className="text-2xs leading-relaxed opacity-90">
                            You can edit the details above, then a moderator can restore it to live once it
                            meets the listing policy.
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="flex items-start gap-3 rounded-2xl border border-line bg-raised p-4">
              <Info size={15} className="text-muted flex-none mt-0.5" />
              <p className="text-2xs text-muted leading-relaxed">
                Marking a listing as sold keeps it visible as a reference for your rating history. Deleting
                removes it permanently and cannot be undone.
              </p>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteBlocked(null);
        }}
        title="Delete this listing?"
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-danger-soft text-danger flex items-center justify-center flex-none">
            <Trash size={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">{deleteTarget?.title}</p>
            <p className="text-sm text-muted mt-1">
              This product will be removed from your marketplace listings. This action cannot be undone.
            </p>
          </div>
        </div>

        {deleteBlocked && (
          <div className="alert alert-warning mt-4">
            <Info size={15} className="flex-none mt-0.5" />
            <div>
              <p className="text-xs font-bold leading-relaxed">
                This listing already has {deleteBlocked.summary}, so it cannot be removed.
              </p>
              {deleteBlocked.hint && (
                <p className="text-2xs leading-relaxed opacity-90 mt-1">{deleteBlocked.hint}</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDeleteTarget(null);
              setDeleteBlocked(null);
            }}
            disabled={deleting}
            className="btn-secondary flex-1"
          >
            {deleteBlocked ? "Close" : "Cancel"}
          </button>
          <button type="button" onClick={performDelete} disabled={deleting || !!deleteBlocked} className="btn-danger flex-1">
            {deleting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Deleting…
              </>
            ) : (
              "Delete listing"
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
