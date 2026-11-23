const CACHE_NAME = "noxderma-shell-v40";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/brand/logo.svg",
  "/brand/og-logo.jpg",
];

// Helper: Fetch with timeout + automatic retry for transient ERR_CONNECTION_RESET on edge CDNs
async function fetchWithRetry(request, timeoutMs, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(request, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Install Event: Precache core assets and activate immediately
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

// Activate Event: Purge ALL older caches so stale chunk hashes never linger across deploys
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" && event.request.method !== "HEAD") {
    return;
  }

  const url = new URL(event.request.url);

  // 1. Never intercept cross-origin requests, health probes, SW script, or API endpoints
  if (
    url.origin !== self.location.origin ||
    url.pathname === "/health.json" ||
    url.pathname === "/sw.js" ||
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

  // 3. Content-hashed Next.js Static Chunks & Brand Media -> Cache-First with Retry
  // IMPORTANT: Never return an empty 200 response for JS/CSS chunks (that causes Webpack ChunkLoadError!)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetchWithRetry(event.request, 8000, 2)
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
            caches.match(event.request).then((fallback) => fallback || Response.error())
          );
      })
    );
    return;
  }

  // 4. Next.js RSC Flight Payloads (.txt or ?_rsc=): Network-First with Retry, Exact Cache Fallback
  // IMPORTANT: Never return an empty 200 response on failure (let Next.js fall back cleanly to full page navigation)
  const isRscRequest =
    url.searchParams.has("_rsc") ||
    event.request.headers.get("RSC") === "1" ||
    url.pathname.endsWith(".txt");

  if (isRscRequest) {
    event.respondWith(
      fetchWithRetry(event.request, 6000, 1)
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
          caches.match(event.request).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 5. Full Page Navigation Requests: Network-First with Retry + Cache Fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithRetry(event.request, 6000, 1)
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
                  "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Noxderma Offline</title></head><body style='font-family:sans-serif;padding:2rem;text-align:center;background:#0f172a;color:#f8fafc'><h2>Connection Interrupted</h2><p>Please tap Reload to reconnect to Noxderma.</p><button onclick='location.reload()' style='margin-top:1rem;padding:0.6rem 1.2rem;border-radius:0.5rem;background:#0d9488;color:white;border:none;font-weight:bold;cursor:pointer'>Reload Now</button></body></html>",
                  { status: 200, headers: { "Content-Type": "text/html" } }
                )
            );
          })
        )
    );
    return;
  }
});
