/**
 * @file apps/web/postcss.config.mjs
 * Tailwind v4 is CSS-first; the only plugin needed is the PostCSS entry point.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {}
  }
};

export default config;
