// Family Dashboard service worker: shows push payloads and opens their url on tap. No caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Family Dashboard", body: "", url: "/", tag: undefined };
  try { data = { ...data, ...event.data.json() }; } catch { if (event.data) data.body = event.data.text(); }
  // F24: a {close: tag} payload retracts an earlier notification (item handled elsewhere) instead of showing one.
  if (data.close) {
    event.waitUntil(self.registration.getNotifications({ tag: data.close }).then((ns) => ns.forEach((n) => n.close())));
    return;
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, tag: data.tag, data: { url: data.url }, icon: "/icon-192.png", badge: "/icon-192.png", renotify: false }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url === url && "focus" in c) return c.focus(); }
    for (const c of list) { if ("navigate" in c) return c.navigate(url).then((w) => w && w.focus()); }
    return self.clients.openWindow(url);
  }));
});
