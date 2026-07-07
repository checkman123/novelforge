import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/** Content script build: single IIFE bundle, merged into dist/ after the main build. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("src", import.meta.url)) } },
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("src/content/index.ts", import.meta.url)),
      formats: ["iife"],
      name: "NovelForgeContent",
      fileName: () => "content.js",
    },
  },
});
