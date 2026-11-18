/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        mochy: {
          bg: "#0b0c10",
          sidebar: "#101119",
          card: "#171824",
          cardHover: "#202234",
          player: "#13141e",
          border: "#232536",
          accent: "#f43f5e",
          accentHover: "#fb7185",
          muted: "#858b9e",
          subtext: "#62677a",
        },
      },
    },
  },
  plugins: [],
};
