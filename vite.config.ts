import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Main build: popup, offscreen document (HTML entries) and the background
 * service worker (module entry, emitted at a stable path).
 *
 * The content script is built by vite.content.config.ts because MV3 content
 * scripts must be classic scripts (IIFE), while everything here is ESM.
 */
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": r("src") } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: r("src/ui/popup/index.html"),
        offscreen: r("src/offscreen/index.html"),
        background: r("src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
