import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        void: "#000000",
        abyss: "#03050b",
        depth: "#070b14",
        surface: {
          DEFAULT: "#0d1320",
          raised: "#121a2b",
          overlay: "#182337",
        },
        edge: {
          dim: "rgba(162,177,211,0.08)",
          subtle: "rgba(162,177,211,0.15)",
          bright: "rgba(162,177,211,0.26)",
          glow: "rgba(49,196,255,0.58)",
          indigo: "rgba(133,148,255,0.50)",
          hard: "rgba(49,196,255,0.82)",
        },
        cyan: {
          50: "#ecfdff",
          100: "#d5f8ff",
          200: "#a8ecff",
          300: "#68deff",
          400: "#31c4ff",
          500: "#0da7ee",
          600: "#0d85c4",
          700: "#14689a",
          glow: "rgba(49,196,255,0.13)",
          "glow-md": "rgba(49,196,255,0.22)",
          "glow-lg": "rgba(49,196,255,0.40)",
        },
        indigo: {
          300: "#b4bcff",
          400: "#8594ff",
          500: "#6777f7",
          600: "#4f58da",
          glow: "rgba(133,148,255,0.18)",
        },
        matrix: "#2de6aa",
        pulse: "#ffc043",
        crimson: "#ff6f85",
        ink: {
          bright: "#f5f8ff",
          DEFAULT: "#c7d4ef",
          secondary: "#8393b0",
          muted: "#46506a",
          code: "#5fd4ff",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", ...fontFamily.sans],
        mono: ["IBM Plex Mono", ...fontFamily.mono],
        display: ["Sora", "Space Grotesk", ...fontFamily.sans],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      letterSpacing: {
        widest: "0.2em",
        display: "-0.03em",
        tight: "-0.02em",
      },
      backgroundImage: {
        "grid-dim":
          "radial-gradient(circle, rgba(140,159,198,0.07) 1px, transparent 1px)",
        "grid-cyan":
          "radial-gradient(circle, rgba(49,196,255,0.14) 1px, transparent 1px)",
        "circuit-h":
          "repeating-linear-gradient(90deg, rgba(49,196,255,0.08) 0px, rgba(49,196,255,0.08) 1px, transparent 1px, transparent 48px)",
        "circuit-v":
          "repeating-linear-gradient(0deg, rgba(49,196,255,0.08) 0px, rgba(49,196,255,0.08) 1px, transparent 1px, transparent 48px)",
        "gradient-radial-cyan":
          "radial-gradient(ellipse at top, rgba(49,196,255,0.11) 0%, transparent 68%)",
        "gradient-radial-indigo":
          "radial-gradient(ellipse at bottom right, rgba(133,148,255,0.14) 0%, transparent 60%)",
        "gradient-hero":
          "radial-gradient(ellipse 75% 52% at 50% -6%, rgba(49,196,255,0.16) 0%, transparent 100%)",
        "glass-surface":
          "linear-gradient(140deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.012) 100%)",
        shimmer:
          "linear-gradient(90deg, transparent 0%, rgba(49,196,255,0.14) 50%, transparent 100%)",
        "hud-scanline":
          "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.14) 2px, rgba(0,0,0,0.14) 4px)",
        "aurora-shell":
          "radial-gradient(1200px 520px at 18% -10%, rgba(49,196,255,0.18), transparent 65%), radial-gradient(1100px 540px at 82% 0%, rgba(133,148,255,0.20), transparent 68%)",
      },
      backgroundSize: {
        "grid-sm": "20px 20px",
        "grid-md": "34px 34px",
        "grid-lg": "50px 50px",
        circuit: "48px 48px",
      },
      boxShadow: {
        "glow-cyan-sm": "0 0 10px rgba(49,196,255,0.36), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glow-cyan": "0 0 18px rgba(49,196,255,0.40), 0 0 42px rgba(49,196,255,0.15)",
        "glow-cyan-lg": "0 0 34px rgba(49,196,255,0.45), 0 0 72px rgba(49,196,255,0.20)",
        "glow-indigo": "0 0 20px rgba(133,148,255,0.30), 0 0 48px rgba(133,148,255,0.16)",
        "glow-matrix": "0 0 10px rgba(45,230,170,0.45)",
        glass: "0 6px 30px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)",
        "glass-lg": "0 10px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.10)",
        card: "0 2px 8px rgba(0,0,0,0.58), 0 14px 40px rgba(0,0,0,0.48)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.66), 0 20px 58px rgba(0,0,0,0.56)",
        terminal: "0 0 0 1px rgba(49,196,255,0.23), 0 10px 40px rgba(0,0,0,0.76), inset 0 1px 0 rgba(49,196,255,0.10)",
        hud: "0 0 0 1px rgba(49,196,255,0.30), 0 0 26px rgba(49,196,255,0.10), inset 0 0 38px rgba(0,0,0,0.36)",
        "node-selected": "0 0 0 2px rgba(49,196,255,0.70), 0 0 28px rgba(49,196,255,0.32)",
        "hard-cyan": "4px 4px 0 rgba(49,196,255,0.55)",
      },
      borderColor: {
        DEFAULT: "rgba(162,177,211,0.12)",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      borderWidth: {
        "0.5": "0.5px",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 12px rgba(49,196,255,0.35)" },
          "50%": { opacity: "0.72", boxShadow: "0 0 28px rgba(49,196,255,0.62)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "blink-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-right": {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "data-pulse": {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
          "100%": { opacity: "0", transform: "scale(0.8)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "status-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(49,196,255,0.46)" },
          "70%": { boxShadow: "0 0 0 6px rgba(49,196,255,0)" },
        },
        "mesh-shift": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(8px, -6px, 0)" },
        },
        "grid-scan": {
          "0%":   { backgroundPosition: "0 0, 0 0" },
          "100%": { backgroundPosition: "48px 48px, 48px 48px" },
        },
        "grid-scan-slow": {
          "0%":   { backgroundPosition: "0 0, 0 0" },
          "100%": { backgroundPosition: "40px 40px, 40px 40px" },
        },
        "sweep-x": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100vw)" },
        },
        "node-enter": {
          "0%":   { opacity: "0", transform: "scale(0.88) translateY(12px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2.5s ease-in-out infinite",
        "scan-line": "scan-line 5s linear infinite",
        "blink-cursor": "blink-cursor 1s step-end infinite",
        "fade-up": "fade-up 0.4s ease-out both",
        "fade-in": "fade-in 0.3s ease-out both",
        "slide-right": "slide-right 0.35s ease-out both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
        shimmer: "shimmer 2.5s linear infinite",
        "data-pulse": "data-pulse 1.8s ease-in-out infinite",
        orbit: "orbit 12s linear infinite",
        float: "float 4s ease-in-out infinite",
        "status-ring": "status-ring 1.5s ease-out infinite",
        "mesh-shift":       "mesh-shift 5s ease-in-out infinite",
        "grid-scan":        "grid-scan 22s linear infinite",
        "grid-scan-slow":   "grid-scan-slow 40s linear infinite",
        "sweep-x":          "sweep-x 3.5s linear infinite",
        "node-enter":       "node-enter 0.35s cubic-bezier(0.175,0.885,0.32,1.275) both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        snap: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
      },
    },
  },
  plugins: [],
};

export default config;
