import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#070A12",
        panel: "#0E1320",
        panelSoft: "#111827",
        borderSoft: "rgba(255,255,255,0.08)",
        accent: "#7C3AED",
        cyan: "#22D3EE"
      },
      boxShadow: {
        glow: "0 0 60px rgba(124, 58, 237, 0.20)",
        card: "0 20px 80px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
