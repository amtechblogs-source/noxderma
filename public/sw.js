const CACHE_NAME = "noxderma-shell-v2";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/brand/logo.svg",
];

// Install Event: Precache application shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup stale caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Smart offline-first caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass Service Worker caching for trusted API and Firestore requests
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("imagekit.io")
  ) {
    return; // Pass through to network
  }

  // 2. Bypass on localhost development for static chunks to prevent webpack HMR failures
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    if (url.pathname.startsWith("/_next/") || url.pathname.includes("webpack")) {
      return; // Direct network request without SW interception
    }
  }

  // 3. Navigation requests: Network-first with offline fallback to cached app shell
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match("/").then((cached) => {
          return (
            cached ||
            new Response("Offline: Noxderma App Shell not cached yet.", {
              headers: { "Content-Type": "text/html" },
            })
          );
        });
      })
    );
    return;
  }

  // 4. Static Assets (_next/static, images, fonts): Cache-first with network revalidation and graceful error catch
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Graceful fallback to avoid unhandled rejection error
            return caches.match(event.request).then((fallback) => {
              if (fallback) return fallback;
              const isCss = url.pathname.endsWith(".css");
              const isJs = url.pathname.endsWith(".js");
              return new Response("", {
                status: 200,
                headers: {
                  "Content-Type": isCss
                    ? "text/css"
                    : isJs
                    ? "application/javascript"
                    : "text/plain",
                },
              });
            });
          });
      })
    );
    return;
  }

  // Default: Network with cache fallback and safety catch
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((cached) => {
        return cached || new Response("", { status: 404, statusText: "Offline Not Found" });
      });
    })
  );
});
