import { h } from "../dom.js";
import { icon } from "../icons.js";
import auth from "../store/auth.js";
import toast from "../toast.js";
import { navigate } from "../navigation.js";

const HIGHLIGHTS = [
  {
    icon: "Recycle",
    title: "Circular campus economy",
    desc: "Keep last-semester gear in circulation instead of landfill.",
  },
  {
    icon: "ShieldCheck",
    title: "Verified sellers",
    desc: "Identity checks, public ratings and tracked orders.",
  },
  {
    icon: "Sparkles",
    title: "Personalised feed",
    desc: "Recommendations that learn from what you actually compare.",
  },
];

/**
 * Sign in.
 *
 * The form's inputs are uncontrolled, which is what the React build's controlled
 * `value`/`onChange` pair amounted to: the value only changes because the
 * customer typed it, and nothing else on this page re-renders while they do. The
 * only state React needed here was `loading`, so only the submit button is
 * repainted.
 */
export default function Login() {
  const state = { loading: false };

  const emailInput = h("input", {
    type: "email",
    className: "input-field pl-10",
    placeholder: "you@email.com",
    required: true,
  });
  const passwordInput = h("input", {
    type: "password",
    className: "input-field pl-10",
    placeholder: "••••••",
    required: true,
  });

  const submitLabel = h("span", null, "Sign in");
  const submitIcon = icon("ArrowRight", { size: 16 });
  const spinner = icon("Loader2", { size: 16, className: "animate-spin" });
  const submitBtn = h(
    "button",
    { type: "submit", className: "btn-primary w-full" },
    submitLabel,
    submitIcon
  );

  const paintButton = () => {
    submitBtn.disabled = state.loading;
    if (state.loading) {
      submitLabel.textContent = "Signing in…";
      if (!submitBtn.contains(spinner)) submitBtn.prepend(spinner);
      submitIcon.classList.add("hidden");
    } else {
      submitLabel.textContent = "Sign in";
      if (submitBtn.contains(spinner)) spinner.remove();
      submitIcon.classList.remove("hidden");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (state.loading) return;
    state.loading = true;
    paintButton();
    try {
      const data = await auth.login(emailInput.value, passwordInput.value);
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate(data.user.role === "admin" ? "/admin" : "/");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Login failed");
    }
    state.loading = false;
    paintButton();
  };

  const form = h(
    "form",
    { onSubmit: handleSubmit, className: "panel p-6 space-y-4" },
    h(
      "div",
      null,
      h("label", { className: "input-label" }, "Email"),
      h(
        "div",
        { className: "relative" },
        h("span", {
          className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft",
        }, icon("Mail", { size: 16 })),
        emailInput
      )
    ),
    h(
      "div",
      null,
      h("label", { className: "input-label" }, "Password"),
      h(
        "div",
        { className: "relative" },
        h("span", {
          className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft",
        }, icon("Lock", { size: 16 })),
        passwordInput
      )
    ),
    submitBtn,
    h(
      "p",
      { className: "text-center text-sm text-muted" },
      "No account? ",
      h("a", { href: "/register", className: "text-primary font-bold hover:underline" }, "Create one")
    ),
    h(
      "div",
      { className: "border-t border-line pt-4" },
      h(
        "p",
        { className: "text-2xs text-muted-soft text-center font-mono" },
        "Demo: aarav@test.com / pass123"
      )
    )
  );

  return h(
    "div",
    { className: "min-h-screen grid lg:grid-cols-2" },
    // ============ BRAND PANEL ============
    h(
      "aside",
      {
        className:
          "hidden lg:flex relative overflow-hidden mesh-primary text-white flex-col justify-between p-12",
      },
      h("div", { className: "absolute inset-0 bg-dots opacity-30" }),
      h("div", {
        className: "absolute -left-20 -bottom-24 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl",
      }),
      h("div", {
        className: "absolute -right-16 top-10 w-72 h-72 rounded-full bg-accent/25 blur-3xl",
      }),

      h(
        "a",
        { href: "/", className: "relative inline-flex items-center gap-3 text-white" },
        h(
          "span",
          {
            className:
              "w-11 h-11 rounded-xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center text-lg font-extrabold",
          },
          "R"
        ),
        h("span", { className: "text-xl font-extrabold tracking-tight" }, "ReMarket")
      ),

      h(
        "div",
        { className: "relative max-w-md" },
        h(
          "h2",
          { className: "text-3xl font-extrabold leading-tight tracking-tight text-balance" },
          "The campus marketplace built on trust, not transactions."
        ),
        h(
          "p",
          { className: "text-white/65 mt-4 leading-relaxed" },
          "Buy and sell second-hand goods with verified sellers, transparent condition notes and a negotiation flow that actually works."
        ),
        h(
          "ul",
          { className: "mt-9 space-y-4" },
          HIGHLIGHTS.map(({ icon: name, title, desc }) =>
            h(
              "li",
              { className: "flex gap-3" },
              h(
                "span",
                {
                  className:
                    "w-9 h-9 rounded-xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center flex-none",
                },
                icon(name, { size: 16 })
              ),
              h(
                "div",
                null,
                h("p", { className: "font-bold text-sm" }, title),
                h("p", { className: "text-xs text-white/55 mt-0.5 leading-relaxed" }, desc)
              )
            )
          )
        )
      ),

      h(
        "p",
        { className: "relative text-2xs text-white/40" },
        "Meridian 2026 design system · Iris Violet + Cyan Signal"
      )
    ),

    // ============ FORM PANEL ============
    h(
      "main",
      { className: "flex items-center justify-center bg-canvas px-4 py-12" },
      h(
        "div",
        { className: "w-full max-w-md animate-fade-in" },
        h(
          "div",
          { className: "text-center mb-8 lg:text-left" },
          h(
            "a",
            {
              href: "/",
              className:
                "inline-flex items-center gap-2.5 font-extrabold text-xl text-ink-900 mb-2 lg:hidden",
            },
            h(
              "span",
              {
                className:
                  "w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center text-sm",
              },
              "R"
            ),
            "ReMarket"
          ),
          h("h1", { className: "page-title text-2xl lg:text-3xl" }, "Welcome back"),
          h("p", { className: "page-sub" }, "Sign in to your marketplace account")
        ),
        form
      )
    )
  );
}
