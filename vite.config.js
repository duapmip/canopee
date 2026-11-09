import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
  },
  preview: { host: "0.0.0.0", port: 5173, strictPort: true },
});
