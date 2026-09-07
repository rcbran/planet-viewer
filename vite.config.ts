import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    // scripts/ and nasa-src/ hold long-running jobs and multi-GB sources; watching them
    // crashes the dev server on Windows (EBUSY) and wastes inotify budget elsewhere.
    // Windows fs.watch raises EBUSY on files mid-write (scp, running scripts) and Vite treats watcher
    // errors as fatal. Polling sidesteps fs.watch entirely; cheap on this box.
    watch: { usePolling: true, interval: 400, ignored: ["**/scripts/**", "**/nasa-src/**", "**/shots/**", "**/public/textures/**", "**/node_modules/**"] },
  },
  build: { target: "es2022" },
});
