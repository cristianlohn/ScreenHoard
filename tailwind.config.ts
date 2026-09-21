import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          base: "rgba(9, 9, 11, 0.85)",
          surface: "rgba(24, 24, 27, 0.70)",
          hover: "rgba(39, 39, 42, 0.65)",
          active: "rgba(63, 63, 70, 0.70)",
          border: "rgba(255, 255, 255, 0.10)",
          highlight: "rgba(255, 255, 255, 0.05)",
        },
      },
      boxShadow: {
        glass: "0 20px 50px rgba(0, 0, 0, 0.6)",
        "glass-border": "inset 0 1px 0 0 rgba(255, 255, 255, 0.12)",
        "glass-hover": "0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)",
      },
      backdropBlur: {
        xs: "2px",
        "2xl": "24px",
        "3xl": "40px",
      },
      animation: {
        "modal-in": "modalIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 0.12s ease-out forwards",
      },
      keyframes: {
        modalIn: {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
