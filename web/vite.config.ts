import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// In production /config.json is deployed next to the app. In dev, serve one that points at
// a local backend (the spec mock: `npx tsx features/support/mock-backend.ts`).
const devConfig = (): Plugin => ({
  name: "dev-config",
  configureServer(server) {
    server.middlewares.use("/config.json", (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ devBackend: process.env.DEV_BACKEND ?? "http://127.0.0.1:8787" }));
    });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), devConfig()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { chunkSizeWarningLimit: 4000 },
});
