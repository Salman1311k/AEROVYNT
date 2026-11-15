/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT check-in engine: JavaScript port of research/aerovynt_coach.py (verified against Python). Plain JS, no dependencies. */
(function (root) {
  "use strict";
  var D = root.AERO_DATA.coach;
  var IND = D.INDICATORS, ORDER = D.ORDER, SYMPTOMS = D.SYMPTOMS, ZONES = D.ZONES, HAZARDS = D.HAZARDS, ENVS = D.ENVIRONMENTS, SCENARIOS = D.SCENARIOS;
  var RANK = ["emerald", "amber", "crimson"], Z_FLAG = 3.0, MIN_BASE = 5, BASE_WINDOW = 14;

  /* ---------- Python-compatible number helpers ---------- */
  function pyRound(x, d) { // round-half-even on exact ties, like Python round()/format()
    var f = Math.pow(10, d), m = x * Math.pow(2, d + 1);
    var tie = Number.isInteger(m) && m % 2 !== 0;
    var r = tie ? (function () { var n = Math.floor(x * f); return (n % 2 === 0 ? n : n + 1) / f; })() : Number(x.toFixed(d));
    return r === 0 ? 0 : r; // no negative zero
  }
  function fixed(x, d) { var s = pyRound(x, d).toFixed(d); return s === "-0" || /^-0\.0+$/.test(s) ? s.slice(1) : s; }
  function signed(x, d) { var s = fixed(x, d); return (s[0] === "-" ? "" : "+") + s; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  function fmt(key, v) { return fixed(v, IND[key].dec); }
  function lim(key, v) { var s = String(v); return (!Number.isInteger(IND[key].step) && Number.isInteger(v)) ? s + ".0" : s; } // Python prints float limits as 6.0

  /* ---------- assessment ---------- */
  function assessIndicator(key, value, history) {
    var s = IND[key];
    if (!isNum(value)) return { key: key, value: null, status: "unknown", reasons: ["Not measured"], base: null, z: null, delta: null, src: [] };
    var level = 0, reasons = [], src = []; /* src records why: "act" = safety limit, "watch" = watch limit, "sleep" = 7-night floor, "base" = own baseline */
    if (s.act_hi !== null && value >= s.act_hi) { level = 2; src.push("act"); reasons.push("≥ " + lim(key, s.act_hi) + " " + s.unit + " safety limit"); }
    else if (s.warn_hi !== null && value >= s.warn_hi) { level = 1; src.push("watch"); reasons.push("≥ " + lim(key, s.warn_hi) + " " + s.unit + " watch limit"); }
    if (s.act_lo !== null && value <= s.act_lo) { level = 2; src.push("act"); reasons.push("≤ " + lim(key, s.act_lo) + " " + s.unit + " safety limit"); }
    else if (s.warn_lo !== null && value <= s.warn_lo && level < 2) { level = Math.max(level, 1); src.push("watch"); reasons.push("≤ " + lim(key, s.warn_lo) + " " + s.unit + " watch limit"); }
    if (s.roll) { // absolute 7-night floor and sleep debt (same constants as engine v3.3 Layer C): judged against health targets, not the person's own baseline
      var nights = (history || []).slice(-(s.roll.window - 1)).filter(isNum).concat([value]);
      if (nights.length >= s.roll.min_nights) {
        var mean7 = nights.reduce(function (p, q) { return p + q; }, 0) / nights.length;
        var debt = nights.reduce(function (p, q) { return p + Math.max(0, s.roll.target - q); }, 0) / nights.length * s.roll.window;
        var msg = nights.length + "-night average " + fixed(mean7, 2) + " h (sleep debt " + fixed(debt, 0) + " h vs " + fixed(s.roll.target, 0) + " h target)";
        if (mean7 < s.roll.alert) { level = 2; src.push("sleep"); reasons.push(msg + ": below the " + fixed(s.roll.alert, 1) + " h sleep-health floor"); }
        else if (mean7 < s.roll.advisory) { level = Math.max(level, 1); src.push("sleep"); reasons.push(msg + ": below " + fixed(s.roll.advisory, 1) + " h, chronic short sleep"); }
      }
    }
    var base = null, z = null, delta = null;
    var h = (history || []).filter(isNum).slice(-BASE_WINDOW);
    if (h.length >= MIN_BASE) {
      base = median(h);
      var mad = median(h.map(function (x) { return Math.abs(x - base); }));
      var sigma = Math.max(1.4826 * mad, s.floor);
      delta = value - base;
      var adverse = s.sign === 0 ? Math.abs(delta) : s.sign * delta;
      z = adverse / sigma;
      if (z >= Z_FLAG && adverse >= s.min_delta) {
        level = Math.max(level, 1); src.push("base");
        reasons.push(signed(delta, s.dec) + " " + s.unit + " vs your own baseline " + fixed(base, s.dec) + (z >= 3 ? " (well outside your normal range)" : ""));
      }
    } else if (!reasons.length) reasons.push("Learning your baseline (" + h.length + "/" + MIN_BASE + " days)");
    if (!reasons.length) reasons.push("Within your personal range");
    return { key: key, value: value, status: RANK[level], reasons: reasons, base: base, z: z, delta: delta, src: src };
  }
  function worst(list) { var lv = list.filter(function (s) { return RANK.indexOf(s) >= 0; }).map(function (s) { return RANK.indexOf(s); }); return lv.length ? RANK[Math.max.apply(null, lv)] : "emerald"; }
  function column(history, k) { return history.map(function (r) { return r[k]; }); }

  function dueMeasurements(history, today) {
    var out = [];
    ORDER.forEach(function (k) {
      var last = null;
      history.forEach(function (r) { if (isNum(r[k]) && (last === null || r.day > last)) last = r.day; });
      var since = last === null ? null : today - last;
      if (since === null || since >= IND[k].freq) out.push({ key: k, label: IND[k].label, device: IND[k].device, since: since });
    });
    return out;
  }

  function assessCheckin(values, symptoms, history, envKey, today) {
    var ind = {};
    ORDER.forEach(function (k) { ind[k] = assessIndicator(k, values[k], column(history, k)); });
    var sym = {}, symStatus = {};
    Object.keys(SYMPTOMS).forEach(function (k) { sym[k] = !!symptoms[k]; if (sym[k]) symStatus[k] = SYMPTOMS[k][1]; });
    var zones = {};
    Object.keys(ZONES).forEach(function (zn) {
      var z = ZONES[zn], sts = z.indicators.map(function (k) { return ind[k].status; });
      z.symptoms.forEach(function (k) { if (symStatus[k]) sts.push(symStatus[k]); });
      zones[zn] = worst(sts);
    });
    var vals = ORDER.map(function (k) { return ind[k]; });
    var nAmber = vals.filter(function (v) { return v.status === "amber"; }).length;
    var symVals = Object.keys(symStatus).map(function (k) { return symStatus[k]; });
    var nCrimson = vals.filter(function (v) { return v.status === "crimson"; }).length + symVals.filter(function (s) { return s === "crimson"; }).length;
    var overall = nCrimson ? "crimson" : ((nAmber || symVals.length) ? "amber" : "emerald");
    if (overall === "amber" && nAmber >= 3) overall = "crimson";
    var env = ENVS[envKey], hazards = {};
    Object.keys(HAZARDS).forEach(function (hk) {
      hazards[hk] = { level: env.levels[hk], impact: worst(HAZARDS[hk].watch.filter(function (k) { return ind[k]; }).map(function (k) { return ind[k].status; })) };
    });
    var acts = [];
    ORDER.forEach(function (k) {
      var st = ind[k].status;
      if (st === "amber" || st === "crimson") IND[k][st].slice(0, st === "crimson" ? 3 : 2).forEach(function (a) { acts.push([st === "crimson" ? 2 : 1, IND[k].label + ": " + a]); });
    });
    Object.keys(sym).forEach(function (k) { if (sym[k]) acts.push([SYMPTOMS[k][1] === "crimson" ? 2 : 1, SYMPTOMS[k][0] + ": " + SYMPTOMS[k][3]]); });
    acts = acts.map(function (a, i) { return [a, i]; }).sort(function (a, b) { return (b[0][0] - a[0][0]) || (a[1] - b[1]); }).map(function (x) { return x[0]; }); // stable, like Python
    var seen = {}, actions = [];
    acts.forEach(function (a) { if (!seen[a[1]]) { seen[a[1]] = 1; actions.push(a[1]); } });
    if (!actions.length) actions = ["All measured indicators are within your personal range. Keep your exercise, hydration and sleep routine.", "Complete any measurements that are due so your baseline stays reliable."];
    if (nAmber >= 3 && !nCrimson) actions.unshift("Several indicators are off together (pattern). Treat as ACTION: rest, hydrate, repeat measurements and escalate.");
    var due = dueMeasurements(history, today);
    var missing = ORDER.filter(function (k) { return ind[k].status === "unknown"; });
    var score = 100 - 7 * nAmber - 18 * vals.filter(function (v) { return v.status === "crimson"; }).length;
    symVals.forEach(function (s) { score -= s === "amber" ? 8 : 20; });
    score -= Math.min(15, 3 * missing.length);
    score = Math.trunc(Math.max(0, Math.min(100, score)));
    var comms;
    if (env.blackout) comms = "No link to Earth: " + env.escalation;
    else comms = env.escalation;
    return { overall: overall, indicators: ind, symptoms: sym, zones: zones, hazards: hazards, actions: actions.slice(0, 7), due: due, missing: missing, readiness: score, comms: comms, env: envKey, n_amber: nAmber, n_crimson: nCrimson };
  }

  /* Downlink packet: values wrapped in F() print like Python floats (112.0). */
  function F(x) { return { __f: x }; }
  function buildPacket(day, a) {
    var sig = {};
    ORDER.forEach(function (k) {
      var v = a.indicators[k];
      if (v.status === "amber" || v.status === "crimson" || k === "temp_c" || k === "hr_bpm" || k === "sleep_hrs")
        sig[k] = { v: v.value === null ? null : F(pyRound(v.value, 1)), b: v.base === null ? null : F(pyRound(v.base, 1)), z: v.z === null ? null : F(pyRound(v.z, 1)), s: v.status[0] };
    });
    var zones = {};
    Object.keys(a.zones).forEach(function (k) { if (a.zones[k] !== "emerald") zones[k] = a.zones[k]; });
    return { day: Math.trunc(day), lvl: a.overall, rdy: a.readiness, env: a.env, zones: zones, sym: Object.keys(a.symptoms).filter(function (k) { return a.symptoms[k]; }), sig: sig };
  }
  function pyJson(o, indent, sep, lvl) { // json.dumps work-alike
    lvl = lvl || 0;
    if (o === null) return "null";
    if (typeof o === "object" && "__f" in o) { var s = String(o.__f); return /[.e]/.test(s) ? s : s + ".0"; }
    if (typeof o === "number") return String(o);
    if (typeof o === "string") return JSON.stringify(o);
    if (typeof o === "boolean") return String(o);
    var pad = indent ? "\n" + new Array((lvl + 1) * indent + 1).join(" ") : "", end = indent ? "\n" + new Array(lvl * indent + 1).join(" ") : "";
    var kv = indent ? ": " : sep[1], cm = indent ? "," : sep[0];
    if (Array.isArray(o)) return o.length ? "[" + pad + o.map(function (x) { return pyJson(x, indent, sep, lvl + 1); }).join(cm + pad) + end + "]" : "[]";
    var keys = Object.keys(o);
    return keys.length ? "{" + pad + keys.map(function (k) { return JSON.stringify(k) + kv + pyJson(o[k], indent, sep, lvl + 1); }).join(cm + pad) + end + "}" : "{}";
  }
  function packetJson(p, indent) { return pyJson(p, indent || 0, [",", ":"], 0); }

  /* ---------- history, gamification ---------- */
  function progress(history, today) {
    var crew = history.filter(function (r) { return r.source === "crew"; }), xp = 0, full = 0;
    crew.forEach(function (r) { var m = ORDER.filter(function (k) { return isNum(r[k]); }).length; xp += 10 * m + (m === ORDER.length ? 25 : 0); if (m === ORDER.length) full++; });
    var days = crew.map(function (r) { return Math.trunc(r.day); }).sort(function (a, b) { return a - b; }), streak = 0;
    if (days.length && days[days.length - 1] === today - 1) {
      streak = 1;
      for (var i = days.length - 1; i >= 1; i--) { if (days[i] - days[i - 1] === 1) streak++; else break; }
    }
    var badges = [];
    if (crew.length >= 1) badges.push(["🚀", "First Check-In"]);
    if (streak >= 3) badges.push(["🔥", "3-Day Streak"]);
    if (streak >= 7) badges.push(["🏅", "7-Day Streak"]);
    if (full >= 3) badges.push(["🧪", "Full Panel x3"]);
    if (history.length >= 14) badges.push(["📈", "Baseline Builder"]);
    if (crew.length && crew.filter(function (r) { return (isNum(r.exercise_min) ? r.exercise_min : 0) >= 120; }).length >= 3) badges.push(["💪", "Countermeasure Champion"]);
    return { xp: xp, level: Math.floor(xp / 250) + 1, to_next: 250 - xp % 250, streak: streak, badges: badges, logged: crew.length };
  }

  root.Coach = { IND: IND, ORDER: ORDER, SYMPTOMS: SYMPTOMS, ZONES: ZONES, HAZARDS: HAZARDS, ENVS: ENVS, SCENARIOS: SCENARIOS, MIN_BASE: MIN_BASE,
    assessIndicator: assessIndicator, assessCheckin: assessCheckin, dueMeasurements: dueMeasurements, buildPacket: buildPacket, packetJson: packetJson,
    progress: progress, worst: worst, fixed: fixed, signed: signed, pyRound: pyRound, median: median, isNum: isNum, fmt: fmt, lim: lim };
  if (typeof module !== "undefined") module.exports = root.Coach;
})(typeof window !== "undefined" ? window : globalThis);
