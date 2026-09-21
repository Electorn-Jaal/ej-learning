import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';


const workspaceEnv = loadEnv(process.env.NODE_ENV ?? 'development', path.resolve(import.meta.dirname, '../..'), '');
const port = Number(process.env.WEB_PORT ?? process.env.PORT ?? workspaceEnv.WEB_PORT ?? '5173');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid frontend port. Use an integer from 1 to 65535.');
}
const basePath = process.env.BASE_PATH ?? workspaceEnv.BASE_PATH ?? '/';
const apiTarget = process.env.API_PROXY_TARGET ?? workspaceEnv.API_PROXY_TARGET ??
  `http://127.0.0.1:${process.env.API_PORT ?? workspaceEnv.API_PORT ?? '5000'}`;
const proxy = { '/api': { target: apiTarget, changeOrigin: true } };

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    proxy,
    port,
    strictPort: true,
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1'],
    fs: {
      strict: true,
    },
  },
  preview: {
    proxy,
    port,
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1'],
  },
});
