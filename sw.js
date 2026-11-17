// Service worker mínimo: deixa o app instalável e abrir sem rede o que já foi carregado.
// Dados do Firestore NUNCA passam por aqui (são de outro domínio e usam suas próprias conexões).
const CACHE = 'os-garage-v2.3.0';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // no-cache = pergunta ao servidor se mudou (barato, por ETag), em vez de usar a cópia do navegador por até 10 min.
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
