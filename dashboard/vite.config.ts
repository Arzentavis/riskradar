import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base + stable file names so the build can be hosted anywhere
// (GitHub Pages, Vercel, or opened from any sub-path).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
