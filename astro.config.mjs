// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";

// Astro-konfig — `site` används för att generera korrekta absoluta länkar
// i sitemap och Open Graph-metadata. Tailwind 4 dras in via Vite-pluginen
// (Astro 5 + Tailwind 4 har ingen separat Astro-integration; allt går
// via Vite + en CSS-fil med `@import "tailwindcss"`).
//
// React-integrationen används bara på `/skapa`-vägen — webb-baserad
// walk-creator. Övriga sidor är vanlig static Astro utan React-island.
// Astro:s default island-arkitektur betyder att React bara skickas till
// klienter som faktiskt besöker /skapa, så marknadssidan förblir lätt.
export default defineConfig({
  site: "https://tipspromenaden.app",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
