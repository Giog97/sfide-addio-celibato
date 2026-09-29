// Service worker: offline app shell, cached Firebase SDK, network first for the site's own files.
// Bump the version in CACHE whenever the APP_SHELL list changes.

// Every GitHub Pages site of an account shares one origin, hence one Cache Storage:
// the prefix keeps this app away from the caches of the others.
const CACHE_PREFIX = 'sfide-addio-celibato-';
const CACHE = `${CACHE_PREFIX}v3`;
const FIREBASE_SDK_PREFIX = 'https://www.gstatic.com/firebasejs/';
const FIREBASE_SDK = [`${FIREBASE_SDK_PREFIX}12.19.0/firebase-app.js`, `${FIREBASE_SDK_PREFIX}12.19.0/firebase-firestore.js`];
const FONTS = [
  'https://fonts.googleapis.com/css2?family=Diphylleia&family=Ms+Madi&display=swap',
  'https://fonts.cdnfonts.com/s/39082/BrittanySignature-LjyZ.woff',
];
// Cross-origin files that never change for a given URL: the Firebase SDK and the fonts.
// The font files listed in the Google stylesheet depend on the browser, so they are cached on first use.
const CACHE_FIRST_PREFIXES = [
  FIREBASE_SDK_PREFIX,
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/',
  'https://fonts.cdnfonts.com/',
];
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/icons.js',
  './js/leaves.js',
  './js/logic.js',
  './js/quiz.js',
  './js/seed.js',
  './js/store/index.js',
  './js/store/local-store.js',
  './js/store/firestore-store.js',
  './js/store/firestore-helpers.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './img/card-aereo.jpg',
  './img/card-strada.jpg',
  './img/card-pub.jpg',
];
// Cached one by one: a file that is missing or unreachable during install never makes it fail.
const OPTIONAL = ['./js/firebase-config.js', ...FIREBASE_SDK, ...FONTS];
const NETWORK_TIMEOUT_MS = 3000;

// Pages that had to come from the cache get their other files from the cache as well,
// so a hanging network (plane Wi-Fi without internet) does not delay every module in turn.
const offlineClients = new Set();

// 'reload' skips the HTTP cache, so a new version never precaches stale copies.
const fresh = (url) => new Request(url, { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(APP_SHELL.map(fresh));
      await Promise.all(OPTIONAL.map((url) => cache.add(fresh(url)).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const stale = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE);
      await Promise.all(stale.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.mode !== 'navigate' && offlineClients.has(event.clientId)) {
      event.respondWith(cacheFirst(request));
      return;
    }
    // Revalidate with the server: after a deploy, phones get the new files at once.
    const fetched = fetch(request.mode === 'navigate' ? request : new Request(request, { cache: 'no-cache' }));
    // Clone at once, before the page starts reading the body.
    const copy = fetched.then((response) => (response.ok ? response.clone() : null), () => null);
    event.waitUntil(
      copy.then(async (response) => {
        if (response) await (await caches.open(CACHE)).put(request, response);
      }),
    );
    const markOffline = () => {
      if (request.mode === 'navigate' && event.resultingClientId) offlineClients.add(event.resultingClientId);
    };
    event.respondWith(networkFirst(request, fetched, markOffline));
  } else if (CACHE_FIRST_PREFIXES.some((prefix) => url.href.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request, fetched, onCacheFallback) {
  try {
    const response = await withTimeout(fetched, NETWORK_TIMEOUT_MS);
    if (response.status < 500) return response;
    return (await fromCache(request)) ?? response;
  } catch {
    const cached = await fromCache(request);
    if (!cached) return fetched;
    onCacheFallback();
    return cached;
  }
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached || request.mode !== 'navigate') return cached;
  return cache.match('./index.html');
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
