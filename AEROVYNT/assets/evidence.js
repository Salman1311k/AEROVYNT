/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT Evidence page (port of views/evidence.py). Everything is precomputed from research/ into data.js by research/tools/build_data.py. */
(function () {
  "use strict";
  var D = window.AERO_DATA, UI = window.UI, esc = UI.esc, $ = UI.$, TP = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];
  var PAL = { C001: "#64748B", C002: "#10B981", C003: "#0A84FF", C004: "#8B5CF6" };
  var AN = Object.keys(D.analytes);
  function num(v) { return v === null || v === undefined ? "—" : String(Math.round(v * 1000) / 1000); }
  function mix(a, b, t) { var p = function (h, i) { return parseInt(h.substr(1 + i * 2, 2), 16); }; return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(p(a, i) + (p(b, i) - p(a, i)) * t); }).join(",") + ")"; }
  function table(cols, rows, fmt) { return '<div class="tbl-scroll"><table class="tbl"><tr>' + cols.map(function (c) { return "<th>" + esc(c[1]) + "</th>"; }).join("") + "</tr>" +
    rows.map(function (r) { return "<tr>" + cols.map(function (c) { return "<td>" + esc(fmt ? fmt(c[0], r[c[0]], r) : num(r[c[0]])) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div>"; }
  function textFmt(k, v) { return typeof v === "number" ? num(v) : (v === null || v === undefined ? "—" : v); }

  /* ---- real data ---- */
  var nCrew = new Set(D.cmp.map(function (r) { return r.crew; })).size;
  $("#prov").innerHTML = '<div class="kicker">Provenance check</div><div style="font-size:1.05rem;font-weight:700">The data shown here is loaded directly from the NASA file <code>LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv</code>.</div>' +
    '<p style="font-size:.86rem;margin:8px 0 0">' + D.cmp.length + ' serum samples · ' + nCrew + ' crew · 7 timepoints (L-92, L-44, L-3, R+1, R+45, R+82, R+194) · ' + AN.length + ' analytes parsed with their lab reference ranges. ' +
    'The six analytes previously hard-coded in the first prototype (glucose, albumin, creatinine, sodium, potassium, BUN) were reconciled against this file: <strong>168 of 168 values match exactly</strong>.</p>';
  $("#analyte").innerHTML = AN.map(function (k) { return '<option value="' + k + '">' + esc(D.analytes[k].label + " (" + D.analytes[k].unit + ")") + '</option>'; }).join("");
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
  function drawTraj() {
    var k = $("#analyte").value, bands = [], los = D.cmp.map(function (r) { return r[k + "_lo"]; }).filter(function (v) { return v !== null; }), his = D.cmp.map(function (r) { return r[k + "_hi"]; }).filter(function (v) { return v !== null; });
    if ($("#showref").checked && los.length) { var lo = median(los), hi = median(his); bands.push({ y0: lo, y1: hi, fill: "rgba(16,185,129,.10)", label: "Lab reference " + lo + "–" + hi }); }
    var series = ["C001", "C002", "C003", "C004"].map(function (c) { var rows = D.cmp.filter(function (r) { return r.crew === c; }).sort(function (a, b) { return TP.indexOf(a.timepoint) - TP.indexOf(b.timepoint); });
      return { name: c, color: PAL[c], x: rows.map(function (r) { return r.timepoint; }), y: rows.map(function (r) { return r[k]; }), width: 3, marker: 5 }; });
    Charts.line($("#traj"), { title: D.analytes[k].label + " across flight and recovery (n = 4 crew)", height: 360, categories: TP, series: series, bands: bands, vband: { x0: 2.5, x1: 3.5, label: "Landing" } });
    $("#traj-legend").innerHTML = series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + s.name + '</span>'; }).join("");
  }
  $("#analyte").addEventListener("change", drawTraj); $("#showref").addEventListener("change", drawTraj);

  /* ---- personal vs population ---- */
  var T = D.pvp, sum = function (k) { return T.reduce(function (a, r) { return a + r[k]; }, 0); };
  var N = D.pvp_null, rd = function (v) { return String(Math.round(v)); };
  $("#metrics").innerHTML = [["Personal-baseline flags", N.observed_personal, "of " + N.post_draws + " post-flight draws. About " + rd(N.expected_personal) + " expected by chance alone (95% range " + rd(N.null_95[0]) + "–" + rd(N.null_95[1]) + ", p ≈ " + N.p_personal.toFixed(2) + ")."],
    ["Only the personal baseline flagged", N.observed_personal_only, "values still inside the lab range. About " + rd(N.expected_personal_only) + " expected by chance (p ≈ " + N.p_personal_only.toFixed(2) + ")."],
    ["Flagged by the lab range", sum("flagged_lab_range"), sum("flagged_both") + " of them were also flagged by the personal baseline. There is no chance estimate for this rule because it depends on each lab’s population interval."]]
    .map(function (m) { return '<div class="g lift"><div class="kicker">' + m[0] + '</div><div class="metric">' + m[1] + '</div><div class="hero-sub">' + m[2] + '</div></div>'; }).join("");
  var nulls = T.map(function (r) { return N.per_analyte[r.analyte] || { expected_personal: 0, observed_personal: r.flagged_personal }; });
  Charts.bar($("#pvp-null"), { title: "Personal-baseline flags by analyte: observed vs expected by chance", height: 430, horizontal: true, categories: T.map(function (r) { return r.analyte; }),
    series: [{ name: "Observed", color: "#0A84FF", values: nulls.map(function (x) { return x.observed_personal; }) }, { name: "Expected by chance", color: "#94A3B8", values: nulls.map(function (x) { return x.expected_personal; }) }] });
  $("#pvp-null-legend").innerHTML = [["Observed", "#0A84FF"], ["Expected by chance", "#94A3B8"]].map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[0] + '</span>'; }).join("");
  $("#pvp-reading").innerHTML = "<strong>Reading:</strong> the personal-baseline rule flagged " + N.observed_personal + " of " + N.post_draws + " post-flight draws. If nothing had changed, the same rule on the same study design flags about " + rd(N.expected_personal) + " (95% range " + rd(N.null_95[0]) + "–" + rd(N.null_95[1]) + "; p ≈ " + N.p_personal.toFixed(2) + "). " +
    (N.p_personal >= 0.05 ? "So this file does not show that personal baselines detect real post-flight change. With 4 crew it neither proves nor rules that out. " : "That is more than chance alone would usually produce, but with 4 crew it is still only suggestive. ") +
    "The case for using personal baselines together with absolute safety limits rests on the simulations and on clinical reasoning, not on this sample. Glucose of 36–44 mg/dL at R+45 in three asymptomatic crew is physiologically implausible, so the system treats it as a probable pre-analytical artifact (for example delayed sample separation) and requests a repeat rather than asserting hypoglycemia.";
  Charts.bar($("#pvp"), { title: "Post-flight flags by method (count of 16 draws per analyte)", horizontal: true, stacked: true, height: 430, categories: T.map(function (r) { return r.analyte; }),
    series: [{ name: "Personal only", color: "#0A84FF", values: T.map(function (r) { return r.personal_only; }) }, { name: "Both", color: "#10B981", values: T.map(function (r) { return r.flagged_both; }) }, { name: "Lab range only", color: "#F59E0B", values: T.map(function (r) { return r.lab_only; }) }] });
  $("#pvp-legend").innerHTML = [["Personal only", "#0A84FF"], ["Both", "#10B981"], ["Lab range only", "#F59E0B"]].map(function (s) { return '<span><i style="background:' + s[1] + '"></i>' + s[0] + '</span>'; }).join("");

  /* ---- engine benchmarks ---- */
  var B = D.benchmark, sc = B.scenarios, names = Object.keys(sc);
  $("#engver").textContent = "Engine v" + B.engine_version;
  Charts.bar($("#fa"), { title: "False alarms: % of healthy crew-days flagged (lower is better)", height: 340, unit: "%", categories: names, series: [
    { name: "Earth rules incl. sleep < 6 h", color: "#F87171", values: names.map(function (n) { return sc[n].false_alarm_pct.earth; }) },
    { name: "Earth rules without sleep clause", color: "#FCA5A5", values: names.map(function (n) { return sc[n].false_alarm_pct.earth_no_sleep; }) },
    { name: "Plain personal z-score (any single signal)", color: "#A78BFA", values: names.map(function (n) { return sc[n].false_alarm_pct.naive_personal; }) },
    { name: "AEROVYNT event watch", color: "#FBBF24", values: names.map(function (n) { return sc[n].false_alarm_pct.watch; }) },
    { name: "AEROVYNT action", color: "#10B981", values: names.map(function (n) { return sc[n].false_alarm_pct.action_all; }) }] });
  $("#fa-legend").innerHTML = [["Earth rules incl. sleep < 6 h", "#F87171"], ["Earth rules without sleep clause", "#FCA5A5"], ["Plain personal z-score (any single signal)", "#A78BFA"], ["AEROVYNT event watch", "#FBBF24"], ["AEROVYNT action", "#10B981"]].map(function (s) { return '<span><i style="background:' + s[1] + '"></i>' + s[0] + '</span>'; }).join("");
  Charts.bar($("#det"), { title: "Detection: % of injected events caught within the window (higher is better)", height: 320, unit: "%", max: 100, categories: names, series: [
    { name: "Plain personal z-score", color: "#A78BFA", values: names.map(function (n) { return sc[n].detected_within_window_pct.naive_personal; }) },
    { name: "Event watch", color: "#FBBF24", values: names.map(function (n) { return sc[n].detected_within_window_pct.watch; }) },
    { name: "Action (incl. sleep floor)", color: "#0A84FF", values: names.map(function (n) { return sc[n].detected_within_window_pct.action_all; }) }] });
  $("#det-legend").innerHTML = [["Plain personal z-score", "#A78BFA"], ["Event watch", "#FBBF24"], ["Action (incl. sleep floor)", "#0A84FF"]].map(function (s) { return '<span><i style="background:' + s[1] + '"></i>' + s[0] + '</span>'; }).join("");


  /* ---- headline stats (computed from the same data as the tabs) ---- */
  (function () {
    var vals = names.map(function (n) { return sc[n]; }), avg = function (f) { return vals.reduce(function (a, v) { return a + f(v); }, 0) / vals.length; };
    var dets = vals.map(function (v) { return v.detected_within_window_pct.watch; });
    $("#ev-earth").textContent = Math.round(avg(function (v) { return v.false_alarm_pct.earth_no_sleep; })) + "%";
    var simA = (Math.round(avg(function (v) { return v.false_alarm_pct.action_all; }) * 10) / 10), R = D.realdata;
    if (R) { var A = R.engines[Object.keys(R.engines)[1]].all.pooled.action_all; $("#ev-aero").textContent = A[0] + "%"; $("#ev-aero-t").textContent = "of real days (PMData, 13 people, no illness labels) flagged by AEROVYNT action alerts, an upper bound on false alarms (95% range " + A[1] + "–" + A[2] + "%). In simulation: " + simA + "%."; }
    else { $("#ev-aero").textContent = simA + "%"; $("#ev-aero-t").textContent = "of healthy simulated days flagged by AEROVYNT action alerts (including the 7-night sleep floor)."; }
    $("#ev-det").textContent = Math.round(Math.min.apply(null, dets)) + "–" + Math.round(Math.max.apply(null, dets)) + "%";
    $("#ev-pers").textContent = D.pvp_null.observed_personal + " vs " + Math.round(D.pvp_null.expected_personal);
  })();


  /* ---- reviewer sheet: every limit and message the Co-Pilot uses, with blank verdict columns ---- */
  (function () {
    var b = $("#dl-review"); if (!b || !D.coach) return;
    b.addEventListener("click", function () {
      var q = function (v) { v = v === null || v === undefined ? "" : String(v); return '"' + v.replace(/"/g, '""') + '"'; };
      var rows = [["Indicator", "Unit", "Device", "Watch high", "Action high", "Watch low", "Action low", "Text shown on WATCH", "Text shown on ACTION", "Reviewer verdict (OK / change / remove)", "Reviewer comment"]];
      D.coach.ORDER.forEach(function (k) { var i = D.coach.INDICATORS[k]; rows.push([i.label, i.unit, i.device, i.warn_hi, i.act_hi, i.warn_lo, i.act_lo, (i.amber || []).join(" "), (i.crimson || []).join(" "), "", ""]); });
      rows.push([]); rows.push(["Symptom", "Level", "", "", "", "", "", "Text shown", "", "Reviewer verdict", "Reviewer comment"]);
      Object.keys(D.coach.SYMPTOMS).forEach(function (k) { var y = D.coach.SYMPTOMS[k]; rows.push([y[0], y[1], "", "", "", "", "", y[3], "", "", ""]); });
      rows.push([]); rows.push(["Sleep layer", "7-night mean below 6.0 h = advisory; below 5.0 h = alert; 7 h target", "", "", "", "", "", "", "", "", ""]);
      var csv = rows.map(function (r) { return r.map(q).join(","); }).join("\n") + "\n";
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "aerovynt_reviewer_sheet.csv"; document.body.appendChild(a); a.click(); a.remove();
    });
  })();

  /* ---- real wearables (PMData) ---- */
  (function () {
    var R = D.realdata; if (!R) { $("#wear").innerHTML = ""; return; }
    var V32 = R.engines[Object.keys(R.engines)[0]], V33 = R.engines[Object.keys(R.engines)[1]], f1 = function (x) { return x[0] + "% (" + x[1] + "–" + x[2] + ")"; };
    var rows = [["Event watch", "watch"], ["Action", "action_all"]].map(function (m) { var k = m[1] === "action_all" ? "action" : m[1];
      return { Alert: m[0], a: f1(V32.validation.pooled[k]), b: f1(V33.validation.pooled[m[1]]), c: f1(V32.calibration.pooled[k]), d: f1(V33.calibration.pooled[m[1]]) }; });
    var noise = [{ Quantity: "Night-to-night sleep variation (robust SD)", s: "0.35 h (simulator, before v3.3)", r: R.median_real_sleep_robust_sd_h + " h (median of 13 people)" },
      { Quantity: "Resting heart rate day-to-day variation (robust SD)", s: "2.0 bpm × person multiplier 0.75–1.55", r: R.median_real_hr_robust_sd_bpm + " bpm" },
      { Quantity: "Day-to-day memory in resting heart rate (lag-1 autocorrelation)", s: "0 (independent), 0.7 in the stress test", r: R.median_hr_lag1_autocorr },
      { Quantity: "Average sleep", s: "6.1 h (ISS average, Barger 2014)", r: R.median_real_sleep_mean_h + " h; " + R.median_real_sleep_lt7_pct + "% of nights under 7 h" },
      { Quantity: "Weekend minus weekday sleep", s: "not modelled", r: "+" + R.median_weekend_minus_weekday_sleep_h + " h" }];
    var pp = R.noise.map(function (r) { var a = R.engines[Object.keys(R.engines)[1]], g = R.calibration.indexOf(r.participant) >= 0 ? "calibration" : "validation", x = a[g].per_participant[r.participant];
      return { participant: r.participant, group: g, nights: r.sleep_nights, hr_days: r.hr_days, sleep_mean: r.sleep_mean_h, sleep_sd: r.sleep_robust_sd_h, hr_sd: r.hr_robust_sd_bpm, watch: x.watch + "%", action: x.action_all + "%" }; });
    $("#wear").innerHTML = '<div class="g"><div class="kicker">Real wearable check · PMData</div><div style="font-size:1.05rem;font-weight:700">Do the simulator’s noise assumptions and the engine’s false-alarm behaviour survive contact with real people?</div>' +
      '<p style="font-size:.86rem;margin:8px 0 0">Data: Fitbit resting heart rate and nightly sleep from the PMData dataset (Thambawita et al. 2020, CC BY 4.0). ' + R.qualifying.length + ' of ' + R.n_participants_total + ' participants had at least 60 nights of sleep and 60 days of resting heart rate (excluded: ' + R.excluded.join(", ") + '). Protocol fixed in advance: participants were split alternately into a <strong>calibration</strong> half (' + R.calibration.join(", ") + ') and a <strong>validation</strong> half (' + R.validation.join(", ") + '). Only one number was calibrated, the sleep noise floor (' + R.calibrated_sleep_sigma_floor_h + ' h, the median real night-to-night variation of the calibration half). Validation people were not used to set anything.</p>' +
      '<p style="font-size:.86rem;margin:8px 0 0"><strong>What this cannot show:</strong> PMData has no illness labels, so it says nothing about whether infections are detected. Every alert below is an upper bound on false alarms, because some may be real illness, hard training or travel. These are free-living Earth volunteers, not crew.</p></div>' +
      '<p style="margin:18px 0 8px"><strong>Simulator assumptions vs real people</strong></p><div id="w-noise"></div>' +
      '<p style="margin:18px 0 8px"><strong>Alerts on real days, engine v3.2 vs current v3.4</strong> (share of days with an alert, 95% range resampling people)</p><div id="w-alerts"></div>' +
      '<div class="note" style="margin-top:12px"><strong>Reading:</strong> with its old sleep noise floor the engine raised an action alert on about ' + Math.round(V32.all.pooled.action[0]) + '% of real days across all 13 people, versus ' + (D.benchmark_v32 ? (Object.keys(D.benchmark_v32.scenarios).reduce(function (t, n) { return t + D.benchmark_v32.scenarios[n].false_alarm_pct.action; }, 0) / 5).toFixed(1) : "about 3") + '% in the simulator, mostly from sleep. With the calibrated floor it is ' + V33.all.pooled.action_all[0] + '% across all 13 people and ' + V33.validation.pooled.action_all[0] + '% in the validation half. With only 6 validation people the interval is wide (' + V33.validation.pooled.action_all[1] + '–' + V33.validation.pooled.action_all[2] + '%), and the calibration half is higher (' + V33.calibration.pooled.action_all[0] + '%), so do not read the validation figure as a precise error rate. The sleep advisory (7-night mean under 6 h) fired on ' + V33.all.pooled.sleep_advisory[0] + '% of real days, which is expected for people who sleep under 6 h a quarter of the time.</div>';
    $("#w-noise").innerHTML = table([["Quantity", "Quantity"], ["s", "Simulator"], ["r", "Real (PMData)"]], noise, textFmt);
    $("#w-alerts").innerHTML = table([["Alert", "Alert"], ["a", "v3.2, validation half"], ["b", "v3.4, validation half"], ["c", "v3.2, calibration half"], ["d", "v3.4, calibration half"]], rows, textFmt);
  })();

  /* clinician / expert feedback panel (data in assets/reviews.js) and reviewer outreach text */
  (function () {
    var R = window.AERO_REVIEWS || [], box = $("#reviews-list"); if (!box) return;
    box.innerHTML = R.length ? R.map(function (r) { return '<div class="act"><div>🩺</div><div><strong>' + UI.esc(r.name) + '</strong>, ' + UI.esc(r.role) + ' · ' + UI.esc(r.date) + '<br><span class="mut">Reviewed: ' + UI.esc(r.scope) + '. Verdict: ' + UI.esc(r.verdict) + '.</span>' +
      (r.comments || []).map(function (c) { return '<br>“' + UI.esc(c) + '”'; }).join("") + (r.changes ? '<br><span class="mut">Our response: ' + UI.esc(r.changes) + '</span>' : "") + '</div></div>'; }).join("")
      : '<p style="font-size:.88rem;margin:4px 0 0">No expert has reviewed AEROVYNT yet. Named, dated reviews will appear here.</p>';
    var cp = $("#cp-outreach"); if (cp) cp.addEventListener("click", function () {
      var t = "Subject: 15-minute safety review of an astronaut self-check tool (NASA Space Apps project)\n\nHello,\n\nWe are a student team building AEROVYNT, an offline health self-check for crews far from Earth. It compares each reading with the astronaut's own baseline and gives next steps for non-clinicians. It is a research prototype, not a medical device.\n\nCould you spare 15 minutes to look at our safety limits and escalation wording? We have a one-page sheet listing every limit (watch and action) and every crew-facing instruction, with blank columns for your verdict. Please tell us anything unsafe, missing or wrong. We will publish your feedback only with your permission, naming your role and the date.\n\nSheet: Evidence > Evidence ladder & review > Download reviewer sheet.\nLive prototype: https://aerovynt.earth\n\nThank you,\n[Your name, team, contact]";
      var done = function (m) { cp.textContent = m; setTimeout(function () { cp.textContent = "Copy request to a reviewer"; }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done("Copied"); }, function () { UI.download("reviewer_request.txt", t, "text/plain"); done("Saved as text file"); }); else { UI.download("reviewer_request.txt", t, "text/plain"); done("Saved as text file"); }
    });
  })();

  /* pulse accuracy test: published pairs (assets/pilot-data.js) and pairs recorded on this device (assets/pilot.js) */
  (function () {
    var box = $("#pilot-body"), P = window.AeroPilot; if (!box || !P) return;
    function block(title, st, note) {
      if (!st) return '<div class="pl-blk"><b>' + title + '</b><span class="mut">No pairs yet.</span></div>';
      return '<div class="pl-blk"><b>' + title + '</b><span>' + st.n + ' pairs from ' + st.people + ' ' + (st.people === 1 ? "person" : "people") + '. Mean error ' + st.mae + ' bpm, bias ' + (st.bias > 0 ? "+" : "") + st.bias + ' bpm' +
        (st.loa ? ', 95% limits of agreement ' + st.loa[0] + ' to ' + st.loa[1] + ' bpm' : "") + '. ' + st.within3 + '% within 3 bpm, ' + st.within5 + '% within 5 bpm, worst ' + st.maxerr + ' bpm.' + (note || "") + '</span></div>';
    }
    function draw() {
      var pub = P.stats(P.published()), loc = P.local(), ls = P.stats(loc);
      box.innerHTML = '<p style="font-size:.88rem;margin:0 0 8px">Tests the camera pulse against a reference device on real people. In the Co-Pilot, measure with the camera, read a fingertip oximeter or chest strap within a minute, then save the pair. Aim for 10 or more people, at rest, 2 readings each. Pairs stay on this device until exported.</p>' +
        block("Team pilot (published)", pub, pub && pub.n < 20 ? " Small sample: treat as indicative." : "") + block("This device", ls, "") +
        '<div class="btn-row" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px"><a class="btn btn-primary btn-sm" href="../copilot/#camera">Run a measurement</a><button class="btn btn-sm" id="pl-csv" type="button"' + (loc.length ? "" : " disabled") + '>Export pairs (CSV)</button><button class="btn btn-sm" id="pl-clear" type="button"' + (loc.length ? "" : " disabled") + '>Clear</button></div>';
      var c = $("#pl-csv"), x = $("#pl-clear");
      if (c) c.addEventListener("click", function () { UI.download("aerovynt_pulse_pairs.csv", P.csv(P.local()), "text/csv"); });
      if (x) x.addEventListener("click", function () { P.clear(); draw(); });
      var r4 = $("#rung4 span"); if (r4 && pub) r4.textContent = "Reached on synthetic signals, plus a pilot on " + pub.people + " " + (pub.people === 1 ? "person" : "people") + " (" + pub.n + " pairs against a reference device): mean error " + pub.mae + " bpm, " + pub.within3 + "% within 3 bpm. Small sample, not clinical validation.";
    }
    draw();
  })();

  var showTab = UI.tabs($("#tabs"), function (name) { if (name === "results") drawTraj(); window.dispatchEvent(new Event("resize")); });
  if (/#(ladder|pilot)/.test(location.hash || "")) { showTab("limits"); setTimeout(function () { var l = $("#ladder"); if (l) l.scrollIntoView(); }, 100); }
  drawTraj();
})();
