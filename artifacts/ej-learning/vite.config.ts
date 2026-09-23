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

/**
 * Everything the app imports from outside itself, pre-bundled at startup.
 *
 * Vite finds dependencies by scanning from the entry, and every page of this
 * app is behind a lazy import - so a package used only by one route is not
 * found until somebody opens that route. Vite then re-optimises mid-session,
 * invalidates the dependency bundle it had already served, and the import that
 * triggered it fails with "504 Outdated Optimize Dep". On screen that is a
 * button that does nothing: the day's lesson could not be opened because the
 * radio group inside its quiz had never been bundled.
 *
 * Listing them means the scan is not relied on. It costs a moment at startup
 * and nothing after that.
 */
const dependencies = [
  '@radix-ui/react-avatar',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label',
  '@radix-ui/react-popover',
  '@radix-ui/react-radio-group',
  '@radix-ui/react-select',
  '@radix-ui/react-separator',
  '@radix-ui/react-tabs',
  '@radix-ui/react-toast',
  '@radix-ui/react-toggle',
  '@radix-ui/react-tooltip',
  '@tanstack/react-query',
  'class-variance-authority',
  'date-fns',
  'lucide-react',
  'react',
  'react-day-picker',
  'react-dom/client',
  'recharts',
  'wouter',
];

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: dependencies },
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
