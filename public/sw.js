const CACHE_NAME = "noxderma-shell-v26";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/brand/logo.svg",
];

// Helper: Fetch with a fast timeout so dead mobile data packages (0 MB on 4.5G) don't hang
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

// Activate Event: Purge ALL older caches so stale layouts or old SW rules never linger
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

// Fetch Event: Instant Stale-While-Revalidate for RSC client navigation, Cache-First for immutable bundles
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" && event.request.method !== "HEAD") {
    return;
  }

  const url = new URL(event.request.url);

  // 1. Never intercept cross-origin requests, health probes (/health.json), SW script, or API endpoints
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

  // 3. Content-hashed Next.js Static Chunks & Brand Media -> Instant Cache-First
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetchWithTimeout(event.request, 8000)
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
                new Response("", {
                  status: 200,
                  headers: { "x-noxderma-offline": "1" },
                })
            )
          );
      })
    );
    return;
  }

  // 4. Next.js RSC Flight Payloads (Client-Side Link Clicks & Prefetches) -> Instant Stale-While-Revalidate!
  // All Noxderma pages are client-rendered from IndexedDB, so serving cached RSC immediately makes clicks 0ms!
  const isRscRequest =
    url.searchParams.has("_rsc") || event.request.headers.get("RSC") === "1";

  if (isRscRequest) {
    const normalizedRscKey = `${url.origin}${url.pathname}?_rsc=cached`;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedExact = await cache.match(event.request);
        const cachedNormalized = cachedExact || (await cache.match(normalizedRscKey));

        const networkFetchPromise = fetchWithTimeout(event.request, 5000)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
              cache.put(normalizedRscKey, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // If already in cache, return IMMEDIATELY (<2ms) and revalidate silently in background!
        if (cachedNormalized) {
          event.waitUntil(networkFetchPromise);
          return cachedNormalized;
        }

        const liveRes = await networkFetchPromise;
        if (liveRes) return liveRes;

        return new Response("", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "x-noxderma-offline": "1",
          },
        });
      })
    );
    return;
  }

  // 5. Full Page Navigation Requests (Browser Reload / Direct URL): Fast Network-First (4.5s) + Cache Fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(event.request, 4500)
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
                  { status: 200, headers: { "Content-Type": "text/html" } }
                )
            );
          })
        )
    );
    return;
  }

  // 6. Other same-origin GET requests (manifest.json, etc.): Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetchPromise = fetchWithTimeout(event.request, 5000)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(fetchPromise);
        return cached;
      }

      return (
        (await fetchPromise) ||
        new Response("", {
          status: 200,
          headers: { "x-noxderma-offline": "1" },
        })
      );
    })
  );
});
