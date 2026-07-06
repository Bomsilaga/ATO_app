import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111417",
        paper: "#F6F5F1",
        ledger: "#1F3D3A",
        ledgerLight: "#2E5B56",
        flag: "#B5502A",
        line: "#D8D3C7"
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
