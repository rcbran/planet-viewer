import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // scripts/ and nasa-src/ hold long-running jobs and multi-GB sources; watching them
    // crashes the dev server on Windows (EBUSY) and wastes inotify budget elsewhere.
    watch: { ignored: ["**/scripts/**", "**/nasa-src/**", "**/shots/**", "**/public/textures/**"] },
  },
  build: { target: "es2022" },
});
