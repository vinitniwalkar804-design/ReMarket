import { h } from "../dom.js";
import { icon } from "../icons.js";
import auth from "../store/auth.js";
import toast from "../toast.js";
import { navigate } from "../navigation.js";

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
  { icon: "Recycle", title: "Sell in minutes", desc: "Photos, condition notes and a price — that's the whole form." },
  { icon: "ShieldCheck", title: "Build a reputation", desc: "Every completed order adds to your public seller rating." },
  { icon: "Sparkles", title: "Smart matching", desc: "Buyers see your listings in feeds tuned to their searches." },
];

/**
 * Create an account.
 *
 * Same shape as Login: uncontrolled inputs (React's controlled value/onChange
 * only fed the disabled submit button), a repainted submit button while the
 * request is in flight, and the same split-screen brand panel in the same DOM
 * order - main (form) first, aside (brand) second, with the order-* utilities
 * doing the visual swap exactly as the React build did.
 *
 * The whole friendlyError() mapping is ported verbatim - every response code
 * and message substring React special-cases is special-cased here too.
 */

export default function Register() {
  const state = { loading: false };

  const nameInput = h("input", {
    type: "text",
    className: "input-field pl-10",
    placeholder: "Your name",
    required: true,
  });
  const emailInput = h("input", {
    type: "email",
    className: "input-field pl-10",
    placeholder: "you@email.com",
    required: true,
  });
  const passwordInput = h("input", {
    type: "password",
    className: "input-field pl-10",
    placeholder: "Minimum 6 characters",
    required: true,
    minLength: 6,
  });
  const locationInput = h("input", {
    type: "text",
    className: "input-field pl-10",
    placeholder: "City",
  });

  const submitLabel = h("span", null, "Create account");
  const submitIcon = icon("ArrowRight", { size: 16 });
  const spinner = icon("Loader2", { size: 16, className: "animate-spin" });
  const submitBtn = h(
    "button",
    { type: "submit", className: "btn-primary w-full", disabled: state.loading },
    submitLabel,
    submitIcon
  );

  const paintButton = () => {
    submitBtn.disabled = state.loading;
    if (state.loading) {
      submitLabel.textContent = "Creating account…";
      if (!submitBtn.contains(spinner)) submitBtn.prepend(spinner);
      submitIcon.classList.add("hidden");
    } else {
      submitLabel.textContent = "Create account";
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
      const data = await auth.register(nameInput.value, emailInput.value, passwordInput.value, locationInput.value);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate("/");
    } catch (err) {
      toast.error(friendlyError(err));
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
      h("label", { className: "input-label" }, "Full name"),
      h(
        "div",
        { className: "relative" },
        h("span", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }, icon("User", { size: 16 })),
        nameInput
      )
    ),
    h(
      "div",
      null,
      h("label", { className: "input-label" }, "Email"),
      h(
        "div",
        { className: "relative" },
        h("span", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }, icon("Mail", { size: 16 })),
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
        h("span", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }, icon("Lock", { size: 16 })),
        passwordInput
      )
    ),
    h(
      "div",
      null,
      h("label", { className: "input-label" }, "Location (optional)"),
      h(
        "div",
        { className: "relative" },
        h("span", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-soft" }, icon("MapPin", { size: 16 })),
        locationInput
      )
    ),
    submitBtn,
    h(
      "p",
      { className: "text-center text-sm text-muted" },
      "Already have an account? ",
      h("a", { href: "/login", className: "text-primary font-bold hover:underline" }, "Sign in")
    )
  );

  return h(
    "div",
    { className: "min-h-screen grid lg:grid-cols-2" },
    // ============ FORM PANEL ============
    h(
      "main",
      { className: "flex items-center justify-center bg-canvas px-4 py-12 order-2 lg:order-1" },
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
          h("h1", { className: "page-title text-2xl lg:text-3xl" }, "Create your account"),
          h("p", { className: "page-sub" }, "Join the campus marketplace in under a minute.")
        ),
        form
      )
    ),

    // ============ BRAND PANEL ============
    h(
      "aside",
      {
        className:
          "hidden lg:flex relative overflow-hidden mesh-primary text-white flex-col justify-between p-12 order-1 lg:order-2",
      },
      h("div", { className: "absolute inset-0 bg-dots opacity-30" }),
      h("div", { className: "absolute -right-20 -top-24 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" }),
      h("div", { className: "absolute -left-16 bottom-10 w-72 h-72 rounded-full bg-accent/25 blur-3xl" }),

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
          "Turn the things you no longer need into someone else's next semester."
        ),
        h(
          "p",
          { className: "text-white/65 mt-4 leading-relaxed" },
          "One account for buying, selling, offers and negotiation — with the trust signals buyers actually care about."
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
    )
  );
}