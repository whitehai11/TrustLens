/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        fog: "#6b7280",
        linen: "#f8fafc"
      },
      boxShadow: {
        soft: "0 12px 40px rgba(15, 23, 42, 0.08)"
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        fadeUp: "fadeUp 700ms ease forwards"
      }
    }
  },
  plugins: []
};