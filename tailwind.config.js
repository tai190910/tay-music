/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ["Fira Code", "JetBrains Mono", "Consolas", "Monaco", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        rpg: {
          bg: "#090d14",
          card: "#0f151f",
          cardHover: "#16202e",
          border: "#1e293b",
          blue: "#2589f5",
          cyan: "#38bdf8",
          green: "#2ecc71",
          amber: "#e67e22",
          red: "#e74c3c",
          muted: "#8492a6",
          dim: "#475569",
        },
        hud: {
          bg: "#090d14",
          surface: "#0f151f",
          card: "#0f151f",
          cardHover: "#16202e",
          border: "#1e293b",
          muted: "#8492a6",
          dim: "#475569",
        },
        cyber: {
          cyan: "#2589f5",
          green: "#2ecc71",
          amber: "#e67e22",
          red: "#e74c3c",
        },
      },
    },
  },
  plugins: [],
};
