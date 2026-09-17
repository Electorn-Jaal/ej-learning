import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

const workspaceEnv = loadEnv(process.env.NODE_ENV ?? 'development', path.resolve(import.meta.dirname, '../..'), '');
const port = Number(process.env.MOCKUP_PORT ?? process.env.PORT ?? workspaceEnv.MOCKUP_PORT ?? '5174');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid frontend port. Use an integer from 1 to 65535.');
}
const basePath = process.env.BASE_PATH ?? workspaceEnv.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    mockupPreviewPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "127.0.0.1",
    allowedHosts: ['localhost', '127.0.0.1'],
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "127.0.0.1",
    allowedHosts: ['localhost', '127.0.0.1'],
  },
});
