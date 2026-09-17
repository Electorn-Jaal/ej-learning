/**
 * Stops a browser extension's crash from covering the page in development.
 *
 * Vite's error overlay listens for window errors and shows whatever it catches
 * full-screen. It cannot tell whose code threw, so an extension failing on its
 * own internals - the one seen here reads "Cannot read properties of undefined
 * (reading 'M_ID')" from chrome-extension://…/executors/200.js - blanks out a
 * working application. During a demonstration that looks like our fault.
 *
 * This listens first, in the capture phase, and stops only the events whose
 * source is an extension URL. Anything thrown by this application reaches the
 * overlay exactly as before, because an error we cannot see is worse than an
 * overlay we did not want.
 *
 * Development only: the overlay does not exist in a build, and in production
 * swallowing errors would hide real ones from whatever collects them.
 */

const EXTENSION_SCHEMES = ["chrome-extension://", "moz-extension://", "safari-extension://"];

const fromExtension = (value: unknown): boolean =>
  typeof value === "string" && EXTENSION_SCHEMES.some((scheme) => value.startsWith(scheme));

/** An extension's stack names its own files; ours never do. */
const stackFromExtension = (error: unknown): boolean => {
  const stack = (error as { stack?: unknown } | null)?.stack;
  return typeof stack === "string" && EXTENSION_SCHEMES.some((scheme) => stack.includes(scheme));
};

export function ignoreExtensionErrors() {
  if (!import.meta.env.DEV) return;

  window.addEventListener(
    "error",
    (event) => {
      if (fromExtension(event.filename) || stackFromExtension(event.error)) {
        // Still logged, so it is findable if it ever turns out to matter.
        console.debug("Ignored an error from a browser extension:", event.message);
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (stackFromExtension(event.reason)) {
        console.debug("Ignored a rejection from a browser extension.");
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true,
  );
}
