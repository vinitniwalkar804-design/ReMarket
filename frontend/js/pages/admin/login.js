import { h } from "../../dom.js";
import { icon } from "../../icons.js";
import auth from "../../store/auth.js";
import toast from "../../toast.js";
import { navigate } from "../../navigation.js";

/**
 * Admin console sign-in.
 *
 * Full-screen dark auth page, exactly like the React build's AdminLogin.jsx:
 * the mesh + dot background, the "ReMarket Cloud" wordmark and the white
 * console card with the demo credentials footnote.
 *
 * The form inputs are uncontrolled, matching the Login pattern: React's
 * controlled value/onChange only existed so the submit button could disable
 * itself, and the only re-render that happened on this page was the button
 * swapping between the spinner and the "Sign in to console" label.
 *
 * Quirks reproduced verbatim:
 *   - admin credentials are rejected *after* login succeeds: `auth.login` has
 *     already stored the session, so a non-admin who lands here is signed out
 *     again before being sent to /login.
 *   - success goes straight to /admin, where the AdminLayout and dashboard
 *     render.
 */

export default function AdminLogin() {
  const state = { loading: false };

  const emailInput = h("input", {
    type: "email",
    className: "input-field pl-10",
    placeholder: "admin@marketplace.com",
    required: true,
  });
  const passwordInput = h("input", {
    type: "password",
    className: "input-field pl-10",
    placeholder: "••••••••",
    required: true,
  });

  const submitLabel = h("span", null, "Sign in to console");
  const submitIcon = icon("ArrowRight", { size: 16 });
  const spinner = icon("Loader2", { size: 16, className: "animate-spin" });
  const submitBtn = h(
    "button",
    { type: "submit", className: "btn-primary w-full btn-lg", disabled: state.loading },
    submitLabel,
    submitIcon
  );

  const paintButton = () => {
    submitBtn.disabled = state.loading;
    if (state.loading) {
      submitLabel.textContent = "Verifying…";
      if (!submitBtn.contains(spinner)) submitBtn.prepend(spinner);
      submitIcon.classList.add("hidden");
    } else {
      submitLabel.textContent = "Sign in to console";
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
      if (data.user.role !== "admin") {
        await auth.logout();
        toast.error("Admin access required");
        navigate("/login");
        return;
      }
      toast.success("Welcome back, Admin!");
      navigate("/admin");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Login failed");
    }
    state.loading = false;
    paintButton();
  };

  const form = h(
    "form",
    { onSubmit: handleSubmit, className: "bg-white rounded-3xl p-7 space-y-4 shadow-pop border border-white/10" },
    h(
      "div",
      null,
      h("label", { className: "input-label" }, "Admin email"),
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
    submitBtn,
    h(
      "p",
      { className: "text-2xs text-muted-soft text-center font-mono pt-1 border-t border-line" },
      "Demo access: admin@marketplace.com · admin123"
    )
  );

  return h(
    "div",
    { className: "min-h-screen flex items-center justify-center bg-ink-950 px-4 relative overflow-hidden" },
    h("div", { className: "absolute inset-0 mesh-primary opacity-90" }),
    h("div", { className: "absolute inset-0 bg-dots opacity-20" }),
    h("div", { className: "absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl" }),
    h("div", { className: "absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" }),

    h(
      "div",
      { className: "w-full max-w-md animate-fade-in relative" },
      h(
        "div",
        { className: "text-center mb-8" },
        h(
          "span",
          {
            className:
              "w-14 h-14 rounded-2xl bg-white/12 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-4 shadow-pop",
          },
          icon("ShieldCheck", { size: 24, className: "text-white" })
        ),
        h(
          "div",
          { className: "inline-flex items-center gap-2 font-extrabold text-2xl text-white tracking-tight" },
          "ReMarket ",
          h("span", { className: "text-brand-300" }, "Cloud")
        ),
        h(
          "p",
          { className: "text-white/50 text-sm mt-1.5 flex items-center justify-center gap-1.5" },
          icon("Brain", { size: 13 }),
          " Customer segmentation & analytics console"
        )
      ),
      form
    )
  );
}