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
        mono: ["JetBrains Mono", "Consolas", "Monaco", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        hud: {
          bg: "#0d0f12",
          surface: "#13161c",
          card: "#181c24",
          cardHover: "#222630",
          border: "#242a35",
          borderGlow: "#2f3847",
          muted: "#8492a6",
          dim: "#444c5c",
        },
        cyber: {
          cyan: "#00f0ff",
          green: "#00ff9d",
          amber: "#ffaa00",
          red: "#ff3366",
        },
        mochy: {
          bg: "#0d0f12",
          sidebar: "#13161c",
          card: "#181c24",
          cardHover: "#222630",
          player: "#101217",
          border: "#242a35",
          accent: "#00f0ff",
          accentHover: "#33f3ff",
          muted: "#8492a6",
          subtext: "#444c5c",
        },
      },
    },
  },
  plugins: [],
};
