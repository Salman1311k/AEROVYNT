/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT Co-Pilot page (port of views/copilot.py). State lives in sessionStorage so it survives page navigation, never leaves the browser. */
(function () {
  "use strict";
  var C = window.Coach, UI = window.UI, esc = UI.esc, $ = UI.$, COLOR = UI.COLOR, LABEL = UI.LABEL, DOT = UI.DOT, IND = C.IND, ORDER = C.ORDER;
  var ENV_KEYS = Object.keys(C.ENVS), KEY = "aerovynt_copilot_v1";

  /* ---------------- state ---------------- */
  var seed = window.AERO_DATA.seed;
  var S = { crew: [], today: seed[seed.length - 1].day + 1, env: "mars_transit", values: {}, symptoms: {}, zone: "Core & Metabolic", trend: ORDER[0], flash: null, viewedHazards: false };
  function scenario(name) {
    var sc = C.SCENARIOS[name];
    ORDER.forEach(function (k) { S.values[k] = sc[k]; });
    Object.keys(C.SYMPTOMS).forEach(function (k) { S.symptoms[k] = sc.sym.indexOf(k) >= 0; });
  }
  scenario("Normal day");
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved && saved.v === 1) { S.crew = saved.crew; S.today = saved.today; S.env = ENV_KEYS.indexOf(saved.env) >= 0 ? saved.env : S.env; S.values = saved.values; S.symptoms = saved.symptoms; S.zone = saved.zone || S.zone; S.viewedHazards = !!saved.viewedHazards; } } catch (e) {}
  var hm = /^#scenario=(.+)$/.exec(location.hash || ""); // deep link from the Home demo
  if (hm) { try { var nm = decodeURIComponent(hm[1]); if (C.SCENARIOS[nm]) scenario(nm); } catch (e) {} }
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify({ v: 1, crew: S.crew, today: S.today, env: S.env, values: S.values, symptoms: S.symptoms, zone: S.zone, viewedHazards: S.viewedHazards })); } catch (e) {} }
  var rb = document.getElementById("reset-all"); if (rb) rb.addEventListener("click", function () { try { sessionStorage.removeItem(KEY); } catch (e) {} location.hash = ""; location.reload(); });
  function history() { return seed.concat(S.crew); }

  /* ---------------- derived ---------------- */
  function seriesFor(h, k) {
    var col = h.map(function (r) { return r[k]; }).filter(C.isNum).slice(-14), v = col.concat([S.values[k]]), lo = null, hi = null;
    if (col.length >= C.MIN_BASE) { var med = C.median(col), sg = Math.max(1.4826 * C.median(col.map(function (x) { return Math.abs(x - med); })), IND[k].floor); lo = med - 2 * sg; hi = med + 2 * sg; }
    return { vals: v, lo: lo, hi: hi };
  }
  var A, H, prog, packet, packetJson;
  function compute() {
    H = history(); A = C.assessCheckin(S.values, S.symptoms, H, S.env, S.today); prog = C.progress(H, S.today);
    packet = C.buildPacket(S.today, A); packetJson = C.packetJson(packet);
  }
  function cardFor(k, id, icon, label, alt) {
    var a = A.indicators[k], sp = seriesFor(H, k), st = a.status, v = S.values[k];
    if (alt) st = C.worst([st, A.indicators[alt].status]);
    var val = C.isNum(v) ? C.fixed(v, IND[k].dec) : "—";
    if (alt) val = (C.isNum(v) ? C.fixed(v, 0) : "—") + (alt === "stress" ? " · " : "/") + (C.isNum(S.values[alt]) ? C.fixed(S.values[alt], 0) : "—");
    var delta = a.delta === null ? null : C.signed(a.delta, IND[k].dec);
    var note = st !== "emerald" ? a.reasons[0] : "Within your personal range";
    if (alt && A.indicators[alt].status !== "emerald" && A.indicators[alt].status === st && a.status === "emerald") note = A.indicators[alt].reasons[0];
    if (st === "unknown") note = "Not measured: never treated as normal";
    return UI.vitalCard(id, label, icon, val, alt === "stress" ? "mood · stress" : alt ? "mmHg" : IND[k].unit, st, note, UI.sparkline(sp.vals, sp.lo, sp.hi, st !== "emerald" && st !== "unknown" ? COLOR[st] : "#0A84FF", id), delta);
  }

  /* ---------------- renderers ---------------- */
  function link() { var e = C.ENVS[S.env]; return e.blackout ? "Blackout" : (!e.one_way_min || e.one_way_min < 1 ? "Live link" : C.fixed(2 * e.one_way_min, 0) + " min round trip"); }
  function renderTop() {
    var e = C.ENVS[S.env], st = A.overall;
    $("#topbar").innerHTML = '<div class="brand" style="cursor:default"><div class="logo" style="font-size:22px">🧑‍🚀</div><div><div class="brand-name">CO-PILOT</div><div class="brand-sub">Daily self-check · guidance on board</div></div></div>' +
      '<div class="chips"><span class="chip"><span class="dot ' + (st === "crimson" ? "pulse" : "") + '" style="background:' + COLOR[st] + '"></span>' + LABEL[st] + '</span><span class="chip">Mission day ' + S.today + '</span>' +
      '<span class="chip">' + esc(e.icon) + ' ' + esc(e.name) + '</span><span class="chip">' + esc(link()) + '</span></div>';
  }
  function renderFlash() { var el = $("#flash"); el.hidden = !S.flash; el.textContent = S.flash || ""; }
  function replyClock() {
    var e = C.ENVS[S.env], T = window.Delay.triage(A, e), rt = T.rt, cls = { fast: "g-bad", slow: "g-warn", none: "g-ok" }[T.mode];
    var l2 = T.blackout ? "next link" : (rt < 1 ? "instant" : "+" + window.Delay.fmtMin(rt / 2)), l3 = T.blackout ? "weeks away" : (rt < 1 ? "instant" : "+" + window.Delay.fmtMin(rt));
    var tags = '<span class="tag tag-fast">Fast clock · ' + T.fast.length + '</span><span class="tag tag-slow">Slow clock · ' + T.slow.length + '</span>';
    var who = T.fast.length ? '<div class="rc-who">' + esc(T.fast.slice(0, 2).map(function (x) { return x.label; }).join("; ")) + '</div>' : "";
    return '<div class="g ' + cls + ' rc" style="min-height:236px"><div class="kicker">Reply clock · ' + esc(e.name) + '</div><div class="rc-head">' + esc(T.head) + '</div><p class="rc-body">' + esc(T.body) + '</p>' + who +
      '<ol class="rc-line"><li><b>On board</b><span>under 1 ms</span></li><li><b>Report reaches Earth</b><span>' + l2 + '</span></li><li><b>Earliest reply</b><span>' + l3 + '</span></li></ol><div>' + tags + '</div></div>';
  }
  function renderHero() {
    var o = A.overall, headline = { crimson: "Action needed now", amber: "Watch and re-measure", emerald: "Normal for you" }[o];
    var sub = { crimson: "One or more indicators crossed a safety limit or a multi-signal pattern was detected.", amber: "Something drifted from your personal baseline. Act early and re-check.", emerald: "Every measured indicator is inside your personal range." }[o];
    var acts = A.actions.slice(0, 4).map(function (a, i) { return '<div class="act"><div class="n" style="background:' + (i === 0 ? COLOR[o] : "#0A84FF") + '">' + (i + 1) + '</div><div>' + esc(a) + '</div></div>'; }).join("");
    $("#hero").innerHTML =
      '<div class="' + UI.gclass(o) + '" style="min-height:236px"><div class="kicker">Health readiness</div><div class="ring-wrap">' + UI.ringGauge(A.readiness, o, 150, "rgHero") +
      '<div><span class="pill pill-' + o + '">' + LABEL[o] + '</span><div class="hero-title">' + headline + '</div><div class="hero-sub">' + sub + '</div><div class="hero-sub" style="margin-top:8px">' +
      A.n_amber + ' watch · ' + A.n_crimson + ' action · ' + A.missing.length + ' unmeasured</div></div></div></div>' +
      '<div class="g" style="min-height:236px"><div class="kicker">What to do now</div>' + acts + '</div>' +
      replyClock();

  }
  function renderCards() {
    var symOn = Object.keys(S.symptoms).filter(function (k) { return S.symptoms[k]; }), names = symOn.map(function (k) { return C.SYMPTOMS[k][0]; });
    var symSt = symOn.length ? C.worst(symOn.map(function (k) { return C.SYMPTOMS[k][1]; })) : "emerald";
    var cards = [cardFor("sys_bp", "bp", "🩸", "Blood pressure", "dia_bp"), cardFor("hr_bpm", "hr", "❤️", "Resting heart rate"), cardFor("temp_c", "tp", "🌡️", "Temperature"),
      cardFor("spo2_pct", "ox", "🫁", "Blood oxygen"), cardFor("glucose", "gl", "🧪", "Glucose"), cardFor("sleep_hrs", "sl", "😴", "Sleep"), cardFor("mood", "md", "🧠", "Mood · Stress", "stress"),
      cardFor("urine_color", "hy", "💧", "Hydration"), cardFor("exercise_min", "ex", "🏃", "Exercise"),
      UI.vitalCard("sy", "Symptoms", "🚩", String(symOn.length), "reported", symSt, names.length ? names.join("; ").slice(0, 90) : "None reported", UI.sparkline([0, 0], null, null, "#0A84FF", "sy"))];
    $("#cards").innerHTML = cards.join("");
  }
  /* tamper-evident report: SHA-256 over the exact report text. Detects edits; it is not an identity signature. */
  var sealed = null;
  function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); });
  }
  function sealPacket() {
    var txt = packetJson; $("#packet-code").textContent = C.packetJson(packet, 2);
    sha256(txt).then(function (h) {
      if (txt !== packetJson) return;
      sealed = { format: "aerovynt-report/1", payload: txt, sha256: h, alg: "SHA-256" };
      $("#seal-code").textContent = h ? h.slice(0, 16) : "unavailable (needs https)";
    });
  }
  function verifyText(raw) {
    var o; try { o = JSON.parse(raw); } catch (e) { return Promise.resolve({ ok: false, msg: "Not a sealed report: could not read the JSON." }); }
    if (!o || typeof o.payload !== "string" || !o.sha256) return Promise.resolve({ ok: false, msg: "Not a sealed report: payload or seal missing." });
    return sha256(o.payload).then(function (h) {
      if (h === null) return { ok: false, msg: "Verification needs a secure (https) page." };
      return h === o.sha256 ? { ok: true, msg: "Verified: authentic and unchanged since sealing (day " + ((JSON.parse(o.payload) || {}).day || "?") + ")." } : { ok: false, msg: "FAILED: the report was changed after sealing." };
    });
  }
  function renderTriage() {
    var rows = ORDER.map(function (k) { var v = A.indicators[k], val = v.value === null ? "—" : C.fixed(v.value, IND[k].dec), base = v.base === null ? "—" : C.fixed(v.base, IND[k].dec);
      return "<tr><td><strong>" + esc(IND[k].label) + "</strong></td><td>" + val + "</td><td class='mut'>" + base + "</td><td><span class='pill pill-" + v.status + "'>" + LABEL[v.status] + "</span></td></tr>"; }).join("");
    $("#triage").innerHTML = '<div class="kicker">Details vs your baseline</div><div style="overflow:auto"><table class="tbl"><tr><th>Indicator</th><th>Today</th><th>Baseline</th><th>Status</th></tr>' + rows + '</table></div>';
    sealPacket();
  }
  var SHORT = { sys_bp: "BP", hr_bpm: "HR", temp_c: "Temp", spo2_pct: "SpO\u2082", glucose: "Glu", sleep_hrs: "Sleep", mood: "Mood", stress: "Stress", urine_color: "Hydr", exercise_min: "Ex" };
  function zoneReadout(zn) {
    var zi = C.ZONES[zn], parts = [];
    zi.indicators.forEach(function (k) { if (k === "dia_bp") return; var v = A.indicators[k]; if (v.value === null) return;
      if (k === "sys_bp") { var d = A.indicators.dia_bp; parts.push("BP " + C.fixed(v.value, 0) + "/" + (d.value === null ? "–" : C.fixed(d.value, 0))); }
      else parts.push(SHORT[k] + " " + C.fixed(v.value, IND[k].dec)); });
    var sx = zi.symptoms.filter(function (k) { return A.symptoms[k]; }).length; if (sx) parts.push(sx + " symptom" + (sx > 1 ? "s" : ""));
    return parts.slice(0, 2).join(" · ");
  }
  function renderBody() {
    var Z = A.zones, colors = {}, vals = {}; Object.keys(Z).forEach(function (z) { colors[z] = COLOR[Z[z]]; vals[z] = zoneReadout(z); });
    $("#bodysvg").innerHTML = UI.bodySvg(colors, S.zone, { vals: vals, hr: S.values.hr_bpm });
    $("#zonebtns").innerHTML = Object.keys(Z).map(function (z) { return '<button class="btn btn-sm" data-zone="' + esc(z) + '" aria-pressed="' + (z === S.zone) + '">' + DOT[Z[z]] + '  ' + esc(z) + '</button>'; }).join("");
    var zn = S.zone, zi = C.ZONES[zn], zs = Z[zn], lines = "";
    zi.indicators.forEach(function (k) { var v = A.indicators[k], val = v.value === null ? "not measured" : C.fixed(v.value, IND[k].dec) + " " + IND[k].unit;
      lines += "<div class='act'><div>" + DOT[v.status] + "</div><div><strong>" + esc(IND[k].label) + ":</strong> " + esc(val) + "<br><span class='mut'>" + esc(v.reasons.join("; ")) + "</span></div></div>"; });
    zi.symptoms.forEach(function (k) { if (A.symptoms[k]) lines += "<div class='act'><div>🚩</div><div><strong>" + esc(C.SYMPTOMS[k][0]) + "</strong></div></div>"; });
    var za = []; zi.indicators.forEach(function (k) { var st = A.indicators[k].status; if (st === "amber" || st === "crimson") za = za.concat(IND[k][st]); });
    zi.symptoms.forEach(function (k) { if (A.symptoms[k]) za.push(C.SYMPTOMS[k][3]); });
    var ah = za.map(function (a) { return "<div class='act'><div>➜</div><div>" + esc(a) + "</div></div>"; }).join("") || "<div class='act'><div>✓</div><div>Keep your routine; no action needed now.</div></div>";
    var hz = window.AeroBody.hazardsFor(zn, C, C.ENVS[S.env]).map(function (h) { return '<span class="hz-chip" title="' + esc(C.HAZARDS[h.key].blurb) + '">' + h.icon + ' ' + esc(h.name) + (h.level ? ' <b>' + h.level + '/5</b>' : '') + '</span>'; }).join("");
    var measure = zi.indicators.map(function (k) { return '<button class="btn btn-sm" data-measure="' + k + '" type="button">✍️ ' + esc(IND[k].label) + '</button>'; }).join("") +
      (zi.indicators.indexOf("hr_bpm") >= 0 ? "" : "");
    var d = $("#zonedetail"); d.className = UI.gclass(zs);
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="font-size:1.4rem;font-weight:800;letter-spacing:-.02em">' + esc(zn) + '</div><span class="pill pill-' + zs + '">' + LABEL[zs] + '</span></div>' +
      '<p style="font-size:.86rem;margin:10px 0 4px"><strong>What it does:</strong> ' + esc(zi.fn) + '</p><p style="font-size:.86rem;margin:0 0 10px"><strong>Why spaceflight matters:</strong> ' + esc(zi.space) + '</p>' +
      '<div class="kicker">Hazards acting on this zone · ' + esc(C.ENVS[S.env].name) + '</div><div class="hz-row">' + (hz || '<span class="mut" style="font-size:.8rem">None mapped</span>') + '</div>' +
      '<div class="kicker" style="margin-top:12px">Today\'s readings</div>' + lines + '<div class="kicker" style="margin-top:10px">What to do</div>' + ah +
      '<div class="kicker" style="margin-top:12px">Measure or update</div><div class="btn-row" style="margin-top:6px">' + measure + '</div>';
  }
  function renderTrends() {
    var k = S.trend, s = IND[k], sp = seriesFor(H, k), x = [], y = [];
    H.forEach(function (r) { if (C.isNum(r[k])) { x.push(r.day); y.push(r[k]); } });
    var hl = [["watch", s.warn_hi, "#F59E0B"], ["action", s.act_hi, "#EF4444"], ["watch", s.warn_lo, "#F59E0B"], ["action", s.act_lo, "#EF4444"]].filter(function (a) { return a[1] !== null && s.lo <= a[1] && a[1] <= s.hi; }).map(function (a) { return { y: a[1], label: a[0], color: a[2] }; });
    var pts = C.isNum(S.values[k]) ? [{ x: S.today, y: S.values[k], color: COLOR[A.indicators[k].status] || COLOR.unknown, r: 8, tip: "Today (unsaved) · " + C.fixed(S.values[k], s.dec) + " " + s.unit }] : [];
    Charts.line($("#trend"), { title: s.label + " (" + s.unit + ") vs your own baseline", height: 340, xTitle: "Mission day", series: [{ name: s.label, color: "#0A84FF", x: x, y: y, width: 3, marker: 4 }], points: pts, hlines: hl,
      bands: sp.lo === null ? [] : [{ y0: sp.lo, y1: sp.hi, fill: "rgba(10,132,255,.12)", label: "Your normal range" }] });
    var days = []; H.forEach(function (r) { if (days.indexOf(r.day) < 0) days.push(r.day); }); days.sort(function (a, b) { return a - b; }); days = days.slice(-14);
    var map = { emerald: 0, amber: 1, crimson: 2 }, z = ORDER.map(function (kk) { return days.map(function (d) {
      var row = null, prior = []; H.forEach(function (r) { if (r.day === d) row = r; else if (r.day < d) prior.push(r[kk]); });
      var st = C.assessIndicator(kk, row ? row[kk] : null, prior).status; return st in map ? map[st] : null; }); });
    var cols = ["#6EE7B7", "#FCD34D", "#F87171"], names = ["Normal", "Watch", "Action"];
    Charts.heat($("#heat"), { title: "Last 14 days · status of every indicator", x: days.map(String), y: ORDER.map(function (kk) { return IND[kk].label; }), z: z, labW: 150, cell: 26, height: 360,
      color: function (v) { return cols[v]; }, tip: function (r, c, v) { return IND[ORDER[r]].label + " · day " + days[c] + " · " + (v === null ? "No data" : names[v]); } });
  }
  function renderHazards() {
    var e = C.ENVS[S.env], keys = Object.keys(C.HAZARDS);
    Charts.radar($("#radar"), { title: e.name + " · hazard intensity (1–5)", labels: keys.map(function (k) { return C.HAZARDS[k].name; }), values: keys.map(function (k) { return e.levels[k]; }), max: 5 });
    $("#envbrief").innerHTML = '<div class="kicker">Environment briefing</div><p style="font-size:.86rem;margin:0 0 6px"><strong>Medical resources:</strong> ' + esc(e.kit) + '</p><p style="font-size:.86rem;margin:0"><strong>Escalation:</strong> ' + esc(e.escalation) + '</p>';
    $("#hazlist").innerHTML = keys.map(function (hk) { var h = C.HAZARDS[hk], info = A.hazards[hk], watch = h.watch.filter(function (k) { return IND[k]; }).map(function (k) { return IND[k].label; }).join(", ");
      return '<div class="' + UI.gclass(info.impact) + '"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div style="font-size:1.05rem;font-weight:800">' + h.icon + ' ' + esc(h.name) + '</div>' +
        '<span class="pill pill-' + info.impact + '">Your indicators · ' + LABEL[info.impact] + '</span></div><p style="font-size:.84rem;margin:8px 0 4px">' + esc(h.blurb) + '</p>' +
        '<p style="font-size:.78rem;margin:0 0 3px" class="mut"><strong>We watch:</strong> ' + esc(watch) + '</p><p style="font-size:.78rem;margin:0" class="mut"><strong>Countermeasure:</strong> ' + esc(h.countermeasure) + '</p></div>'; }).join("");
  }
  function renderRoutine() {
    $("#due").innerHTML = A.due.length ? A.due.map(function (d) { var since = d.since === null ? "never measured" : "last measured " + d.since + "d ago";
      return '<div class="act" style="padding:13px 16px"><div style="font-size:1.1rem">⏱️</div><div><strong>' + esc(d.label) + '</strong><br><span class="mut" style="font-size:.78rem">' + esc(d.device) + ' · ' + since + '</span></div></div>'; }).join("") : '<div class="flash">All routine measurements are up to date.</div>';
    var pct = Math.trunc(100 * (250 - prog.to_next) / 250), badges = prog.badges.map(function (b) { return "<span class='badge'>" + b[0] + " " + esc(b[1]) + "</span>"; }).join("");
    if (S.viewedHazards) badges += "<span class='badge'>🌌 Hazard Scholar</span>";
    $("#progress").innerHTML = '<div class="kicker">Crew progress</div><div style="font-size:2.2rem;font-weight:800;letter-spacing:-.03em">Level ' + prog.level + '</div><div class="xp-bar"><div class="xp-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="hero-sub">' + prog.xp + ' XP · streak ' + prog.streak + ' days · ' + prog.logged + ' check-ins</div><div class="kicker" style="margin-top:14px">Badges</div>' + (badges || "<span class='hero-sub'>Log your first check-in to earn badges.</span>") +
      '<div class="hero-sub" style="margin-top:10px">XP: 10 per measurement, +25 for a full panel. Streaks need a check-in every mission day.</div>';
  }
  function renderLearn() {
    $("#learn").innerHTML = ORDER.map(function (k) { var s = IND[k];
      var lim = [["watch", "≥", s.warn_hi], ["action", "≥", s.act_hi], ["watch", "≤", s.warn_lo], ["action", "≤", s.act_lo]].filter(function (a) { return a[2] !== null; }).map(function (a) { return a[0] + " " + a[1] + " " + C.lim(k, a[2]); }).join(", ");
      return '<details class="pbox"><summary>' + esc(s.label) + '  ·  ' + esc(s.device) + '  ·  every ' + s.freq + ' day(s)</summary><div class="pb"><p><strong>Why in space:</strong> ' + esc(s.why) + '</p><strong>How to measure:</strong><ol>' +
        s.how.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ol><p><strong>Safety limits (' + esc(s.unit) + '):</strong> ' + esc(lim) + '. Your own 14-day baseline can flag a change earlier.</p><p><strong>If WATCH:</strong> ' + esc(s.amber.join(" ")) +
        '</p><p style="margin:0"><strong>If ACTION:</strong> ' + esc(s.crimson.join(" ")) + '</p></div></details>'; }).join("");
  }
  /* each renderer is isolated: one failing section never blanks the rest of the page */
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.error("Co-Pilot section failed:", e); } }
  function updateAll(keepFlash) {
    if (!keepFlash) S.flash = null;
    try { compute(); } catch (e) { if (window.console) console.error("Co-Pilot compute failed:", e); return; }
    [renderTop, renderFlash, renderHero, renderCards, renderTriage, renderBody, renderTrends, renderHazards, renderRoutine, renderSave, syncForm, persist].forEach(safe);
  }

  /* ---------------- check-in form (built once, never re-rendered while typing) ---------------- */
  var GROUPS = [
    { n: 1, t: "Vitals", d: "Measure with your onboard devices", ks: ["sys_bp", "dia_bp", "hr_bpm", "temp_c", "spo2_pct"] },
    { n: 2, t: "Body and routine", d: "Fasting glucose, sleep, exercise, hydration", ks: ["glucose", "sleep_hrs", "exercise_min", "urine_color"] },
    { n: 3, t: "Mind", d: "How you feel, from 1 to 10", ks: ["mood", "stress"] }
  ];
  var TAP = { mood: ["Very low", "Excellent"], stress: ["Calm", "Overloaded"], urine_color: ["Pale", "Dark"] };
  /* a tap button is tinted by the status that value would get from the safety limits, so the scale reads as a heat strip before you tap */
  function tapClass(k, v) { var s = IND[k]; if (s.act_hi !== null && v >= s.act_hi) return "crimson"; if (s.act_lo !== null && v <= s.act_lo) return "crimson"; if (s.warn_hi !== null && v >= s.warn_hi) return "amber"; if (s.warn_lo !== null && v <= s.warn_lo) return "amber"; return "emerald"; }
  function lastOf(k) { var h = history(); for (var i = h.length - 1; i >= 0; i--) if (C.isNum(h[i][k])) return h[i][k]; return null; }
  function field(k) {
    var s = IND[k], head = '<div class="fh"><label class="lbl" id="lb_' + k + '"' + (TAP[k] ? "" : ' for="ci_' + k + '"') + '>' + esc(s.label.replace(/ \(.*\)$/, "")) + (TAP[k] ? "" : ' <span class="u">' + esc(s.unit) + '</span>') + '</label><button type="button" class="same" data-same="' + k + '" hidden></button></div>';
    if (TAP[k]) {
      var btns = ""; for (var v = s.lo; v <= s.hi; v++) btns += '<button type="button" role="radio" aria-checked="false" class="tp ' + tapClass(k, v) + '" data-k="' + k + '" data-v="' + v + '">' + v + '</button>';
      return '<div class="fld tapf">' + head + '<div class="tapbar" id="ci_' + k + '" role="radiogroup" aria-labelledby="lb_' + k + '" tabindex="-1" style="--n:' + (s.hi - s.lo + 1) + '">' + btns + '</div><div class="tp-ends"><span>' + TAP[k][0] + '</span><span>' + TAP[k][1] + '</span></div></div>';
    }
    return '<div class="fld">' + head + '<input class="input" id="ci_' + k + '" data-k="' + k + '" type="number" inputmode="decimal" min="' + s.lo + '" max="' + s.hi + '" step="' + s.step + '" placeholder="' + esc(s.device) + '"></div>';
  }
  function buildForm() {
    $("#form").innerHTML = GROUPS.map(function (g) { return '<section class="grp"><div class="gh"><span class="gn">' + g.n + '</span><div><h3>' + g.t + '</h3><p>' + g.d + '</p></div></div><div class="gf' + (g.n === 3 ? " gf-mind" : "") + '">' + g.ks.map(field).join("") + '</div></section>'; }).join("");
    $("#symptoms").innerHTML = '<button type="button" class="pillbtn" id="sym-none">None today</button>' + Object.keys(C.SYMPTOMS).map(function (k) { return '<label class="pillbtn"><input type="checkbox" data-sym="' + k + '"><span>' + esc(C.SYMPTOMS[k][0]) + '</span></label>'; }).join("");
    $("#form").addEventListener("input", function (e) { var k = e.target.getAttribute("data-k"); if (!k || e.target.type !== "number") return; var raw = e.target.value;
      if (raw === "") S.values[k] = null; else { var n = parseFloat(raw); if (!isFinite(n)) return; S.values[k] = Math.min(IND[k].hi, Math.max(IND[k].lo, n)); } updateAll(); });
    $("#form").addEventListener("change", function (e) { var k = e.target.getAttribute("data-k"); if (k && e.target.type === "number" && C.isNum(S.values[k])) e.target.value = S.values[k]; });
    $("#form").addEventListener("click", function (e) {
      var t = e.target.closest(".tp"); if (t) { var k = t.getAttribute("data-k"), v = +t.getAttribute("data-v"); S.values[k] = S.values[k] === v ? null : v; syncForm(); updateAll(); return; }
      var sm = e.target.closest("[data-same]"); if (sm) { var k2 = sm.getAttribute("data-same"), lv = lastOf(k2); if (lv !== null) { S.values[k2] = lv; syncForm(); updateAll(); } }
    });
    $("#symptoms").addEventListener("change", function (e) { var k = e.target.getAttribute("data-sym"); if (k) { S.symptoms[k] = e.target.checked; syncForm(); updateAll(); } });
    $("#sym-none").addEventListener("click", function () { Object.keys(S.symptoms).forEach(function (k) { S.symptoms[k] = false; }); syncForm(); updateAll(); });
  }
  function syncForm() {
    ORDER.forEach(function (k) {
      var el = $("#ci_" + k); if (!el) return;
      if (TAP[k]) { UI.$$(".tp", el).forEach(function (b) { var on = C.isNum(S.values[k]) && +b.getAttribute("data-v") === S.values[k]; b.classList.toggle("sel", on); b.setAttribute("aria-checked", on); }); }
      else if (document.activeElement !== el) el.value = C.isNum(S.values[k]) ? S.values[k] : "";
      var ch = document.querySelector('[data-same="' + k + '"]'), lv = lastOf(k);
      if (ch) { ch.hidden = lv === null || S.values[k] === lv; ch.textContent = "Same as last: " + (lv === null ? "" : C.fixed(lv, IND[k].dec)); }
    });
    var any = false;
    UI.$$("[data-sym]").forEach(function (b) { var on = !!S.symptoms[b.getAttribute("data-sym")]; b.checked = on; b.parentNode.classList.toggle("sel", on); any = any || on; });
    var nb = $("#sym-none"); if (nb) nb.classList.toggle("sel", !any);
    $("#env").value = S.env; $("#trendsel").value = S.trend;
  }
  function renderSave() {
    var n = ORDER.filter(function (k) { return C.isNum(S.values[k]); }).length, st = A.overall;
    $("#sb-pill").className = "sb-pill sb-" + st; $("#sb-pill").textContent = LABEL[st] + " · readiness " + A.readiness;
    $("#sb-txt").textContent = n + " of " + ORDER.length + " measured · guidance updates as you tap";
    $("#log").textContent = "Save day " + S.today;
  }

  /* ---------------- init ---------------- */
  function init() {
    try { start(); } catch (e) {
      if (window.console) console.error("Co-Pilot init failed:", e);
      try { updateAll(); } catch (e2) {}
      recover();
    }
  }
  /* last resort for a stale or mixed cached copy: clear caches and workers and reload once, so nobody has to refresh by hand */
  function recover() {
    try {
      if (sessionStorage.getItem("aero-init-recover")) return; sessionStorage.setItem("aero-init-recover", "1");
      var jobs = [];
      if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (x) { return x.unregister(); })); }));
      if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
    } catch (e) {}
  }
  function start() {
    $("#env").innerHTML = ENV_KEYS.map(function (k) { return '<option value="' + k + '">' + esc(C.ENVS[k].icon + "  " + C.ENVS[k].name) + '</option>'; }).join("");
    $("#trendsel").innerHTML = ORDER.map(function (k) { return '<option value="' + k + '">' + esc(IND[k].label) + '</option>'; }).join("");
    $("#scs").innerHTML = Object.keys(C.SCENARIOS).map(function (n) { return '<button class="btn btn-sm" data-sc="' + esc(n) + '">' + esc(n) + '</button>'; }).join("");
    buildForm(); renderLearn(); syncForm(); if (window.AeroCamera) window.AeroCamera.mount();
    var tabsShow = UI.tabs($("#tabs"), function (name) { if (name === "insights" && !S.viewedHazards) { S.viewedHazards = true; if (A) { renderRoutine(); persist(); } } if (name === "insights") { window.dispatchEvent(new Event("resize")); } });
    $("#env").addEventListener("change", function (e) { S.env = e.target.value; updateAll(); });
    /* quick path to the check-in form: top banner + floating button (shown only while the form is off screen) */
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function startCheckin() { tabsShow("checkin"); $("#ci-top").scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" }); setTimeout(function () { var f = $("#ci_" + ORDER[0]); if (f) f.focus({ preventScroll: true }); }, calm ? 0 : 450); }
    $("#start-ci").addEventListener("click", startCheckin);
    $("#trendsel").addEventListener("change", function (e) { S.trend = e.target.value; renderTrends(); persist(); });
    $("#scs").addEventListener("click", function (e) { var b = e.target.closest("[data-sc]"); if (!b) return; scenario(b.getAttribute("data-sc")); syncForm(); updateAll(); });
    $("#log").addEventListener("click", function () {
      var row = { day: S.today, source: "crew" }; ORDER.forEach(function (k) { row[k] = C.isNum(S.values[k]) ? S.values[k] : null; });
      S.crew.push(row); S.flash = "Check-in logged for mission day " + row.day + ". XP earned."; S.today += 1; updateAll(true); window.scrollTo({ top: 0, behavior: "smooth" }); });
    $("#zonebtns").addEventListener("click", function (e) { var b = e.target.closest("[data-zone]"); if (b) { S.zone = b.getAttribute("data-zone"); renderBody(); persist(); } });
    function pickZone(g) { S.zone = g.getAttribute("data-zone"); renderBody(); persist(); var f = $("#bodysvg").querySelector('.zone-node:not(.bm-label)[data-zone="' + S.zone.replace(/"/g, "") + '"]'); if (f && document.activeElement && document.activeElement.closest && document.activeElement.closest("#bodysvg")) f.focus({ preventScroll: true }); }
    $("#bodysvg").addEventListener("click", function (e) { var g = e.target.closest("[data-zone]"); if (g) pickZone(g); });
    $("#bodysvg").addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== " ") return; var g = e.target.closest("[data-zone]"); if (g) { e.preventDefault(); pickZone(g); } });
    $("#zonedetail").addEventListener("click", function (e) {
      var m = e.target.closest("[data-measure]"); if (m) { tabsShow("checkin"); var f = $("#ci_" + m.getAttribute("data-measure")); if (f) { f.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" }); setTimeout(function () { f.focus({ preventScroll: true }); }, calm ? 0 : 400); } return; }
      if (e.target.closest("[data-camera]") && window.AeroCamera) window.AeroCamera.open();
    });
    $("#dl-packet").addEventListener("click", function () { if (!sealed) return; UI.download("aerovynt_day" + S.today + "_sealed_report.json", JSON.stringify(sealed, null, 2), "application/json"); });
    $("#vr-load").addEventListener("click", function () { if (sealed) $("#vr-in").value = JSON.stringify(sealed, null, 2); });
    $("#vr-go").addEventListener("click", function () { var o = $("#vr-out"); verifyText($("#vr-in").value).then(function (r) { o.className = "vr " + (r.ok ? "vr-ok" : "vr-bad"); o.textContent = (r.ok ? "✓ " : "✗ ") + r.msg; }); });
    $("#copy-summary").addEventListener("click", function () {
      var e = C.ENVS[S.env], L = [];
      L.push("AEROVYNT crew health summary, mission day " + S.today + " (" + e.name + ")");
      L.push("Overall: " + LABEL[A.overall] + ", readiness " + A.readiness + "/100");
      L.push(""); L.push("Indicators (today vs personal baseline):");
      ORDER.forEach(function (k) { var v = A.indicators[k]; L.push("- " + IND[k].label + ": " + (v.value === null ? "not measured" : C.fixed(v.value, IND[k].dec) + " " + IND[k].unit) + (v.base === null ? "" : " (baseline " + C.fixed(v.base, IND[k].dec) + ")") + " [" + LABEL[v.status] + "]"); });
      var sy = Object.keys(S.symptoms).filter(function (k) { return S.symptoms[k]; }).map(function (k) { return C.SYMPTOMS[k][0]; });
      L.push(""); L.push("Symptoms reported: " + (sy.length ? sy.join("; ") : "none"));
      L.push(""); L.push("Suggested actions:"); A.actions.forEach(function (a, i) { L.push((i + 1) + ". " + a); });
      L.push(""); L.push("Comms: " + A.comms);
      L.push(""); L.push("Generated on board by AEROVYNT, a research prototype for decision support. Not a medical device. Thresholds are illustrative.");
      var text = L.join("\n"), btn = $("#copy-summary"), done = function (m) { btn.textContent = m; setTimeout(function () { btn.textContent = "Copy readable summary"; }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done("Copied"); }, function () { UI.download("aerovynt_day" + S.today + "_summary.txt", text, "text/plain"); done("Saved as text file"); });
      else { UI.download("aerovynt_day" + S.today + "_summary.txt", text, "text/plain"); done("Saved as text file"); }
    });
    $("#dl-csv").addEventListener("click", function () {
      var cols = ["day"].concat(ORDER).concat(["source"]), esc2 = function (v) { return v === null || v === undefined ? "" : String(v); };
      UI.download("aerovynt_crew_log.csv", [cols.join(",")].concat(history().map(function (r) { return cols.map(function (c) { return esc2(r[c]); }).join(","); })).join("\n") + "\n", "text/csv"); });
    $("#amsler").innerHTML = UI.amslerSvg();
    /* narrow API for assets/sensors.js (device import and mock telemetry); values pass through the same engine as typed ones */
    window.AeroCoPilot = {
      setValue: function (k, v) { if (IND[k]) S.values[k] = v; },
      showTab: function (n) { tabsShow(n); }, setScenario: function (n) { scenario(n); syncForm(); updateAll(); }, selectZone: function (z) { if (C.ZONES[z]) { S.zone = z; renderBody(); persist(); } },
      setEnv: function (k) { if (C.ENVS[k]) { S.env = k; syncForm(); updateAll(); } }, resetFlash: function () { S.flash = null; renderFlash(); },
      refresh: function () { syncForm(); updateAll(); },
      importRows: function (rows) { rows.forEach(function (r) { var row = { day: S.today, source: "import" }; ORDER.forEach(function (k) { row[k] = C.isNum(r[k]) ? r[k] : null; }); S.crew.push(row); S.today += 1; });
        S.flash = rows.length + " days imported from a device file. They now count toward your personal baseline."; updateAll(true); }
    };
    updateAll();
    try { sessionStorage.removeItem("aero-init-recover"); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
