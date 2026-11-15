/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT sensor feed: shows how device data reaches the engine without typing.
   Primary route: a simulated link to the kinds of equipment crews already fly (biomonitor shirt, sleep actigraphy band, oximeter, BP cuff,
   medical-kit glucometer) that streams samples into today's check-in. The link is simulated and the device names are examples.
   Secondary (advanced): load a CSV/JSON export for ground testing or analog missions. Everything stays in this browser. */
(function () {
  "use strict";
  var tries = 0;
  function boot() {
    var root = document.getElementById("sensors"); if (!root) return;
    if (window.AeroCoPilot && window.Coach && window.UI) { try { sessionStorage.removeItem("aero-recover"); } catch (e) {} return start(root, window.AeroCoPilot); }
    if (++tries < 40) return setTimeout(boot, 100);
    /* stale cached copy: clear the offline cache and workers and reload once automatically, so nobody has to press Ctrl+Shift+R */
    try {
      if (!sessionStorage.getItem("aero-recover")) {
        sessionStorage.setItem("aero-recover", "1"); root.innerHTML = "<p>Updating to the latest version…</p>";
        var jobs = [];
        if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (x) { return x.unregister(); })); }));
        if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
        Promise.all(jobs).catch(function () {}).then(function () { location.reload(); }); return;
      }
    } catch (e) {}
    root.innerHTML = '<p>The sensor feed could not start because this page is running an older cached copy of the Co-Pilot. Reload the page (Ctrl+Shift+R, or close and reopen the app) and try again.</p>';
    try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.update(); }); }); } catch (e) {}
  }

  function start(root, API) {
    var C = window.Coach, UI = window.UI;
    var ALIAS = {
      sys_bp: ["sys_bp", "systolic", "sys", "bp_sys", "systolic_bp"], dia_bp: ["dia_bp", "diastolic", "dia", "bp_dia", "diastolic_bp"],
      hr_bpm: ["hr_bpm", "hr", "heart_rate", "resting_hr", "resting_heart_rate", "rhr", "bpm"], temp_c: ["temp_c", "temp", "temperature", "skin_temp", "core_temp_c", "core_temp", "body_temp"],
      glucose: ["glucose", "glucose_mgdl", "blood_glucose", "bg"], sleep_hrs: ["sleep_hrs", "sleep", "sleep_hours", "sleep_duration", "sleep_h", "sleep_hr"],
      mood: ["mood", "mood_score"], spo2_pct: ["spo2_pct", "spo2", "oxygen", "blood_oxygen", "o2_sat"], urine_color: ["urine_color", "hydration"], exercise_min: ["exercise_min", "exercise", "active_minutes", "exercise_minutes"]
    };
    var DEV = [["👕", "Smart-shirt biomonitor", "heart rate · skin temp"], ["⌚", "Sleep actigraphy band", "sleep · activity"], ["🫁", "Fingertip oximeter", "SpO₂"], ["🩸", "Upper-arm BP cuff", "blood pressure"], ["🧪", "Medical-kit glucometer", "glucose"]];
    var ISS = { hr_bpm: [64, 1.6], temp_c: [37.0, 0.07], spo2_pct: [98, 0.5], sys_bp: [112, 2], dia_bp: [73, 1.5], glucose: [86, 2], sleep_hrs: [6.4, 0.2] };
    var timer = null, pairing = null, n = 0, drift = false, last = {};

    root.innerHTML =
      '<div class="sh-top"><div><div class="sh-kick">Sensor feed · simulated link</div><h2 class="sh-title">Connect onboard devices</h2>' +
      '<p class="sh-sub">Pulls readings from the kinds of equipment crews already fly (a biomonitor shirt, a sleep actigraphy band, an oximeter, a BP cuff, the medical-kit glucometer), so nobody has to type. The link is simulated and the device names are examples.</p></div>' +
      '<div class="sh-btns"><button class="sh-go" id="st-go" type="button">Connect</button><button class="sh-alt" id="st-drift" type="button" disabled>Inject fever drift</button></div></div>' +
      '<div class="dev-grid">' + DEV.map(function (d) { return '<div class="dev" title="' + d[2] + '"><span class="dev-i">' + d[0] + '</span><span><strong>' + d[1] + '</strong><span class="dev-m"> · ' + d[2] + '</span><span class="dev-s" data-dev="' + d[1] + '">not connected</span></span></div>'; }).join("") + '</div>' +
      '<div class="sh-log" id="st-log" aria-live="off">Not connected.</div>' +
      '<details class="sh-adv"><summary>Advanced: load a data file (ground station, analog missions)</summary>' +
      '<p>Onboard, data comes straight from the devices. For ground testing or analog missions you can also load a CSV or JSON export, one row per mission day. Recognised columns: ' + Object.keys(ALIAS).map(function (k) { return "<code>" + k + "</code>"; }).join(" ") + ' and common aliases such as <code>heart_rate</code>, <code>skin_temp</code>, <code>sleep_hours</code>. A blank cell stays blank and is never treated as normal.</p>' +
      '<div class="btn-row"><label class="btn btn-sm" style="cursor:pointer">Choose file<input type="file" id="sf" accept=".csv,.json,text/csv,application/json" hidden></label><button class="btn btn-sm" id="sf-sample" type="button">Example file</button></div></details>' +
      '<div class="sh-msg" id="sf-msg" role="status"></div>';
    var msg = root.querySelector("#sf-msg"), logEl = root.querySelector("#st-log"), go = root.querySelector("#st-go"), dr = root.querySelector("#st-drift");
    function say(t, bad) { msg.textContent = t; msg.style.color = bad ? "#FCA5A5" : ""; }
    function devState(text, ok) { DEV.forEach(function (d) { var el = root.querySelector('[data-dev="' + d[1] + '"]'); if (el) { el.textContent = text; el.classList.toggle("ok", !!ok); } }); }

    /* ---------- file import (advanced) ---------- */
    function norm(h) { return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
    function map(headers) { var m = {}; headers.forEach(function (h) { var nh = norm(h); Object.keys(ALIAS).forEach(function (k) { if (ALIAS[k].indexOf(nh) >= 0 && !(k in m)) m[k] = h; }); }); return m; }
    function parseCSV(t) {
      var rows = [], row = [], cur = "", q = false, i, c; t = t.replace(/^﻿/, "");
      for (i = 0; i < t.length; i++) { c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
        else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
        else cur += c; }
      row.push(cur); if (row.length > 1 || row[0] !== "") rows.push(row);
      if (!rows.length) return []; var h = rows[0];
      return rows.slice(1).map(function (r) { var o = {}; h.forEach(function (k, j) { o[k] = r[j]; }); return o; });
    }
    function toRows(objs) {
      if (!objs.length) return { rows: [], used: [], skipped: 0 };
      var m = map(Object.keys(objs[0])), used = Object.keys(m), out = [], skipped = 0;
      objs.slice(0, 400).forEach(function (o) {
        var r = {}, any = false;
        used.forEach(function (k) { var v = o[m[k]]; if (v === "" || v === null || v === undefined) { r[k] = null; return; } var x = parseFloat(v); if (!isFinite(x)) { r[k] = null; return; }
          var s = C.IND[k]; if (x < s.lo || x > s.hi) { r[k] = null; skipped++; return; } r[k] = x; any = true; });
        if (any) out.push(r);
      });
      return { rows: out, used: used, skipped: skipped };
    }
    root.querySelector("#sf").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (f.size > 2e6) { say("File is larger than 2 MB. Export a shorter range.", true); return; }
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var t = String(fr.result), objs = /\.json$/i.test(f.name) || /^\s*[\[{]/.test(t) ? JSON.parse(t) : parseCSV(t);
          if (!Array.isArray(objs)) objs = objs.rows || objs.data || objs.days || [objs];
          var res = toRows(objs);
          if (!res.used.length) { say("No recognised health columns found. Expected something like hr_bpm, temp_c, sleep_hrs, spo2_pct, glucose, sys_bp, dia_bp.", true); return; }
          if (!res.rows.length) { say("The file had recognised columns but no usable numbers.", true); return; }
          API.importRows(res.rows);
          say("Loaded " + res.rows.length + " mission days from " + f.name + " (columns: " + res.used.join(", ") + ")." + (res.skipped ? " " + res.skipped + " out-of-range values were dropped, not assumed normal." : "") + " Open Trends to see them against your baseline.");
        } catch (err) { say("Could not read that file: " + (err && err.message ? err.message : "unknown format") + ".", true); }
        e.target.value = "";
      };
      fr.readAsText(f);
    });
    root.querySelector("#sf-sample").addEventListener("click", function () {
      var L = ["day,heart_rate,skin_temp,spo2,sleep_hours,systolic,diastolic,glucose"], i, d;
      for (i = 1; i <= 21; i++) { d = i >= 17 ? (i - 16) : 0; L.push([i, (64 + Math.sin(i) * 1.5 + d * 3.2).toFixed(0), (36.9 + Math.cos(i * 1.3) * 0.08 + d * 0.22).toFixed(1), (98 - (d > 2 ? 1 : 0)).toFixed(0), (6.5 + Math.sin(i * 2.1) * 0.5 - d * 0.3).toFixed(1), (113 + (i % 3)).toFixed(0), (73 + (i % 2)).toFixed(0), (86 + (i % 4) + d * 2).toFixed(0)].join(",")); }
      UI.download("aerovynt_sample_wearable.csv", L.join("\n") + "\n", "text/csv");
    });

    /* ---------- simulated device link (primary) ---------- */
    function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5; }
    function setSleep(drop) {
      var s = C.IND.sleep_hrs, v = ISS.sleep_hrs[0] + gauss() * ISS.sleep_hrs[1] - (drop || 0);
      v = Math.round(Math.min(s.hi, Math.max(s.lo, v)) * 10) / 10; last.sleep_hrs = v; API.setValue("sleep_hrs", v);
    }
    function tick() {
      n++; var k, v;
      for (k in ISS) { if (k === "sleep_hrs") continue; /* sleep is a once-per-night summary, not a live stream */ v = ISS[k][0] + gauss() * ISS[k][1];
        if (drift) { var f = Math.min(1, (n - drift) / 20); if (k === "temp_c") v += 1.1 * f; if (k === "hr_bpm") v += 16 * f; if (k === "glucose") v += 14 * f; if (k === "spo2_pct") v -= 1.2 * f; }
        var s = C.IND[k]; v = Math.min(s.hi, Math.max(s.lo, v)); v = k === "temp_c" || k === "sleep_hrs" ? Math.round(v * 10) / 10 : Math.round(v); last[k] = v; API.setValue(k, v); }
      API.refresh(); devState("● connected", true);
      var line = "t+" + n + "s  HR " + last.hr_bpm + "  T " + last.temp_c + "  SpO₂ " + last.spo2_pct + "  BP " + last.sys_bp + "/" + last.dia_bp + "  Glu " + last.glucose + "  Sleep " + last.sleep_hrs + "h (last night)";
      logEl.textContent = (line + "\n" + (/^(Not connected|Disconnected)/.test(logEl.textContent) ? "" : logEl.textContent)).split("\n").slice(0, 40).join("\n");
    }
    go.addEventListener("click", function () {
      if (pairing) return;
      if (timer) { clearInterval(timer); timer = null; drift = false; go.textContent = "Connect"; go.classList.remove("on"); dr.disabled = true; dr.textContent = "Inject fever drift";
        devState("disconnected", false); logEl.textContent = "Disconnected."; say("Disconnected. The last readings stay in today’s check-in."); return; }
      go.textContent = "Pairing…"; say("Pairing devices (simulated).");
      DEV.forEach(function (d, i) { setTimeout(function () { var el = root.querySelector('[data-dev="' + d[1] + '"]'); if (el) el.textContent = "pairing…"; }, i * 150); });
      pairing = setTimeout(function () { pairing = null; n = 0; drift = false; setSleep(0); tick(); timer = setInterval(tick, 1000); go.textContent = "⏹  Disconnect"; go.classList.add("on"); dr.disabled = false; say("Connected (simulated). Samples are streaming into today’s check-in."); }, 1000);
    });
    dr.addEventListener("click", function () { if (!timer || drift) return; drift = n; setSleep(1.6); API.refresh(); dr.textContent = "Drift running…"; });
    window.addEventListener("pagehide", function () { if (timer) clearInterval(timer); });
  }
  boot();
})();
