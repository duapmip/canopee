import { defineConfig } from "vite";
import { renderPresentation } from "./scripts/presentation-figures.mjs";

const pages = { "/dataviz": "/recit.html", "/presentation": "/presentation.html" };

function servePages(server) {
  server.middlewares.use((req, res, next) => {
    const [pathname, query] = req.url.split("?", 2);
    const canonical = pathname.replace(/\/$/, "");
    if (!Object.hasOwn(pages, canonical)) return next();
    const suffix = query ? `?${query}` : "";
    if (pathname !== canonical) {
      res.writeHead(308, { Location: canonical + suffix });
      res.end();
      return;
    }
    req.url = pages[canonical] + suffix;
    next();
  });
}

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    rollupOptions: { input: { carte: "index.html", dataviz: "recit.html", presentation: "presentation.html" } },
  },
  plugins: [{
    name: "canopee-pages",
    configureServer: servePages,
    configurePreviewServer: servePages,
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        if (context.filename.endsWith("/presentation.html")) return renderPresentation(html);
      },
    },
  }],
  optimizeDeps: {
    // Le worker MapLibre est importé comme ressource dans main.js.
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
