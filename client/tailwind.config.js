/**
 * MERIDIAN 2026 — ReMarket Design System
 * ------------------------------------------------------------------
 * Single source of truth for the visual language.
 *
 * Palette direction: "Meridian"
 *   Cool graphite neutrals + Iris Violet primary + Cyan signal accent.
 *   Fully replaces the previous warm-cream / forest-green theme.
 *
 * Every colour family below (including the aliased Tailwind defaults such
 * as `red-*`, `green-*`, `gray-*`) is remapped into the new system, so no
 * legacy hex value can leak in from any component.
 */

/** Core ramps ------------------------------------------------------- */
const iris = {
  50: "#F1F0FE",
  100: "#E2E0FD",
  200: "#C7C3FB",
  300: "#A69DF6",
  400: "#8574EE",
  500: "#6753E0",
  600: "#4F3ED0", // primary
  700: "#4031AC",
  800: "#362A89",
  900: "#2E256F",
  950: "#1B1647",
};

const cyan = {
  50: "#E8F8FB",
  100: "#C6EFF6",
  200: "#8ADFEB",
  300: "#4FC8DC",
  400: "#24AAC2",
  500: "#0F8EA9",
  600: "#0B7489",
  700: "#0D5C6D",
  800: "#114D5B",
  900: "#13404C",
  950: "#062830",
};

const gold = {
  50: "#FEF7E6",
  100: "#FCEBC4",
  200: "#F8D98C",
  300: "#F2C154",
  400: "#E5A728",
  500: "#C88A13",
  600: "#A46B11",
  700: "#824F14",
  800: "#6B4117",
  900: "#5A3718",
  950: "#331D08",
};

const emerald = {
  50: "#E8F7F1",
  100: "#C6EDDD",
  200: "#8EDCBE",
  300: "#4FC59C",
  400: "#1FAA7E",
  500: "#0E9169",
  600: "#0A7A59", // success
  700: "#0A634B",
  800: "#0C4F3D",
  900: "#0D4134",
  950: "#03261E",
};

const amber = {
  50: "#FEF6E7",
  100: "#FDE9C2",
  200: "#FBD287",
  300: "#F7B749",
  400: "#EE9E1B",
  500: "#D2820C", // warning
  600: "#B2670C",
  700: "#8F4F10",
  800: "#774114",
  900: "#653817",
  950: "#3A1E06",
};

const rose = {
  50: "#FEECEF",
  100: "#FCD8DE",
  200: "#F9B2BF",
  300: "#F48095",
  400: "#EC516D",
  500: "#D92E4D",
  600: "#C51B3D", // danger
  700: "#A71333",
  800: "#8B1430",
  900: "#75162E",
  950: "#440714",
};

const sky = {
  50: "#EBF3FE",
  100: "#D2E5FD",
  200: "#A8CDFB",
  300: "#74ACF7",
  400: "#4088F1",
  500: "#2567DF", // info
  600: "#1A51C3",
  700: "#183F9C",
  800: "#19377D",
  900: "#1A3165",
  950: "#101D40",
};

const magenta = {
  50: "#FDF0F7",
  100: "#FBDEEE",
  200: "#F7BEDC",
  300: "#F093C4",
  400: "#E564A6",
  500: "#CE3D86",
  600: "#B3276D",
  700: "#942158",
  800: "#7B1E4A",
  900: "#691C40",
  950: "#3F0A22",
};

/** Cool graphite neutrals ------------------------------------------- */
const neutral = {
  0: "#FFFFFF",
  50: "#F8F9FC",
  100: "#F1F3F9",
  200: "#E4E7F0",
  300: "#CFD4E2",
  400: "#A9B1C7",
  500: "#7C86A1",
  600: "#5B6580",
  700: "#434C66",
  800: "#2B3350",
  900: "#1A2038",
  950: "#0C1122",
};

/** Warm-graphite ink (replaces the old `dark` scale) ------------------ */
const ink = {
  300: "#A9B1C7",
  400: "#7C86A1",
  500: "#5B6580",
  600: "#454E6B",
  700: "#323A57",
  800: "#1B2137", // body copy
  900: "#0C1122", // headings
  950: "#060A16",
};

/** Surfaces (replaces the old warm `surface` scale) ------------------- */
const surface = {
  0: "#FFFFFF",
  50: "#F4F5FA", // app canvas
  100: "#EDF0F7", // sunken / hover
  200: "#E4E7F0", // borders
  300: "#CFD4E2", // strong borders
  400: "#A9B1C7", // disabled text
  500: "#7C86A1",
};

