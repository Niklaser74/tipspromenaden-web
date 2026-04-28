// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Astro-konfig — `site` används för att generera korrekta absoluta länkar
// i sitemap och Open Graph-metadata. Tailwind 4 dras in via Vite-pluginen
// (Astro 5 + Tailwind 4 har ingen separat Astro-integration; allt går
// via Vite + en CSS-fil med `@import "tailwindcss"`).
export default defineConfig({
  site: "https://tipspromenaden.app",
  vite: {
    plugins: [tailwindcss()],
  },
});
