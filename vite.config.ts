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
  },
  build: {
    outDir: "dist",
  },
});
