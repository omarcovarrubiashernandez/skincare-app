// Service worker de Aplo Blossom
// Sube el número de versión cuando cambies archivos para forzar la actualización del caché.
const VERSION = 'aplo-v2';
const SHELL = [
  './', './index.html', './styles.css',
  './js/main.js', './js/state.js', './js/utils.js', './js/firebase.js',
  './js/inventario.js', './js/catalogo.js', './js/cotizar.js', './js/ventas.js',
  './js/abonos.js', './js/finanzas.js', './js/reportes.js', './js/editor-lote.js',
  './js/exportImages.js', './icons/icon-192.png', './icons/icon-512.png'
];
// Hosts de librerías/fuentes que sí vale la pena cachear para uso offline
const CDN_HOSTS = [
  'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'cdn.sheetjs.com',
  'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_HOSTS.includes(url.hostname);
  // Firestore, imágenes de R2 y demás van directo a la red
  if (!sameOrigin && !isCdn) return;

  // Stale-while-revalidate: responde rápido del caché y actualiza en segundo plano
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(async () => {
          if (cached) return cached;
          // Sin red y sin caché: para la página principal, intenta el index guardado
          if (req.mode === 'navigate') {
            const shell = await cache.match('./index.html', { ignoreSearch: true });
            if (shell) return shell;
          }
          return Response.error();
        });
      return cached || network;
    })
  );
});
