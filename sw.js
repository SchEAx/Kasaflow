const CACHE_NAME = "kasaflow-shell-v1-1-0";
const SHELL_ASSETS = ["/", "/index.html", "/style.css?v=1.1.0", "/cashier-themes.css?v=1.1.0", "/app.js?v=1.1.0", "/payroll-reminder.js?v=1.1.0", "/manifest.webmanifest", "/logo.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("kasaflow-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase.co")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match("/index.html") : Promise.reject()))));
});
self.addEventListener("push", (event) => {
  let data = { title: "KasaFlow", body: "Yeni bildirimin var", url: "/#avans-maas" };
  try { data = event.data.json(); } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || "KasaFlow", { body: data.body || "Yeni bildirimin var", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url || "/#avans-maas" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => list[0]?.focus() || clients.openWindow(event.notification.data?.url || "/#avans-maas")));
});
