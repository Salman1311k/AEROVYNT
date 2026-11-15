/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT Home: runs the real check-in engine, plots the cached benchmark, and draws a quiet starfield. */
(function () {
  "use strict";
  var C = window.Coach, UI = window.UI, esc = UI.esc, $ = UI.$, IND = C.IND;
  var DATA = window.AERO_DATA, seed = DATA.seed, today = seed[seed.length - 1].day + 1;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COL = { emerald: "#34D399", amber: "#FBBF24", crimson: "#FB7185" };
  var END = { emerald: "#22D3EE", amber: "#FDE68A", crimson: "#FDA4AF" };
  var HEAD = { emerald: "Normal for you", amber: "Watch and re-measure", crimson: "Act now" };
  var LAB = { emerald: "Normal", amber: "Watch", crimson: "Action" };
  var DAYS = [["Normal day", "Normal day"], ["Fluid shift + poor sleep", "Fluid shift"], ["Infection onset", "Infection onset"], ["Possible clot (emergency)", "Urgent symptoms"]];

  /* ---------- starfield (drawn once, no animation) ---------- */
  (function stars() {
    var cv = $("#stars"); if (!cv || !cv.getContext) return;
    function draw() {
      var r = cv.parentNode.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2), ctx = cv.getContext("2d");
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); ctx.scale(d, d);
      var n = Math.round(r.width * r.height / 5200), s = 7;
      for (var i = 0; i < n; i++) {
        s = (s * 16807) % 2147483647; var x = (s / 2147483647) * r.width;
        s = (s * 16807) % 2147483647; var y = (s / 2147483647) * r.height;
        s = (s * 16807) % 2147483647; var k = s / 2147483647;
        ctx.globalAlpha = .25 + k * .6; ctx.fillStyle = k > .86 ? "#9EE7FF" : "#fff";
        ctx.beginPath(); ctx.arc(x, y, .4 + k * 1.1, 0, 6.2832); ctx.fill();
      }
    }
    draw(); var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(draw, 150); });
  })();

  /* ---------- live demo ---------- */
  var curEnv = "mars_transit", curDay = "Infection onset";
  var PLACES = [["iss", "Low Earth orbit"], ["moon", "Moon"], ["mars_transit", "Mars transit"], ["conjunction", "No link"]];
  function assess(name) {
    var sc = C.SCENARIOS[name], values = {}, sym = {};
    C.ORDER.forEach(function (k) { values[k] = sc[k]; });
    Object.keys(C.SYMPTOMS).forEach(function (k) { sym[k] = sc.sym.indexOf(k) >= 0; });
    return C.assessCheckin(values, sym, seed, curEnv, today);
  }
  function changes(A) {
    var rows = [];
    C.ORDER.forEach(function (k) { var v = A.indicators[k]; if (v.status === "amber" || v.status === "crimson") rows.push({ st: v.status, label: IND[k].label, val: C.fixed(v.value, IND[k].dec) + " " + IND[k].unit, why: v.reasons[v.reasons.length - 1] }); });
    Object.keys(A.symptoms).forEach(function (k) { if (A.symptoms[k]) rows.push({ st: C.SYMPTOMS[k][1], label: C.SYMPTOMS[k][0], val: "reported", why: "" }); });
    rows.sort(function (a, b) { return (b.st === "crimson") - (a.st === "crimson"); });
    return rows.slice(0, 3);
  }
  function ring(score, st) {
    var r = 52, c = 2 * Math.PI * r, off = c * (1 - score / 100), id = UI.uid("hg");
    return '<svg class="ring-svg-d" viewBox="0 0 128 128" width="116" height="116" role="img" aria-label="Readiness ' + score + ' out of 100"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + COL[st] + '"/><stop offset="1" stop-color="' + END[st] + '"/></linearGradient></defs>' +
      '<circle cx="64" cy="64" r="52" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="10"/>' +
      '<circle class="ring-arc" cx="64" cy="64" r="52" fill="none" stroke="url(#' + id + ')" stroke-width="10" stroke-linecap="round" transform="rotate(-90 64 64)" style="--c:' + c.toFixed(1) + ';--o:' + off.toFixed(1) + '"/>' +
      '<text x="64" y="68" text-anchor="middle" font-size="38" font-weight="700" fill="#fff" font-family="Bricolage Grotesque,Inter,sans-serif">' + score + '</text>' +
      '<text x="64" y="88" text-anchor="middle" font-size="10" font-weight="600" fill="#9FB6DD" font-family="Inter,sans-serif">readiness</text></svg>';
  }
  function render(name) {
    assess(name); /* warm-up so the timing below reflects steady state, not first-run JIT */
    var t0 = performance.now(), A = assess(name), ms = performance.now() - t0;
    curDay = name; var T = window.Delay.triage(A, C.ENVS[curEnv]);
    var o = A.overall, rows = changes(A), pj = C.packetJson(C.buildPacket(today, A)), bytes = new Blob([pj]).size;
    var chg = rows.length ? rows.map(function (r) { return '<li><span class="dot" style="background:' + COL[r.st] + '"></span><span><strong>' + esc(r.label) + '</strong> ' + esc(r.val) + (r.why ? '<span class="why">' + esc(r.why) + '</span>' : "") + '</span></li>'; }).join("")
      : '<li><span class="dot" style="background:' + COL.emerald + '"></span><span>All ten readings sit inside this astronaut’s own range.</span></li>';
    var acts = A.actions.slice(0, 2).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("");
    $("#demo-body").innerHTML =
      '<div class="demo-top">' + ring(A.readiness, o) + '<div><span class="st-chip st-' + o + '">' + LAB[o] + '</span><div class="demo-head">' + HEAD[o] + '</div>' +
      '<div class="demo-sub">' + (o === "crimson" && !A.n_crimson ? A.n_amber + " indicators off together: escalated as a pattern" : A.n_amber + " watch, " + A.n_crimson + " action") + '</div></div></div>' +
      '<div class="demo-clock ' + T.mode + '"><b>' + esc(T.head) + '</b><span>' + esc(T.body) + '</span><i>' + T.fast.length + ' fast-clock · ' + T.slow.length + ' slow-clock</i></div>' +
      '<h3 class="demo-h">What changed</h3><ul class="demo-list">' + chg + '</ul><h3 class="demo-h">What to do now</h3><ol class="demo-acts">' + acts + '</ol>' +
      '<a class="demo-open" href="copilot/#scenario=' + encodeURIComponent(name) + '">Open this day in the Co-Pilot</a>';
    var pk = JSON.parse(pj), top = rows.slice(0, 3);
    $("#packet").innerHTML = '<div class="pk-t">Report for the flight surgeon</div><div class="pk-m">Day ' + today + ' · ' + esc(LAB[o]) + ' · readiness ' + A.readiness + '</div>' +
      (top.length ? '<ul>' + top.map(function (r) { return '<li><span class="dot" style="background:' + COL[r.st] + '"></span>' + esc(r.label) + ' <b>' + esc(r.val) + '</b></li>'; }).join("") + '</ul>' : '<div class="pk-m">All readings are in the normal range.</div>');
    UI.$$("#demo-days button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-d") === name); });
  }
  $("#demo-days").innerHTML = DAYS.map(function (d) { return '<button type="button" data-d="' + esc(d[0]) + '">' + esc(d[1]) + "</button>"; }).join("");
  $("#demo-days").addEventListener("click", function (e) { var b = e.target.closest("[data-d]"); if (b) render(b.getAttribute("data-d")); });
  $("#demo-env").innerHTML = PLACES.map(function (p) { return '<button type="button" data-e="' + p[0] + '">' + esc(p[1]) + "</button>"; }).join("");
  function markEnv() { UI.$$("#demo-env button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-e") === curEnv); }); }
  $("#demo-env").addEventListener("click", function (e) { var b = e.target.closest("[data-e]"); if (b) { curEnv = b.getAttribute("data-e"); markEnv(); render(curDay); } });
  markEnv(); render("Infection onset");

  /* ---------- benchmark: 100 healthy days ---------- */
  var B = DATA.benchmark.scenarios, KEYS = Object.keys(B);
  var SHORT = { "Strong Multi-System (1.0×)": "Strong, many signals", "Subtle Multi-System (0.5× + CUSUM)": "Subtle, many signals", "Slow Metabolic Drift (14d ramp)": "Slow glucose drift", "HR / Autonomic Infection": "Infection (heart and temperature)", "Sleep-Only Disruption (Hard Case)": "Sleep only (hard case)" };
  var cur = KEYS[0], started = false, grids = {};
  function mk(id) { var el = $(id), h = ""; for (var i = 0; i < 100; i++) h += "<i></i>"; el.innerHTML = h; return UI.$$("i", el); }
  grids.earth = mk("#d-earth"); grids.naive = mk("#d-naive"); grids.aero = mk("#d-aero");
  function paint(list, n) { list.forEach(function (d, i) { var on = i < n; d.style.transitionDelay = on && !reduce ? (i * 9) + "ms" : "0ms"; d.classList.toggle("on", on); }); }
  function pct(x) { return (Math.round(x * 10) / 10).toString().replace(/\.0$/, "") + "%"; }
  function days(n) { return n + (n === 1 ? " day" : " days"); }
  function scenario(k) {
    cur = k; var s = B[k], f = s.false_alarm_pct, d = s.detected_within_window_pct, m = s.median_delay_days;
    $("#v-earth").textContent = pct(f.earth_no_sleep); $("#v-naive").textContent = pct(f.naive_personal); $("#v-aero").textContent = pct(f.action_all);
    var ci = DATA.robust && DATA.robust.benchmark_ci && DATA.robust.benchmark_ci[k], rg = function (g, q) { return ci ? " (95% range " + Math.round(ci[g][q][1]) + "–" + Math.round(ci[g][q][2]) + ")" : ""; };
    $("#c-earth").textContent = "Out of every 100 healthy days, about " + Math.round(f.earth_no_sleep) + " raise an alarm" + rg("false_alarm_pct", "earth_no_sleep") + " even with the sleep rule left out (" + Math.round(f.earth) + " with it).";
    $("#c-naive").textContent = "About " + Math.round(f.naive_personal) + " of 100 healthy days" + rg("false_alarm_pct", "naive_personal") + ". It catches " + pct(d.naive_personal) + " of events. AEROVYNT’s comparable earlier “watch” level flags " + Math.round(f.watch) + " of 100 healthy days and catches " + pct(d.watch) + ", so on independent noise the two are close and AEROVYNT’s edge is mostly fewer false alarms.";
    $("#c-aero").textContent = "Out of every 100 healthy days, about " + Math.round(f.action_all) + " raise an action alert" + rg("false_alarm_pct", "action_all") + ".";
    $("#f-act").textContent = pct(d.action_all); $("#t-act").textContent = "of " + s.n_events + " SIMULATED medical events caught at action level (including the 7-night sleep floor) within " + days(s.detect_window_days) + ", a median " + days(m.action_all) + " after onset.";
    $("#f-watch").textContent = pct(d.watch); $("#t-watch").textContent = "of the same simulated events caught at the earlier watch level, a median " + days(m.watch) + " after onset.";
    if ($("#hs-e")) { var H0 = B[KEYS[0]]; $("#hs-e").textContent = pct(H0.false_alarm_pct.earth_no_sleep); $("#hs-a").textContent = pct(H0.false_alarm_pct.action_all); $("#hs-d").textContent = pct(H0.detected_within_window_pct.action_all); var all = KEYS.map(function (q) { return B[q].detected_within_window_pct.action_all; }); if ($("#hs-r")) $("#hs-r").textContent = Math.round(Math.min.apply(null, all)) + "–" + Math.round(Math.max.apply(null, all)) + "%"; }
    if ($("#proof-weak")) { var DD = B[KEYS[0]]; $("#proof-weak").innerHTML = "<b>Where it is weak:</b> action-level detection in the five simulated scenarios ranges from " + Math.round(Math.min.apply(null, KEYS.map(function (q) { return B[q].detected_within_window_pct.action_all; }))) + "% to " + Math.round(Math.max.apply(null, KEYS.map(function (q) { return B[q].detected_within_window_pct.action_all; }))) + "%; subtle, slow-drift and sleep-only changes are the hard cases, and the earlier Watch level catches more of them. The limits were tuned on this same simulator."; }
    UI.$$("#scn button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-k") === k); });
    if (started) { paint(grids.earth, Math.round(f.earth_no_sleep)); paint(grids.naive, Math.round(f.naive_personal)); paint(grids.aero, Math.round(f.action_all)); }
  }
  $("#scn").innerHTML = KEYS.map(function (k) { return '<button type="button" data-k="' + esc(k) + '">' + esc(SHORT[k] || k) + "</button>"; }).join("");
  $("#scn").addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (b) scenario(b.getAttribute("data-k")); });
  scenario(cur);
  function go() { started = true; paint(grids.earth, Math.round(B[cur].false_alarm_pct.earth_no_sleep)); paint(grids.naive, Math.round(B[cur].false_alarm_pct.naive_personal)); paint(grids.aero, Math.round(B[cur].false_alarm_pct.action_all)); }
  if ("IntersectionObserver" in window) { var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); go(); } }, { threshold: .3 }); io.observe($("#proof")); } else go();

  /* ---------- where it breaks: straight from the stress-test file ---------- */
  (function () {
    var RB = DATA.robust, el = $("#proof-break"); if (!el || !RB) return; var ST = RB.stress, avg = function (c, g) { var t = 0; ST.scenarios.forEach(function (n) { t += ST.cells[c][n].false_alarm_pct[g][0]; }); return t / ST.scenarios.length; };
    var osc = ST.conditions.filter(function (c) { return c.indexOf("oscillating") >= 0; })[0], cor = ST.conditions.filter(function (c) { return c.indexOf("Correlated") >= 0; })[0];
    el.textContent = "with slow 25–45 day cycles added, AEROVYNT’s action false alarms average " + Math.round(avg(osc, "action_all")) + "% against " + Math.round(avg(osc, "naive_personal")) + "% for the plain personal z-score, so on that kind of noise the simple rule wins; with day-to-day memory in the data they are " + Math.round(avg(cor, "action_all")) + "% and " + Math.round(avg(cor, "naive_personal")) + "%.";
  })();

  /* ---------- step 1: what is measured ---------- */
  $("#vitals").innerHTML = ["Blood pressure", "Heart rate", "Temperature", "Glucose", "SpO₂", "Sleep", "Mood", "Hydration", "Exercise"].map(function (v) { return "<span>" + v + "</span>"; }).join("") + '<span class="x">Symptom check</span><span class="x">Amsler grid</span>';

  /* ---------- step 2: a reading against its own baseline ---------- */
  (function compare() {
    var key = "hr_bpm", all = seed.map(function (r) { return r[key]; }), hist = all.slice(-14), v = C.SCENARIOS["Infection onset"][key];
    var a = C.assessIndicator(key, v, all), base = a.base, mad = C.median(hist.map(function (x) { return Math.abs(x - C.median(hist)); }));
    var sg = Math.max(1.4826 * mad, IND[key].floor), lo = base - 3 * sg, hi = base + 3 * sg;
    var W = 300, H = 152, pl = 10, pr = 14, pt = 30, pb = 24, n = hist.length + 1;
    var ymin = Math.min(lo, v, Math.min.apply(null, hist)) - 3, ymax = Math.max(hi, v, Math.max.apply(null, hist)) + 3;
    var X = function (i) { return pl + i * (W - pl - pr) / (n - 1); }, Y = function (y) { return pt + (ymax - y) * (H - pt - pb) / (ymax - ymin); };
    var pts = hist.map(function (y, i) { return X(i).toFixed(1) + "," + Y(y).toFixed(1); }).join(" ");
    var lx = X(n - 2), ly = Y(hist[n - 2]), tx = X(n - 1), ty = Y(v);
    var dots = hist.map(function (y, i) { return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(y).toFixed(1) + '" r="2.4" fill="#0A84FF"/>'; }).join("");
    var sign = a.delta >= 0 ? "+" : "";
    $("#cmp-vis").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Heart rate today is ' + C.fixed(a.delta, 0) + ' bpm from the astronaut’s own baseline">' +
      '<rect x="' + pl + '" y="' + Y(hi).toFixed(1) + '" width="' + (W - pl - pr) + '" height="' + (Y(lo) - Y(hi)).toFixed(1) + '" rx="8" fill="rgba(10,132,255,.12)"/>' +
      '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(base).toFixed(1) + '" y2="' + Y(base).toFixed(1) + '" stroke="#0A84FF" stroke-opacity=".5" stroke-dasharray="4 4"/>' +
      '<text x="' + (pl + 6) + '" y="' + (Y(hi) + 13).toFixed(1) + '" font-size="9.5" font-weight="600" fill="#0A4FA6">own normal range</text>' +
      '<polyline points="' + pts + '" fill="none" stroke="#0A84FF" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' + dots +
      '<line x1="' + lx.toFixed(1) + '" y1="' + ly.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="#F59E0B" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="10" fill="#F59E0B" fill-opacity=".22"/><circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="5.5" fill="#F59E0B" stroke="#fff" stroke-width="2"/>' +
      '<text x="' + (tx - 12).toFixed(1) + '" y="16" text-anchor="end" font-size="11.5" font-weight="700" fill="#92400E">Today ' + v + " bpm, " + sign + C.fixed(a.delta, 0) + " vs baseline " + C.fixed(base, 0) + "</text>" +
      '<text x="' + pl + '" y="' + (H - 6) + '" font-size="9.5" fill="#5B6B85">14 days ago</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end" font-size="9.5" fill="#5B6B85">today</text></svg>';
  })();

  /* ---------- delay slider ---------- */
  (function () {
    var r = $("#rt"); if (!r || !window.Delay) return;
    function place(m) { return m < 0 ? "no link" : m === 0 ? "Space station" : m < 1 ? "Moon" : m < 24 ? "Mars, close" : "Mars, far"; }
    function upd(rt) {
      var m = rt < 0 ? null : rt;
      $("#rt-out").textContent = m === null ? "No link" : (m < 1 ? "Under 1 min" : Math.round(m) + " min") + " round trip · " + place(rt);
      [["fast", "#adv-fast"], ["slow", "#adv-slow"]].forEach(function (x) { var a = Delay.advice(x[0], m); $(x[1]).innerHTML = "<b>" + esc(a.head) + "</b><span>" + esc(a.body) + "</span>"; });
      r.style.setProperty("--p", (m === null ? 100 : Math.min(100, m / 44 * 100)) + "%");
    }
    r.addEventListener("input", function () { upd(+r.value); });
    $("#dslider").addEventListener("click", function (e) { var b = e.target.closest("[data-rt]"); if (!b) return; var v = parseFloat(b.getAttribute("data-rt")); if (v >= 0) r.value = v; upd(v); });
    upd(44);
  })();

  /* ---------- two clocks: numbers come from the cached simulation ---------- */
  (function () {
    var f = $("#ck-fast"), sl = $("#ck-slow"); if (!f || !sl) return;
    var med = [], wfa = [], efa = []; KEYS.forEach(function (k) { var x = B[k]; med.push(x.median_delay_days.watch); wfa.push(x.false_alarm_pct.watch); efa.push(x.false_alarm_pct.earth_no_sleep); });
    var rg = function (a) { var lo = Math.round(Math.min.apply(null, a)), hi = Math.round(Math.max.apply(null, a)); return lo === hi ? String(lo) : lo + " to " + hi; };
    f.textContent = "No learning period. Runs on the device in under 1 ms.";
    sl.textContent = "Simulated events: Watch flag a median " + (Math.round(Math.min.apply(null, med) * 10) / 10) + " to " + (Math.round(Math.max.apply(null, med) * 10) / 10) + " days after onset, with " + rg(wfa) + " of 100 healthy days flagged against " + rg(efa) + " for fixed limits.";
  })();
})();
