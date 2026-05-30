import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101820",
        slate: "#263238",
        teal: "#0f766e",
        mint: "#30d5a0",
        coral: "#e85d4f",
        gold: "#f4b942",
        mist: "#eef7f4",
        cloud: "#f8fbfb",
        violet: "#6658d3"
      },
      boxShadow: {
        panel: "0 20px 60px rgba(16, 24, 32, 0.11)",
        soft: "0 10px 30px rgba(16, 24, 32, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
