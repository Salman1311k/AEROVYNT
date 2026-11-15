/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* Registers the offline service worker (needs https or localhost; ignored when opened from disk). */
(function () {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  var up = /\/(copilot|evidence)(\/|$)/.test(location.pathname) ? "../" : "";
  var had = !!navigator.serviceWorker.controller, done = false;
  /* when an updated worker takes over, reload once so the page and its scripts come from the same release */
  navigator.serviceWorker.addEventListener("controllerchange", function () { if (had && !done) { done = true; location.reload(); } });
  navigator.serviceWorker.ready.then(function () { var t = document.getElementById("offtag"); if (t) t.hidden = false; }).catch(function () {});
  window.addEventListener("load", function () { navigator.serviceWorker.register(up + "sw.js").catch(function () {}); });
})();
