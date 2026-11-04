/** Konfigurasi kompilasi Tailwind — tema harus sama dengan desain CampusCare. */
module.exports = {
  content: ["./index.html", "./views/**/*.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#a73a00",
          container: "#ff661f",
          hover: "#e55615",
          fixed: "#ffdbce",
        },
        "on-primary": "#ffffff",
        "on-primary-fixed": "#370e00",
        "on-primary-fixed-variant": "#802a00",
        surface: {
          DEFAULT: "#f7f9fd",
          container: "#eceef2",
          "container-low": "#f2f4f8",
          "container-lowest": "#ffffff",
          "container-high": "#e6e8ec",
          "container-highest": "#e0e2e6",
          dim: "#d8dade",
          bright: "#f7f9fd",
          variant: "#e0e2e6",
        },
        "on-surface": "#191c1f",
        "on-surface-variant": "#5a4138",
        "inverse-surface": "#1e293b",
        "inverse-on-surface": "#eff1f5",
        secondary: "#5c5f62",
        tertiary: "#0053db",
        "tertiary-fixed": "#dbe1ff",
        "on-tertiary-fixed-variant": "#003ea8",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        brand: {
          orange: "#FF661F",
          dark: "#14171A",
          lightGray: "#F3F4F6",
          bgCanvas: "#E4E7EC",
          cardBg: "rgba(255, 255, 255, 0.85)",
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Plus Jakarta Sans"', "sans-serif"],
        display: ['"Space Grotesk"', "sans-serif"],
        body: ['"Plus Jakarta Sans"', "sans-serif"],
      },
      boxShadow: {
        "glow-orange": "0 8px 25px -4px rgba(255, 102, 31, 0.45)",
        "floating-glass":
          "0 24px 60px -12px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.85)",
        "dock-pill":
          "0 10px 25px -5px rgba(0, 0, 0, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.9)",
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.06)",
        "glass-inset": "inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)",
        floating: "0 20px 40px -15px rgba(20, 23, 26, 0.08)",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
