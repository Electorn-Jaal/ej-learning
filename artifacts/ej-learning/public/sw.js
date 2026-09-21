// The service worker, written by hand rather than generated.
//
// What it is for: a classroom link that drops for ten seconds should not throw
// a child out of a lesson they have already loaded, and an app installed to a
// phone's home screen has to open without a round trip for its own shell.
//
// What it must never do: store an answer that depended on who was asking. A
// child's day, their results and their plan all come from /api/ behind a
// session cookie, and a cached copy of one account's day would be handed to
// the next person to pick up a shared phone. Nothing under the API is written
// to a cache here, and nothing but GET is touched at all.
//
// The scope is whatever path this file is served from, so the same worker
// works at / and at /ej/ without being told which.

const VERSION = 'ej-v1';
const SHELL = VERSION + '-shell';
const ASSETS = VERSION + '-assets';
const BASE = new URL('./', self.registration.scope).pathname;
const SHELL_URL = BASE + 'index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      // A shell that will not fetch is not a reason to refuse to install; the
      // worker is still useful for assets, and navigation falls back to the
      // network.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Built files carry a content hash, so a URL that matches never changes. */
const isHashedAsset = (url) =>
  url.pathname.startsWith(BASE + 'assets/') ||
  url.pathname.startsWith(BASE + 'icons/') ||
  url.pathname === BASE + 'logo.png';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Anything that answers "who is asking" is left alone entirely: not read
  // from a cache, not written to one.
  if (sameOrigin && url.pathname.startsWith(BASE + 'api/')) return;
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  // A page: the network decides, and the shell is what stands in when it
  // cannot be reached. React routing takes it from there.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(SHELL_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  if (sameOrigin && isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else - the book PDFs among them - goes to the network as it
  // always did. A textbook is served through the API and belongs to whoever
  // the session says it belongs to.
});
