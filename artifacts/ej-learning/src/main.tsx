import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { ignoreExtensionErrors } from '@/lib/ignore-extension-errors';

import './index.css';

ignoreExtensionErrors();
setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ''));

// Installed to a phone, the app opens its own shell without waiting for the
// network. Registered after load so it never competes with the first paint,
// and only in a build - a worker in development caches the very files being
// edited. Its scope is the deployed base, so it governs /ej/ and nothing of
// whatever else the server hosts.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // An unregistered worker costs the offline shell, nothing else.
      });
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
