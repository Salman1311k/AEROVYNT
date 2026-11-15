/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT service worker: caches the whole site on first visit so the Co-Pilot works with no connection. Bump VERSION on each release. */
var VERSION = "aerovynt-v39";
var FILES = ["./", "index.html", "copilot/", "copilot/index.html", "evidence/", "evidence/index.html", "mission/", "mission/index.html", "manifest.webmanifest",
  "assets/style.css", "assets/polish.css", "assets/home.css", "assets/pages.css", "assets/copilot.css", "assets/evidence.css",
  "assets/data.js", "assets/coach.js", "assets/delay.js", "assets/fx.js", "assets/v4.css", "assets/ui.js", "assets/charts.js", "assets/stars.js", "assets/risks.js", "assets/home.js", "assets/copilot.js", "assets/sensors.js", "assets/pwa.js", "assets/body.js", "assets/reviews.js", "assets/evidence.js",
  "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(new Request(f, { cache: "reload" })).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
/* network first for same-origin pages AND assets (always fresh when online, revalidated with the server; cache is the offline fallback), cache first for fonts */
self.addEventListener("fetch", function (e) {
  var r = e.request; if (r.method !== "GET") return;
  var u = new URL(r.url), page = r.mode === "navigate";
  if (u.origin === location.origin) {
    e.respondWith(fetch(new Request(r, { cache: "no-cache" })).then(function (res) {
      if (res && res.ok) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); }
      return res;
    }).catch(function () { return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || (page ? caches.match("index.html") : Response.error()); }); }));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then(function (m) { return m || fetch(r).then(function (res) { var cp = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); return res; }); }));
  }
});
