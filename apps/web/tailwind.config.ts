import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101820",
        teal: "#0f766e",
        coral: "#e85d4f",
        gold: "#f4b942",
        mist: "#eef7f4"
      },
      boxShadow: {
        panel: "0 16px 40px rgba(16, 24, 32, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
