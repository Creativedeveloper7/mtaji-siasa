import type { Config } from "tailwindcss";

const withAlpha = (cssVar: string) =>
  `rgb(var(${cssVar}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: withAlpha("--color-bg"),
          elevated: withAlpha("--color-bg-elevated"),
          soft: withAlpha("--color-bg-soft"),
        },
        surface: {
          DEFAULT: withAlpha("--color-surface"),
          hover: withAlpha("--color-surface-hover"),
          raised: withAlpha("--color-surface-raised"),
        },
        border: {
          DEFAULT: "rgb(var(--color-border) / var(--border-opacity))",
          strong: "rgb(var(--color-border-strong) / var(--border-strong-opacity))",
          accent: "rgb(var(--color-border-accent) / 0.35)",
        },
        ink: {
          DEFAULT: withAlpha("--color-text"),
          muted: withAlpha("--color-text-muted"),
          subtle: withAlpha("--color-text-subtle"),
          inverse: withAlpha("--color-text-inverse"),
        },
        accent: {
          DEFAULT: withAlpha("--color-accent"),
          hover: withAlpha("--color-accent-hover"),
          muted: "rgb(var(--color-accent) / 0.14)",
          soft: "rgb(var(--color-accent) / 0.08)",
        },
        brand: {
          green: withAlpha("--color-brand-green"),
          "green-hover": withAlpha("--color-brand-green-hover"),
          red: withAlpha("--color-brand-red"),
          "red-hover": withAlpha("--color-brand-red-hover"),
        },
        success: {
          DEFAULT: withAlpha("--color-success"),
          muted: "rgb(var(--color-success) / 0.14)",
        },
        warning: {
          DEFAULT: withAlpha("--color-warning"),
          muted: "rgb(var(--color-warning) / 0.14)",
        },
        error: {
          DEFAULT: withAlpha("--color-error"),
          muted: "rgb(var(--color-error) / 0.14)",
        },
        map: {
          land: withAlpha("--color-map-land"),
          water: withAlpha("--color-map-water"),
          road: withAlpha("--color-map-road"),
          marker: withAlpha("--color-map-marker"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        script: ["var(--font-display)", "cursive"],
      },
      fontSize: {
        display: [
          "clamp(2.75rem, 6vw, 4.5rem)",
          { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "500" },
        ],
        h1: [
          "clamp(2rem, 4vw, 3rem)",
          { lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "500" },
        ],
        h2: [
          "clamp(1.5rem, 3vw, 2rem)",
          { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "500" },
        ],
        h3: [
          "1.25rem",
          { lineHeight: "1.35", letterSpacing: "-0.015em", fontWeight: "500" },
        ],
        body: ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        small: ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        caption: [
          "0.75rem",
          { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" },
        ],
        meta: [
          "0.6875rem",
          { lineHeight: "1.4", letterSpacing: "0.06em", fontWeight: "500" },
        ],
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        30: "7.5rem",
      },
      maxWidth: {
        container: "1200px",
        narrow: "720px",
        wide: "1400px",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        raised: "var(--shadow-raised)",
        glow: "var(--shadow-glow)",
        "glow-green": "var(--shadow-glow-green)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "220ms",
        slow: "360ms",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-up": "slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right":
          "slide-in-right 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
