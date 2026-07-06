import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        ink2: "rgb(var(--color-ink2) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ledger: "rgb(var(--color-ledger) / <alpha-value>)",
        ledgerLight: "rgb(var(--color-ledger-light) / <alpha-value>)",
        flag: "rgb(var(--color-flag) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        accentTrack: "rgb(var(--color-accent-track) / <alpha-value>)",
        good: "rgb(var(--color-good) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)",
        serious: "rgb(var(--color-serious) / <alpha-value>)"
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        serif: ["'Source Serif 4'", "serif"],
        sans: ["'Inter'", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
