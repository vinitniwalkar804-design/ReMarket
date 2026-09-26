import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Mail, Lock, ArrowRight, Loader2, ShieldCheck, Recycle, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

const HIGHLIGHTS = [
  { icon: Recycle, title: "Circular campus economy", desc: "Keep last-semester gear in circulation instead of landfill." },
  { icon: ShieldCheck, title: "Verified sellers", desc: "Identity checks, public ratings and tracked orders." },
  { icon: Sparkles, title: "Personalised feed", desc: "Recommendations that learn from what you actually compare." },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate(data.user.role === "admin" ? "/admin" : "/");
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ============ BRAND PANEL ============ */}
      <aside className="hidden lg:flex relative overflow-hidden mesh-primary text-white flex-col justify-between p-12">
        <div className="absolute inset-0 bg-dots opacity-30" />
        <div className="absolute -left-20 -bottom-24 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -right-16 top-10 w-72 h-72 rounded-full bg-accent/25 blur-3xl" />

        <Link to="/" className="relative inline-flex items-center gap-3 text-white">
          <span className="w-11 h-11 rounded-xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center text-lg font-extrabold">
            R
          </span>
          <span className="text-xl font-extrabold tracking-tight">ReMarket</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-balance">
            The campus marketplace built on trust, not transactions.
          </h2>
          <p className="text-white/65 mt-4 leading-relaxed">
            Buy and sell second-hand goods with verified sellers, transparent condition notes and a
            negotiation flow that actually works.
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

      {/* ============ FORM PANEL ============ */}
      <main className="flex items-center justify-center bg-canvas px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8 lg:text-left">
            <Link to="/" className="inline-flex items-center gap-2.5 font-extrabold text-xl text-ink-900 mb-2 lg:hidden">
              <span className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center text-sm">
                R
              </span>
              ReMarket
            </Link>
            <h1 className="page-title text-2xl lg:text-3xl">Welcome back</h1>
            <p className="page-sub">Sign in to your marketplace account</p>
          </div>

          <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
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
                  placeholder="••••••"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={16} />
                </>
              )}
            </button>

            <p className="text-center text-sm text-muted">
              No account?{" "}
              <Link to="/register" className="text-primary font-bold hover:underline">
                Create one
              </Link>
            </p>

            <div className="border-t border-line pt-4">
              <p className="text-2xs text-muted-soft text-center font-mono">
                Demo: aarav@test.com / pass123
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
