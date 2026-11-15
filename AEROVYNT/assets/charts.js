/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* Tiny dependency-free SVG chart kit: line, bar (grouped/stacked/horizontal), heatmap, radar. Re-renders to the real container width. */
(function (root) {
  "use strict";
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var r1 = function (n) { return Math.round(n * 10) / 10; };

  /* tooltip (hover and tap) */
  var tip;
  function ensureTip() { if (tip) return; tip = document.createElement("div"); tip.className = "chart-tip"; document.body.appendChild(tip);
    function show(e) { var t = e.target.closest && e.target.closest("[data-tip]"); if (!t) { tip.style.opacity = 0; return; }
      tip.textContent = t.getAttribute("data-tip"); tip.style.opacity = 1;
      var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = e.clientY + 16; if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - 12;
      tip.style.left = Math.max(8, x) + "px"; tip.style.top = y + "px"; }
    document.addEventListener("pointermove", show); document.addEventListener("pointerdown", show); document.addEventListener("scroll", function () { tip.style.opacity = 0; }, { passive: true }); }

  function niceTicks(lo, hi, n) {
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var raw = (hi - lo) / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / mag, step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * mag;
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
    for (var v = a; v <= b + step / 2; v += step) t.push(Math.round(v / step * 1e6) / 1e6 * step);
    return t;
  }
  function tickFmt(v) { return Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v * 100) / 100) : String(Math.round(v * 100) / 100); }
  function wrap(text, maxChars) {
    var words = String(text).split(" "), lines = [], cur = "";
    words.forEach(function (w) { if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) lines.push(cur); return lines;
  }
  function multiline(x, y, lines, attrs, lh) { lh = lh || 12; return lines.map(function (l, i) { return '<text x="' + x + '" y="' + (y + i * lh) + '" ' + attrs + '>' + esc(l) + '</text>'; }).join(""); }

  /* mount a draw function so the chart tracks container width */
  function mount(el, draw) {
    ensureTip();
    var last = 0;
    function go() { var w = Math.max(240, Math.floor(el.clientWidth)); if (w === last && el.firstChild) return; last = w; el.innerHTML = draw(w); }
    el.classList.add("chart"); go();
    if (window.ResizeObserver) { if (el.__ro) el.__ro.disconnect(); el.__ro = new ResizeObserver(function () { requestAnimationFrame(go); }); el.__ro.observe(el); }
  }
  function svgOpen(w, h, label) { return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(label || "chart") + '">'; }

  /* ---------------- line chart ---------------- */
  function line(el, o) {
    mount(el, function (W) {
      var H = o.height || 340, m = { l: 46, r: 16, t: o.title ? 40 : 14, b: o.xTitle ? 44 : 30 };
      var cat = o.categories || null, xs = [], ys = [];
      o.series.forEach(function (s) { s.x.forEach(function (x, i) { if (s.y[i] !== null && s.y[i] !== undefined) { ys.push(s.y[i]); xs.push(x); } }); });
      (o.points || []).forEach(function (p) { ys.push(p.y); xs.push(p.x); });
      (o.bands || []).forEach(function (b) { ys.push(b.y0, b.y1); }); (o.hlines || []).forEach(function (h) { ys.push(h.y); });
      var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys), yp = (ymax - ymin) * 0.08 || 1; ymin -= yp; ymax += yp;
      var yt = niceTicks(ymin, ymax, 5); ymin = Math.min(ymin, yt[0]); ymax = Math.max(ymax, yt[yt.length - 1]);
      var xmin, xmax; if (cat) { xmin = -0.5; xmax = cat.length - 0.5; } else { xmin = Math.min.apply(null, xs); xmax = Math.max.apply(null, xs); if (xmax === xmin) { xmax++; xmin--; } var xp = (xmax - xmin) * 0.03; xmin -= xp; xmax += xp; }
      var X = function (x) { return m.l + (x - xmin) / (xmax - xmin) * (W - m.l - m.r); }, Y = function (y) { return H - m.b - (y - ymin) / (ymax - ymin) * (H - m.t - m.b); };
      var s = svgOpen(W, H, o.title);
      if (o.title) s += '<text class="ttl" x="' + m.l + '" y="20">' + esc(o.title) + '</text>';
      yt.forEach(function (v) { if (v < ymin - 1e-9 || v > ymax + 1e-9) return; s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + r1(Y(v)) + '" y2="' + r1(Y(v)) + '" stroke="rgba(31,70,140,.08)"/><text class="tick" x="' + (m.l - 8) + '" y="' + (r1(Y(v)) + 3.5) + '" text-anchor="end">' + tickFmt(v) + '</text>'; });
      s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (H - m.b) + '" y2="' + (H - m.b) + '" stroke="rgba(31,70,140,.15)"/>';
      if (o.vband) s += '<rect x="' + r1(X(o.vband.x0)) + '" y="' + m.t + '" width="' + r1(X(o.vband.x1) - X(o.vband.x0)) + '" height="' + (H - m.t - m.b) + '" fill="rgba(10,132,255,.07)"/>' + (o.vband.label ? '<text class="ann" x="' + r1(X(o.vband.x0) + 4) + '" y="' + (m.t + 11) + '">' + esc(o.vband.label) + '</text>' : "");
      (o.bands || []).forEach(function (b) { s += '<rect x="' + m.l + '" y="' + r1(Y(b.y1)) + '" width="' + (W - m.l - m.r) + '" height="' + r1(Math.max(Y(b.y0) - Y(b.y1), 1)) + '" fill="' + b.fill + '"/>' + (b.label ? '<text class="ann" x="' + (m.l + 6) + '" y="' + (r1(Y(b.y0)) - 5) + '">' + esc(b.label) + '</text>' : ""); });
      (o.hlines || []).forEach(function (h) { s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + r1(Y(h.y)) + '" y2="' + r1(Y(h.y)) + '" stroke="' + h.color + '" stroke-dasharray="2 4" stroke-width="1.4"/><text class="ann" x="' + (W - m.r - 4) + '" y="' + (r1(Y(h.y)) - 4) + '" text-anchor="end">' + esc(h.label) + '</text>'; });
      // x ticks
      if (cat) cat.forEach(function (c, i) { s += '<text class="tick" x="' + r1(X(i)) + '" y="' + (H - m.b + 17) + '" text-anchor="middle">' + esc(c) + '</text>'; });
      else { var xt = niceTicks(xmin, xmax, Math.max(3, Math.floor(W / 90))); xt.forEach(function (v) { if (v >= xmin && v <= xmax) s += '<text class="tick" x="' + r1(X(v)) + '" y="' + (H - m.b + 17) + '" text-anchor="middle">' + tickFmt(v) + '</text>'; }); }
      if (o.xTitle) s += '<text class="tick" x="' + (m.l + (W - m.l - m.r) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(o.xTitle) + '</text>';
      o.series.forEach(function (se) {
        var pts = []; se.x.forEach(function (x, i) { var y = se.y[i]; if (y !== null && y !== undefined) pts.push([cat ? cat.indexOf(x) : x, y, x]); });
        s += '<polyline fill="none" stroke="' + se.color + '" stroke-width="' + (se.width || 3) + '" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return r1(X(p[0])) + "," + r1(Y(p[1])); }).join(" ") + '"/>';
        pts.forEach(function (p) { s += '<circle cx="' + r1(X(p[0])) + '" cy="' + r1(Y(p[1])) + '" r="' + (se.marker || 5) + '" fill="' + se.color + '" stroke="#fff" stroke-width="1.5" data-tip="' + esc(se.name + " · " + p[2] + " · " + tickFmt(p[1])) + '"/>'; });
      });
      (o.points || []).forEach(function (p) { s += '<circle cx="' + r1(X(p.x)) + '" cy="' + r1(Y(p.y)) + '" r="' + (p.r || 8) + '" fill="' + p.color + '" stroke="#fff" stroke-width="3" data-tip="' + esc(p.tip || "") + '"/>'; });
      return s + "</svg>";
    });
  }

  /* ---------------- bar chart ---------------- */
  function bar(el, o) { // o.categories, o.series:[{name,color,values}], o.stacked, o.horizontal
    mount(el, function (W) {
      var horiz = !!o.horizontal, n = o.categories.length, ns = o.series.length;
      var labW = horiz ? Math.min(150, Math.max(90, W * 0.26)) : 0;
      var cw = (W - 46 - 16) / n, maxChars = Math.max(8, Math.floor(cw / 6.4)), wr = o.categories.map(function (c) { return wrap(c, maxChars); });
      var maxLines = horiz ? 1 : Math.max.apply(null, wr.map(function (l) { return l.length; }));
      var H = o.height || 320, m = { l: horiz ? labW : 46, r: 16, t: o.title ? 40 : 14, b: horiz ? 30 : 14 + maxLines * 12 + (o.legend ? 0 : 0) };
      var max = 0; o.categories.forEach(function (_, i) { var tot = 0; o.series.forEach(function (s) { var v = s.values[i] || 0; if (o.stacked) tot += v; else max = Math.max(max, v); }); if (o.stacked) max = Math.max(max, tot); });
      var ticks = niceTicks(0, o.max || max * 1.06, 5), top = ticks[ticks.length - 1];
      var s = svgOpen(W, H, o.title);
      if (o.title) s += '<text class="ttl" x="' + (horiz ? 0 : m.l) + '" y="20">' + esc(o.title) + '</text>';
      var plotW = W - m.l - m.r, plotH = H - m.t - m.b;
      var V = function (v) { return horiz ? m.l + v / top * plotW : H - m.b - v / top * plotH; };
      ticks.forEach(function (t) { if (horiz) s += '<line x1="' + r1(V(t)) + '" x2="' + r1(V(t)) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="rgba(31,70,140,.08)"/><text class="tick" x="' + r1(V(t)) + '" y="' + (H - m.b + 15) + '" text-anchor="middle">' + tickFmt(t) + '</text>';
        else s += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + r1(V(t)) + '" y2="' + r1(V(t)) + '" stroke="rgba(31,70,140,.08)"/><text class="tick" x="' + (m.l - 8) + '" y="' + (r1(V(t)) + 3.5) + '" text-anchor="end">' + tickFmt(t) + '</text>'; });
      var slot = (horiz ? plotH : plotW) / n, gap = slot * 0.22, inner = slot - gap, bw = o.stacked ? inner : inner / ns;
      o.categories.forEach(function (c, i) {
        var pos = (horiz ? m.t : m.l) + i * slot + gap / 2, acc = 0;
        if (horiz) s += '<text class="tick" x="' + (m.l - 8) + '" y="' + r1(pos + inner / 2 + 3.5) + '" text-anchor="end">' + esc(c) + '</text>';
        else s += multiline(r1(m.l + i * slot + slot / 2), H - m.b + 15, wr[i], 'class="tick" text-anchor="middle"');
        o.series.forEach(function (se, j) {
          var v = se.values[i] || 0, tipTxt = esc(se.name + " · " + c + " · " + v + (o.unit || ""));
          if (o.stacked) { if (!v) return; var a = V(acc), b = V(acc + v); acc += v;
            s += horiz ? '<rect x="' + r1(a) + '" y="' + r1(pos) + '" width="' + r1(b - a) + '" height="' + r1(bw) + '" fill="' + se.color + '" rx="3" data-tip="' + tipTxt + '"/>' : '<rect x="' + r1(pos) + '" y="' + r1(b) + '" width="' + r1(bw) + '" height="' + r1(a - b) + '" fill="' + se.color + '" rx="3" data-tip="' + tipTxt + '"/>'; }
          else { var p = pos + j * bw, e = V(v);
            s += horiz ? '<rect x="' + m.l + '" y="' + r1(p) + '" width="' + r1(e - m.l) + '" height="' + r1(bw - 2) + '" fill="' + se.color + '" rx="3" data-tip="' + tipTxt + '"/>' : '<rect x="' + r1(p + 1) + '" y="' + r1(e) + '" width="' + r1(bw - 2) + '" height="' + r1(H - m.b - e) + '" fill="' + se.color + '" rx="3" data-tip="' + tipTxt + '"/>'; }
        });
      });
      return s + "</svg>";
    });
  }

  /* ---------------- heatmap ---------------- */
  function heat(el, o) { // o.z (rows x cols, null allowed), o.x, o.y, o.color(v)->css, o.text(v)->string, o.title, o.tip(r,c,v)
    mount(el, function (W) {
      var rows = o.y.length, cols = o.x.length, labW = Math.min(o.labW || 150, W * 0.38), H = o.height || (rows * (o.cell || 22) + 70);
      var m = { l: labW, r: 8, t: o.title ? 40 : 10, b: 24 }, cw = (W - m.l - m.r) / cols, ch = (H - m.t - m.b) / rows, s = svgOpen(W, H, o.title);
      if (o.title) s += '<text class="ttl" x="0" y="20">' + esc(o.title) + '</text>';
      o.y.forEach(function (lab, r) { s += '<text class="tick" x="' + (m.l - 8) + '" y="' + r1(m.t + r * ch + ch / 2 + 3.5) + '" text-anchor="end">' + esc(lab) + '</text>'; });
      var skip = cw < 24 ? 2 : 1;
      o.x.forEach(function (lab, c) { if (c % skip === 0 || c === cols - 1) s += '<text class="tick" x="' + r1(m.l + c * cw + cw / 2) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(lab) + '</text>'; });
      o.z.forEach(function (row, r) { row.forEach(function (v, c) {
        var fill = v === null || v === undefined ? "rgba(148,163,184,.25)" : o.color(v), tx = v === null || v === undefined ? "" : (o.text ? o.text(v) : "");
        s += '<rect x="' + r1(m.l + c * cw + 1.5) + '" y="' + r1(m.t + r * ch + 1.5) + '" width="' + r1(cw - 3) + '" height="' + r1(ch - 3) + '" rx="5" fill="' + fill + '" data-tip="' + esc(o.tip ? o.tip(r, c, v) : o.y[r] + " · " + o.x[c]) + '"/>';
        if (tx) s += '<text x="' + r1(m.l + c * cw + cw / 2) + '" y="' + r1(m.t + r * ch + ch / 2 + 4) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#0B1B33" pointer-events="none">' + esc(tx) + '</text>'; }); });
      return s + "</svg>";
    });
  }

  /* ---------------- radar ---------------- */
  function radar(el, o) { // o.labels, o.values, o.max, o.title
    mount(el, function (W) {
      var H = Math.min(380, Math.max(300, W * 0.82)), cx = W / 2, cy = H / 2 + 14, R = Math.min(W / 2 - 78, H / 2 - 64), n = o.labels.length, max = o.max || 5;
      var ang = function (i) { return -Math.PI / 2 + i * 2 * Math.PI / n; }, P = function (i, v) { return [cx + Math.cos(ang(i)) * R * v / max, cy + Math.sin(ang(i)) * R * v / max]; };
      var s = svgOpen(W, H, o.title); if (o.title) s += '<text class="ttl" x="0" y="20">' + esc(o.title) + '</text>';
      for (var lv = 1; lv <= max; lv++) { s += '<polygon fill="' + (lv === max ? "rgba(255,255,255,.35)" : "none") + '" stroke="rgba(31,70,140,.14)" points="' + o.labels.map(function (_, i) { var p = P(i, lv); return r1(p[0]) + "," + r1(p[1]); }).join(" ") + '"/>'; s += '<text class="ann" x="' + (cx + 4) + '" y="' + r1(cy - R * lv / max + 10) + '">' + lv + '</text>'; }
      o.labels.forEach(function (l, i) { var p = P(i, max), q = P(i, max * 1.13), anc = Math.abs(q[0] - cx) < 8 ? "middle" : q[0] > cx ? "start" : "end";
        s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + r1(p[0]) + '" y2="' + r1(p[1]) + '" stroke="rgba(31,70,140,.14)"/>' + multiline(r1(q[0]), r1(q[1] + 3 - (wrap(l, 14).length - 1) * 6), wrap(l, 14), 'class="tick" text-anchor="' + anc + '"', 12); });
      var pts = o.values.map(function (v, i) { var p = P(i, v); return r1(p[0]) + "," + r1(p[1]); });
      s += '<polygon points="' + pts.join(" ") + '" fill="rgba(10,132,255,.22)" stroke="#0A84FF" stroke-width="3" stroke-linejoin="round"/>';
      o.values.forEach(function (v, i) { var p = P(i, v); s += '<circle cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="5" fill="#0A84FF" stroke="#fff" stroke-width="2" data-tip="' + esc(o.labels[i] + " · " + v + " / " + max) + '"/>'; });
      return s + "</svg>";
    });
  }

  root.Charts = { line: line, bar: bar, heat: heat, radar: radar };
})(window);
