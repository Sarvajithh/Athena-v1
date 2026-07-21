import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Athena frontend. Port 1420 matches
// `crates/athena-app/tauri.conf.json`'s `build.devUrl`.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Vite's default watcher covers the whole project root, which
      // includes Cargo's `target/` build output. On Windows, cargo
      // holds an exclusive lock on files it's actively writing (e.g.
      // libsqlite3-sys's compiled .o objects) — if Vite's watcher tries
      // to watch one of those files mid-write, Windows throws EBUSY and
      // crashes the dev server. `target/` is generated build output,
      // never something the frontend needs to react to, so it's
      // excluded outright rather than raced against.
      ignored: ["**/target/**", "**/crates/athena-app/gen/**"],
    },
  },
  build: {
    outDir: "dist",
  },
});