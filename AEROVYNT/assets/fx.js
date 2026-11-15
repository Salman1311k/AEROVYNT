/* SI-assisted: developed with Claude (Anthropic) and reviewed by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* Scroll-reveal for the home page. Skipped when the visitor prefers reduced motion. */
(function () {
  var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (calm || !("IntersectionObserver" in window) || !document.querySelector(".proofbar")) return;
  var els = document.querySelectorAll(".sec > h2, .sec > .sub, .pb-i, .clock, .signal, .dotcard, .detect, .step, .closing");
  var io = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12 });
  Array.prototype.forEach.call(els, function (el, i) { el.classList.add("rise"); el.style.transitionDelay = (i % 3) * 90 + "ms"; io.observe(el); });
  setTimeout(function () { Array.prototype.forEach.call(els, function (el) { el.classList.add("in"); }); }, 4000);
})();
