import { existsSync } from "node:fs";
import { defineConfig } from "vite";

export default defineConfig({
  // The 16K Earth set is built locally and not committed (see .gitignore), so most deployments only have 8K.
  // Telling the app at build time avoids probing for it, and the 404s that came with that.
  define: { __HAS_16K__: JSON.stringify(existsSync("public/textures/16k/day.jpg")) },
  server: {
    host: true,
    port: 5173,
    // scripts/ and nasa-src/ hold long-running jobs and multi-GB sources; watching them
    // crashes the dev server on Windows (EBUSY) and wastes inotify budget elsewhere.
    // Windows fs.watch raises EBUSY on files mid-write (scp, running scripts) and Vite treats watcher
    // errors as fatal. Polling sidesteps fs.watch entirely; cheap on this box.
    watch: { usePolling: true, interval: 400, ignored: ["**/scripts/**", "**/nasa-src/**", "**/shots/**", "**/node_modules/**"] },
  },
  build: { target: "es2022" },
});