/** Semantic flat tokens exposed to Tailwind (alpha-capable) ----------- */
const token = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    DEFAULT: hex,
    rgb: `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`,
  };
};

/** Flat semantic token that ALSO carries its ramp, so both
 *  `bg-primary` and `bg-primary-600` resolve to the same hue. */
const semantic = (hex, ramp) => ({ ...token(hex), ...ramp });

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      white: "#FFFFFF",
      black: "#060A16",

      /* ---- semantic design-system tokens (single source) ---- */
      canvas: token(surface[50]), // background
      foreground: token(ink[900]), // headings
      body: token(ink[800]), // body copy
      card: token("#FFFFFF"), // surface
      raised: token(surface[50]), // surface-hover
      sunken: token(surface[100]),
      line: token(surface[200]), // border
      "line-strong": token(surface[300]),
      muted: token(ink[500]), // muted text
      "muted-soft": token(ink[400]),
      primary: semantic(iris[600], iris),
      "primary-hover": token(iris[700]),
      "primary-soft": token(iris[50]),
      secondary: token(ink[900]),
      "secondary-soft": token(ink[700]),
      accent: semantic(cyan[600], cyan),
      "accent-hover": token(cyan[700]),
      "accent-soft": token(cyan[50]),
      success: semantic(emerald[600], emerald),
      "success-soft": token(emerald[50]),
      warning: semantic(amber[500], amber),
      "warning-soft": token(amber[50]),
      danger: semantic(rose[600], rose),
      "danger-soft": token(rose[50]),
      info: semantic(sky[500], sky),
      "info-soft": token(sky[50]),
      rating: semantic(gold[400], gold),
      magenta: semantic(magenta[500], magenta),
      "magenta-soft": token(magenta[50]),
      "magenta-light": token(magenta[300]),

      /* ---- ramps (granular use) ---- */
      brand: iris,
      ink: { ...token(ink[800]), ...ink },
      surface: { ...token(surface[50]), ...surface },
      neutral,

      /* ---- remapped legacy families so nothing old can leak ---- */
      gray: neutral,
      slate: neutral,
      zinc: neutral,
      stone: neutral,
      red: rose,
      rose,
      pink: magenta,
      fuchsia: magenta,
      purple: iris,
      violet: iris,
      indigo: iris,
      blue: sky,
      sky,
      cyan,
      teal: cyan,
      emerald,
      green: emerald,
      lime: emerald,
      amber,
      orange: amber,
      yellow: gold,
    },
    extend: {
      opacity: {
        12: "0.12",
        18: "0.18",
        22: "0.22",
        78: "0.78",
        88: "0.88",
        92: "0.92",
      },
      borderRadius: {
        none: "0",
        sm: "5px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "14px",
        "2xl": "18px",
        "3xl": "26px",
        "4xl": "34px",
        full: "9999px",
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        xs: "0 1px 2px rgba(12,17,34,0.05)",
        sm: "0 1px 2px rgba(12,17,34,0.06), 0 2px 6px rgba(12,17,34,0.04)",
        card: "0 1px 2px rgba(12,17,34,0.05), 0 1px 3px rgba(12,17,34,0.04)",
        cardHover:
          "0 14px 30px -10px rgba(12,17,34,0.16), 0 4px 10px -4px rgba(12,17,34,0.07)",
        elevated:
          "0 18px 40px -14px rgba(12,17,34,0.20), 0 6px 14px -6px rgba(12,17,34,0.08)",
        pop: "0 30px 64px -18px rgba(12,17,34,0.26), 0 10px 22px -12px rgba(12,17,34,0.12)",
        inner: "inset 0 1px 0 rgba(255,255,255,0.65)",
        focus: "0 0 0 4px rgba(79,62,208,0.16)",
        "focus-accent": "0 0 0 4px rgba(11,116,137,0.16)",
        "glow-primary": "0 8px 24px -8px rgba(79,62,208,0.55)",
        "glow-accent": "0 8px 24px -8px rgba(11,116,137,0.5)",
      },
      animation: {
        "fade-in": "fadeIn 0.28s cubic-bezier(0.4,0,0.2,1)",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)",
        "slide-down": "slideDown 0.22s cubic-bezier(0.4,0,0.2,1)",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)",
        skeleton: "skeleton 1.6s ease-in-out infinite",
        "pulse-soft": "pulseSoft 2.6s ease-in-out infinite",
        "slide-in-right": "slideInRight 0.28s cubic-bezier(0.16,1,0.3,1)",
        grow: "grow 0.22s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        skeleton: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.8" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        grow: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
};
