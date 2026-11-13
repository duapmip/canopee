import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    rollupOptions: { input: { outil: "index.html", recit: "recit.html" } },
  },
  optimizeDeps: {
    // MapLibre 6 charge son worker à côté de import.meta.url. Le prébundle
    // Vite le place dans .vite/deps sans copier maplibre-gl-worker.mjs.
    exclude: ["maplibre-gl"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
  },
  preview: { host: "0.0.0.0", port: 5173, strictPort: true },
});
