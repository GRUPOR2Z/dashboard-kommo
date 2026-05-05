/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        kommo: {
          green: "#00B67A",
          dark: "#0D1117",
          card: "#161B22",
          border: "#21262D",
          text: "#E6EDF3",
          muted: "#8B949E",
        },
      },
    },
  },
  plugins: [],
};
