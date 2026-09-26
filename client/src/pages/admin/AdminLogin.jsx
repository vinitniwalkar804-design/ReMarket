import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { Lock, ShieldCheck, ArrowRight, Brain, Loader2, Mail } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminLogin() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      if (data.user.role !== "admin") {
        // login() has already stored this account's token and set it as the
        // current user, so a rejected admin sign-in must tear that session back
        // down - otherwise a customer who used this form stays signed in.
        await logout();
        toast.error("Admin access required");
        navigate("/login");
        return;
      }
      toast.success("Welcome back, Admin!");
      navigate("/admin");
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4 relative overflow-hidden">
      <div className="absolute inset-0 mesh-primary opacity-90" />
      <div className="absolute inset-0 bg-dots opacity-20" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />

      <div className="w-full max-w-md animate-fade-in relative">
        <div className="text-center mb-8">
          <span className="w-14 h-14 rounded-2xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-4 shadow-pop">
            <ShieldCheck size={24} className="text-white" />
          </span>
          <div className="inline-flex items-center gap-2 font-extrabold text-2xl text-white tracking-tight">
            ReMarket <span className="text-brand-300">Cloud</span>
          </div>
          <p className="text-white/50 text-sm mt-1.5 flex items-center justify-center gap-1.5">
            <Brain size={13} /> Customer segmentation &amp; analytics console
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-7 space-y-4 shadow-pop border border-white/10">
          <div>
            <label className="input-label">Admin email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field pl-10"
                placeholder="admin@marketplace.com"
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
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full btn-lg">
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Verifying…
              </>
            ) : (
              <>
                Sign in to console <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="text-2xs text-muted-soft text-center font-mono pt-1 border-t border-line">
            Demo access: admin@marketplace.com · admin123
          </p>
        </form>
      </div>
    </div>
  );
}
