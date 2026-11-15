/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT starfield for dark stages on Co-Pilot and Evidence. Drawn once per size change, no animation. */
(function () {
  "use strict";
  var list = document.querySelectorAll("canvas[data-stars]");
  if (!list.length) return;
  function draw(cv) {
    if (!cv.getContext) return;
    var box = cv.parentNode.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2), ctx = cv.getContext("2d");
    if (!box.width || !box.height) return;
    cv.width = Math.round(box.width * d); cv.height = Math.round(box.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    var n = Math.round(box.width * box.height / 5200), s = 7;
    for (var i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647; var x = (s / 2147483647) * box.width;
      s = (s * 16807) % 2147483647; var y = (s / 2147483647) * box.height;
      s = (s * 16807) % 2147483647; var k = s / 2147483647;
      ctx.globalAlpha = 0.25 + k * 0.6; ctx.fillStyle = k > 0.86 ? "#9EE7FF" : "#fff";
      ctx.beginPath(); ctx.arc(x, y, 0.4 + k * 1.1, 0, 6.2832); ctx.fill();
    }
  }
  Array.prototype.forEach.call(list, function (cv) {
    var t, w = 0, h = 0;
    function later() { clearTimeout(t); t = setTimeout(function () { draw(cv); }, 120); }
    draw(cv);
    if ("ResizeObserver" in window) {
      new ResizeObserver(function (en) { var r = en[0].contentRect; if (Math.abs(r.width - w) > 1 || Math.abs(r.height - h) > 1) { w = r.width; h = r.height; later(); } }).observe(cv.parentNode);
    } else { window.addEventListener("resize", later); }
  });
})();
