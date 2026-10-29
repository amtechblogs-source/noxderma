const CACHE_NAME = "noxderma-shell-v16";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/brand/logo.svg",
];

// Helper: Fetch with a fast timeout so dead mobile data packages (0 MB on 4.5G) don't hang for 25s
function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Install Event: Precache latest application shell and activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_ASSETS.map((assetUrl) =>
            fetch(assetUrl, { cache: "reload" }).then((res) => {
              if (res && res.status === 200) {
                return cache.put(assetUrl, res);
              }
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Purge ALL older caches (including legacy noxderma-shell-v2) so stale layouts never appear
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch Event: Always keep offline cache fresh when online, and fall back fast when offline
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" && event.request.method !== "HEAD") {
    return;
  }

  const url = new URL(event.request.url);

  // 1. Never intercept API endpoints (including /api/health & /api/sync) or external cloud services
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("imagekit.io") ||
    url.hostname.includes("openstreetmap.org")
  ) {
    return;
  }

  // 2. Bypass on localhost development for webpack HMR
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    if (url.pathname.startsWith("/_next/") || url.pathname.includes("webpack")) {
      return;
    }
  }

  // 3. Page Navigation Requests: Network-first (4s timeout) + ALWAYS update cached HTML so offline reload gets latest UI
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(event.request, 4000)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cloneForRoute = networkResponse.clone();
            const cloneForRoot = url.pathname === "/" ? networkResponse.clone() : null;
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloneForRoute);
              if (cloneForRoot) {
                cache.put("/", cloneForRoot);
              }
            });
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((exactCached) => {
            if (exactCached) return exactCached;
            return caches.match("/").then(
              (rootCached) =>
                rootCached ||
                new Response(
                  "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Noxderma Offline</title></head><body style='font-family:sans-serif;padding:2rem;text-align:center;background:#0f172a;color:#f8fafc'><h2>No Internet Connection</h2><p>Please connect to the internet once to cache the latest Noxderma version.</p></body></html>",
                  { status: 503, headers: { "Content-Type": "text/html" } }
                )
            );
          })
        )
    );
    return;
  }

  // 4. Content-hashed Next.js Static Chunks & Brand Media
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetchWithTimeout(event.request, 6000)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() =>
            caches.match(event.request).then(
              (fallback) =>
                fallback ||
                new Response("Offline asset unavailable", {
                  status: 503,
                  statusText: "Service Unavailable",
                })
            )
          );
      })
    );
    return;
  }

  // 5. Next.js RSC flight payloads & other GET requests: Network-first with 4s timeout + cache update
  event.respondWith(
    fetchWithTimeout(event.request, 4000)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) =>
            cached || new Response("", { status: 503, statusText: "Offline Not Found" })
        )
      )
  );
});
