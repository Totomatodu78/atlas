// Atlas : service worker
// Rend l'app installable et permet de l'ouvrir même avec un mauvais réseau.
// Stratégie "réseau d'abord" : tu as toujours la dernière version publiée sur GitHub,
// et la copie locale ne sert que si le réseau manque.
// Seuls les fichiers de l'app sont mis en cache : jamais tes données ni tes photos.

const CACHE = 'atlas-v1';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/config.js',
  'vendor/maplibre-gl.mjs',
  'vendor/maplibre-gl-shared.mjs',
  'vendor/maplibre-gl-worker.mjs',
  'vendor/maplibre-gl.css',
  'vendor/supabase.js',
  'fonts/fraunces-latin-wght-normal.woff2',
  'fonts/figtree-latin-wght-normal.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase, tuiles, etc. : jamais en cache

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }),
  );
});
