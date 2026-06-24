import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          primary: "#0071E3",
          hover: "#0077ED",
          light: "#E8F1FB",
          subtle: "#C7DCFA",
        },
        surface: "#F9FAFB",
        border: "#D2D2D7",
        "border-light": "#E5E5EA",
        text: {
          primary: "#1D1D1F",
          secondary: "#6E6E73",
          // darkened from #AEAEB2 for WCAG AA contrast on white (#98)
          tertiary: "#8A8A8E",
        },
        success: "#34C759",
        warning: "#FF9F0A",
        error: "#FF3B30",
        neutral: "#8E8E93",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        xs: "11px",
        sm: "13px",
        base: "15px",
        md: "17px",
        lg: "21px",
        xl: "28px",
        "2xl": "40px",
      },
      maxWidth: {
        page: "1100px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04)",
        focus: "0 0 0 3px rgba(0,113,227,0.15)",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};
export default config;
