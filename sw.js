/* ==========================================================================
   Guardaroba — sw.js
   Strategia:
   • Supabase API  → Network-first (dati sempre freschi; fallback cache)
   • Tutto il resto → Cache-first  (shell offline immediata)
   ========================================================================== */

const CACHE = 'guardaroba-v12';

const PRECACHE = [
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Google Fonts (se già passati dal browser, li mettiamo in cache)
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── Install: precache shell ──────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // addAll fallisce se anche solo una risorsa non è raggiungibile.
      // Usiamo fetch+put singoli così le mancanze non bloccano l'install.
      Promise.allSettled(
        PRECACHE.map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(res => cache.put(url, res))
            .catch(() => { /* rete assente al primo avvio — ok */ })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: elimina cache vecchie ─────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo GET — lascia passare tutto il resto (POST Supabase RPC, ecc.)
  if (request.method !== 'GET') return;

  // Supabase API → Network-first
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Tutto il resto → Cache-first
  event.respondWith(cacheFirst(request));
});

// ── Strategie ────────────────────────────────────────────────────────────────

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? offlineFallback();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!doctype html><html lang="it"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Guardaroba — offline</title>
    <style>
      body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
           background:#12141a;color:#edeff3;font-family:system-ui,sans-serif;text-align:center;}
      h1{font-size:2rem;margin-bottom:.5rem}span{color:#d4a15a}p{color:#9aa1b3;font-size:.95rem}
    </style></head>
    <body><div><h1>Guardaroba<span>.</span></h1>
    <p>Sei offline.<br>Riapri quando hai connessione per aggiornare i dati.</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
