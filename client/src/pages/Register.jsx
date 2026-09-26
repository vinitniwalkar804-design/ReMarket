import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { User, Mail, Lock, MapPin, ArrowRight, Loader2, Recycle, ShieldCheck, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

const friendlyError = (err) => {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const isJsonMessage = data && typeof data === "object" && typeof data.message === "string";
  const raw = isJsonMessage ? data.message : "";

  if (!err?.response) return "Cannot reach the server. Check that the backend is running and try again.";
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";

  const lower = raw.toLowerCase();
  if (status === 409 || lower.includes("already registered") || lower.includes("already exists")) {
    return "An account with this email already exists.";
  }
  if (status === 400) {
    if (lower.includes("valid email")) return "Please enter a valid email address.";
    if (lower.includes("password")) return "Password must be at least 6 characters.";
    return raw || "Please review your details and try again.";
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status >= 500) {
    if (isJsonMessage) return raw;
    return "Cannot reach the backend server (it returned no JSON error). Make sure the backend is running and try again.";
  }
  return raw || "Please try again.";
};

const HIGHLIGHTS = [
  { icon: Recycle, title: "Sell in minutes", desc: "Photos, condition notes and a price — that's the whole form." },
  { icon: ShieldCheck, title: "Build a reputation", desc: "Every completed order adds to your public seller rating." },
  { icon: Sparkles, title: "Smart matching", desc: "Buyers see your listings in feeds tuned to their searches." },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", location: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await register(form.name, form.email, form.password, form.location);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate("/");
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ============ FORM PANEL ============ */}
      <main className="flex items-center justify-center bg-canvas px-4 py-12 order-2 lg:order-1">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8 lg:text-left">
            <Link to="/" className="inline-flex items-center gap-2.5 font-extrabold text-xl text-ink-900 mb-2 lg:hidden">
              <span className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center text-sm">
                R
              </span>
              ReMarket
            </Link>
            <h1 className="page-title text-2xl lg:text-3xl">Create your account</h1>
            <p className="page-sub">Join the campus marketplace in under a minute.</p>
          </div>

          <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
            <div>
              <label className="input-label">Full name</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field pl-10"
                  placeholder="Your name"
                  required
                />
              </div>
            </div>
            <div>
              <label className="input-label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field pl-10"
                  placeholder="you@email.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="input-label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field pl-10"
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div>
              <label className="input-label">Location (optional)</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="input-field pl-10"
                  placeholder="City"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Creating account…
                </>
              ) : (
                <>
                  Create account <ArrowRight size={16} />
                </>
              )}
            </button>

            <p className="text-center text-sm text-muted">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-bold hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </main>

      {/* ============ BRAND PANEL ============ */}
      <aside className="hidden lg:flex relative overflow-hidden mesh-primary text-white flex-col justify-between p-12 order-1 lg:order-2">
        <div className="absolute inset-0 bg-dots opacity-30" />
        <div className="absolute -right-20 -top-24 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -left-16 bottom-10 w-72 h-72 rounded-full bg-accent/25 blur-3xl" />

        <Link to="/" className="relative inline-flex items-center gap-3 text-white">
          <span className="w-11 h-11 rounded-xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center text-lg font-extrabold">
            R
          </span>
          <span className="text-xl font-extrabold tracking-tight">ReMarket</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-balance">
            Turn the things you no longer need into someone else's next semester.
          </h2>
          <p className="text-white/65 mt-4 leading-relaxed">
            One account for buying, selling, offers and negotiation — with the trust signals buyers
            actually care about.
          </p>

          <ul className="mt-9 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="w-9 h-9 rounded-xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center flex-none">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="font-bold text-sm">{title}</p>
                  <p className="text-xs text-white/55 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-2xs text-white/40">
          Meridian 2026 design system · Iris Violet + Cyan Signal
        </p>
      </aside>
    </div>
  );
}
