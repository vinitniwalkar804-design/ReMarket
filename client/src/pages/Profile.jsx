import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  User, LogOut, MapPin, Phone, Store, ShieldCheck, Save, Trash2, Pencil, Loader2, LayoutGrid, Plus,
} from "lucide-react";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import toast from "react-hot-toast";
import { formatINR, formatDate, conditionTone } from "../utils/format.js";
import { orderTone } from "../utils/theme.js";
import { imageProps } from "../utils/images.js";
import Modal from "../components/Modal.jsx";

const LISTING_TONE = {
  available: "badge-success",
  sold: "badge-neutral",
  reserved: "badge-warning",
  removed: "badge-danger",
};

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", location: "", phone: "", bio: "" });
  const [stats, setStats] = useState({ productsSold: 0, activeListings: 0 });
  const [loading, setLoading] = useState(false);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        location: user.location || "",
        phone: user.phone || "",
        bio: user.bio || "",
      });
      api
        .get("/users/profile")
        .then(({ data }) => setStats(data.stats || { productsSold: 0, activeListings: 0 }))
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setListingsLoading(true);
    api
      .get("/products/my")
      .then(({ data }) => setListings(data.products || []))
      .catch(() => {})
      .finally(() => setListingsLoading(false));
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.put("/users/profile", form);
      setUser(data.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed");
    }
    setLoading(false);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${deleteTarget._id}`);
      setListings((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      toast.success("Listing deleted");
      setDeleteTarget(null);
    } catch (err) {
      const code = err.response?.status;
      if (code === 401) toast.error("Please log in again.");
      else if (code === 403) toast.error("You can only delete your own listings.");
      else if (code === 404) toast.error("This listing no longer exists.");
      else toast.error("Unable to delete the listing right now. Please try again.");
    }
    setDeleting(false);
  };

  if (!user) return null;

  return (
    <div className="animate-fade-in">
      <header className="page-masthead">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <p className="page-eyebrow">
            <User size={13} /> Account
          </p>
          <h1 className="page-title">Your profile</h1>
          <p className="page-sub">Manage your public details, listings and account security.</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* ============ IDENTITY ============ */}
        <section className="relative overflow-hidden rounded-3xl mesh-primary text-white p-6 sm:p-8 mb-5">
          <div className="absolute inset-0 bg-dots opacity-30" />
          <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span className="w-16 h-16 rounded-2xl bg-white/12 backdrop-blur border border-white/20 text-2xl font-extrabold flex items-center justify-center flex-none">
              {user.name?.charAt(0)?.toUpperCase() || "U"}
            </span>
            <div className="min-w-0">
              <div className="font-extrabold text-lg truncate text-white">{user.name}</div>
              <div className="text-sm text-white/60 truncate">{user.email}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="badge bg-white/15 border border-white/20 text-white capitalize">{user.role}</span>
                {user.isVerifiedSeller && (
                  <span className="badge bg-white/15 border border-white/20 text-white inline-flex items-center gap-1">
                    <ShieldCheck size={11} /> Verified seller
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="stat-card">
            <div className="text-2xl font-extrabold text-ink-900 tabular">{stats.productsSold}</div>
            <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-1">Products sold</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-extrabold text-ink-900 tabular">{stats.activeListings}</div>
            <div className="text-2xs font-bold uppercase tracking-[0.1em] text-muted mt-1">Active listings</div>
          </div>
        </div>

        {/* ============ LISTINGS ============ */}
        <section className="mb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <LayoutGrid size={18} className="text-primary" /> My Listings
              </h2>
              <p className="section-sub">Edit pricing, condition notes or remove an item entirely.</p>
            </div>
            <Link to="/sell" className="btn-primary btn-sm flex-none">
              <Plus size={13} /> List an item
            </Link>
          </div>

          {listingsLoading ? (
            Array(2).fill(0).map((_, i) => (
              <div key={i} className="h-28 bg-surface border border-line rounded-2xl animate-pulse mb-3" />
            ))
          ) : listings.length === 0 ? (
            <div className="panel py-10 text-center">
              <span className="w-14 h-14 rounded-2xl bg-sunken flex items-center justify-center mx-auto mb-3">
                <LayoutGrid size={26} className="text-muted-soft" />
              </span>
              <h3 className="font-bold text-ink-900">No listings yet</h3>
              <p className="text-sm text-muted mt-1">
                List your first item and it will show up here for editing or deletion.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map((p) => (
                <article key={p._id} className="card p-4 card-hover">
                  <div className="flex items-center gap-4">
                    <Link
                      to={`/products/${p._id}`}
                      className="w-20 h-20 rounded-xl bg-sunken overflow-hidden flex-none"
                    >
                      <img alt={p.title} {...imageProps(p)} className="w-full h-full object-cover" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/products/${p._id}`}
                        className="font-bold text-sm text-ink-900 hover:text-primary line-clamp-1 transition-colors"
                      >
                        {p.title}
                      </Link>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-1">
                        <span className="font-extrabold text-primary text-sm tabular">{formatINR(p.price)}</span>
                        {p.originalPrice > p.price && (
                          <span className="text-muted-soft line-through">{formatINR(p.originalPrice)}</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} /> {p.location || "—"}
                        </span>
                        <span>{formatDate(p.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`badge ${conditionTone(p.condition)}`}>{p.condition}</span>
                        <span className={`badge capitalize ${LISTING_TONE[p.status] || orderTone(p.status)}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3.5 pt-3.5 border-t border-line flex items-center gap-2">
                    <button
                      onClick={() => navigate("/sell", { state: { editProduct: p } })}
                      className="btn-secondary btn-sm"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="btn-danger btn-sm ml-auto">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ============ DETAILS FORM ============ */}
        <form onSubmit={handleSave} className="panel p-6 space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-ink-900">Public details</h2>
            <p className="text-xs text-muted mt-0.5">Buyers see this on your seller profile and listings.</p>
          </div>

          <div>
            <label className="input-label">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="input-label">Location</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="input-field pl-10"
                placeholder="City"
              />
            </div>
          </div>
          <div>
            <label className="input-label">Phone</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field pl-10"
                placeholder="Phone number"
              />
            </div>
          </div>
          <div>
            <label className="input-label">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="input-field"
              rows={2}
              placeholder="A short line buyers see on your seller profile"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save size={16} /> Save changes
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="btn-danger px-5"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </form>

        <Link to="/sell" className="mt-4 flex items-center justify-center gap-2 text-sm text-primary hover:underline font-bold">
          <Store size={14} /> Want to start selling? List an item
        </Link>
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete this listing?">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-danger-soft text-danger flex items-center justify-center flex-none">
            <Trash2 size={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">{deleteTarget?.title}</p>
            <p className="text-sm text-ink-600 mt-1">
              This product will be removed from your marketplace listings. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={performDelete}
            disabled={deleting}
            className="btn-danger flex-1 disabled:opacity-50"
          >
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
