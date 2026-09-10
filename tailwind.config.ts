import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#f5f2ea", muted: "#a8a9b3", panel: "#171820", line: "#2a2b37", lime: "#d7ff54", coral: "#ff7f66" } } },
  plugins: []
};
export default config;
