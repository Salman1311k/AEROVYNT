/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT UI helpers: SVG components and small utilities shared by all pages (port of aerovynt_ui.py). */
(function (root) {
  "use strict";
  var COLOR = { emerald: "#10B981", amber: "#F59E0B", crimson: "#EF4444", unknown: "#94A3B8" };
  var DEEP = { emerald: "#059669", amber: "#B45309", crimson: "#B91C1C", unknown: "#475569" };
  var LABEL = { emerald: "NORMAL", amber: "WATCH", crimson: "ACTION", unknown: "NO DATA" };
  var DOT = { emerald: "🟢", amber: "🟡", crimson: "🔴", unknown: "⚪" };
  var uidN = 0;
  function uid(p) { return (p || "u") + (++uidN); }
  function esc(x) { return String(x === null || x === undefined ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function gclass(s) { return { emerald: "g-ok", amber: "g-warn", crimson: "g-bad" }[s] || "g-none"; }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function f(n, d) { return Number(n).toFixed(d); }

  function ringGauge(score, status, size, id) {
    id = id || uid("rg"); size = size || 176;
    var r = 70, c = 2 * Math.PI * r, off = c * (1 - score / 100), col = COLOR[status] || COLOR.unknown;
    var end = { emerald: "#22D3EE", amber: "#FCD34D", crimson: "#FB7185" }[status] || "#22D3EE";
    return '<svg class="ring-svg" width="' + size + '" height="' + size + '" viewBox="0 0 176 176" role="img" aria-label="Readiness ' + score + ' out of 100">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + col + '"/><stop offset="100%" stop-color="' + end + '"/></linearGradient></defs>' +
      '<circle cx="88" cy="88" r="' + r + '" fill="rgba(255,255,255,.55)" stroke="rgba(31,70,140,.10)" stroke-width="14"/>' +
      '<circle class="ring-arc" cx="88" cy="88" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="14" stroke-linecap="round" transform="rotate(-90 88 88)" style="--c:' + f(c, 1) + ';--o:' + f(off, 1) + '"/>' +
      '<text x="88" y="90" text-anchor="middle" font-size="44" font-weight="800" fill="#0B1B33" font-family="Inter,sans-serif">' + score + '</text>' +
      '<text x="88" y="114" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1.6" fill="#5B6B85" font-family="Inter,sans-serif">READINESS</text></svg>';
  }

  function sparkline(vals, lo, hi, color, id, w, h) {
    w = w || 210; h = h || 48; color = color || "#0A84FF"; id = id || uid("s");
    var v = (vals || []).filter(function (x) { return typeof x === "number" && isFinite(x); });
    if (v.length < 2) return '<svg width="100%" height="' + h + '"></svg>';
    var cand = v.slice(); if (lo !== null && lo !== undefined) cand.push(lo); if (hi !== null && hi !== undefined) cand.push(hi);
    var ymin = Math.min.apply(null, cand), ymax = Math.max.apply(null, cand);
    if (ymax - ymin < 1e-9) { ymax += 1; ymin -= 1; }
    var pad = (ymax - ymin) * 0.12; ymin -= pad; ymax += pad;
    var X = function (i) { return 4 + i * (w - 8) / (v.length - 1); }, Y = function (y) { return 4 + (ymax - y) * (h - 8) / (ymax - ymin); };
    var pts = v.map(function (y, i) { return f(X(i), 1) + "," + f(Y(y), 1); }).join(" ");
    var band = "";
    if (lo !== null && lo !== undefined && hi !== null && hi !== undefined) band = '<rect x="0" y="' + f(Y(hi), 1) + '" width="' + w + '" height="' + f(Math.max(Y(lo) - Y(hi), 1), 1) + '" rx="6" fill="rgba(10,132,255,.10)"/>';
    var area = f(X(0), 1) + "," + h + " " + pts + " " + f(X(v.length - 1), 1) + "," + h;
    return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="overflow:visible" aria-hidden="true">' +
      '<defs><linearGradient id="sg' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity=".28"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      band + '<polygon points="' + area + '" fill="url(#sg' + id + ')"/><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + f(X(v.length - 1), 1) + '" cy="' + f(Y(v[v.length - 1]), 1) + '" r="4.6" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
  }

  function vitalCard(id, label, icon, value, unit, status, note, spark, delta) {
    var col = COLOR[status] || COLOR.unknown, d = "";
    if (delta) d = '<span class="delta" style="background:' + col + '22;color:' + (DEEP[status] || DEEP.unknown) + '">' + esc(delta) + '</span>';
    return '<div class="' + gclass(status) + ' vc lift"><div class="vc-top"><span class="vc-lab">' + icon + ' ' + esc(label) + '</span>' +
      '<span class="dot ' + (status === "crimson" ? "pulse" : "") + '" style="background:' + col + '" title="' + LABEL[status] + '"></span></div>' +
      '<div class="vc-val">' + esc(value) + '<span class="vc-unit">' + esc(unit) + '</span>' + d + '</div>' +
      '<div style="margin-top:6px">' + spark + '</div><div class="vc-note">' + esc(note) + '</div></div>';
  }

  function bodySvg(colors, selected, opts) { return window.AeroBody ? window.AeroBody.svg(colors, selected, opts) : ""; }

  function amslerSvg(size) {
    size = size || 230; var step = size / 20, lines = "";
    for (var i = 0; i <= 20; i++) lines += '<line x1="' + f(i * step, 1) + '" y1="0" x2="' + f(i * step, 1) + '" y2="' + size + '" stroke="#12305C" stroke-width="0.8"/><line x1="0" y1="' + f(i * step, 1) + '" x2="' + size + '" y2="' + f(i * step, 1) + '" stroke="#12305C" stroke-width="0.8"/>';
    var c = size / 2;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="border-radius:16px;max-width:100%" role="img" aria-label="Amsler grid"><rect width="' + size + '" height="' + size + '" fill="#fff"/>' + lines + '<circle cx="' + c + '" cy="' + c + '" r="5.5" fill="#0B1B33"/></svg>';
  }

  /* tabs: container has .tablist > button.tab[data-tab] and sibling panels [data-panel] */
  function tabs(root_, onChange) {
    var btns = $$(".tab", root_), panels = $$("[data-panel]", root_);
    if (root_.hasAttribute("data-merge")) { var tl = $(".tablist", root_); if (tl) tl.hidden = true; panels.forEach(function (p) { p.hidden = false; }); var first = panels[0].getAttribute("data-panel"); var go = function (name) { var p = root_.querySelector('[data-panel="' + name + '"]'); if (p && name !== first) p.scrollIntoView({ behavior: "smooth", block: "start" }); if (onChange) onChange(name); }; if (onChange) panels.forEach(function (p) { onChange(p.getAttribute("data-panel")); }); return go; }
    function show(name, focus) {
      btns.forEach(function (b) { var on = b.getAttribute("data-tab") === name; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
      if (onChange) onChange(name);
    }
    btns.forEach(function (b, i) {
      b.addEventListener("click", function () { show(b.getAttribute("data-tab")); });
      b.addEventListener("keydown", function (e) {
        var k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!k) return;
        e.preventDefault(); show(btns[(i + k + btns.length) % btns.length].getAttribute("data-tab"), true);
      });
    });
    show(btns[0].getAttribute("data-tab"));
    return show;
  }

  function download(name, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  // file:// support: directory links need an explicit index.html when the site is opened from disk
  if (location.protocol === "file:") document.addEventListener("DOMContentLoaded", function () {
    $$("a[href]").forEach(function (a) { var h = a.getAttribute("href"); if (/\/$/.test(h) && !/^https?:/.test(h)) a.setAttribute("href", h + "index.html"); });
  });

  root.UI = { COLOR: COLOR, DEEP: DEEP, LABEL: LABEL, DOT: DOT, esc: esc, gclass: gclass, $: $, $$: $$, uid: uid, ringGauge: ringGauge, sparkline: sparkline, vitalCard: vitalCard,
    bodySvg: bodySvg, amslerSvg: amslerSvg, tabs: tabs, download: download };
})(window);
