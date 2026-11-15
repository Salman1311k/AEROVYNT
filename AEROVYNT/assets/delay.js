/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT reply-time triage ("two clocks"). Sorts every alert into a FAST clock (a safety limit or urgent symptom: the Earth reply may arrive too late to matter)
   or a SLOW clock (drift from the person's own baseline: days, so Earth's delay changes nothing), then says what to do given the current Earth round-trip time.
   It only reads the check-in assessment; it does not change any status. */
(function (root) {
  "use strict";
  var C = root.Coach;
  function roundTrip(env) { return env.blackout ? null : (env.one_way_min ? 2 * env.one_way_min : 0); }
  function fmtMin(m) { return m < 1 ? "under 1 min" : (m < 90 ? Math.round(m) + " min" : (Math.round(m / 6) / 10) + " h"); }
  function classify(A) {
    var fast = [], slow = [];
    C.ORDER.forEach(function (k) {
      var v = A.indicators[k]; if (v.status !== "amber" && v.status !== "crimson") return;
      var item = { label: C.IND[k].label, status: v.status, why: v.reasons[v.reasons.length - 1] };
      (v.src.indexOf("act") >= 0 ? fast : slow).push(item);
    });
    Object.keys(A.symptoms).forEach(function (k) {
      if (!A.symptoms[k]) return; var sy = C.SYMPTOMS[k], item = { label: sy[0], status: sy[1], why: "Reported symptom" };
      (sy[1] === "crimson" ? fast : slow).push(item);
    });
    return { fast: fast, slow: slow };
  }
  function triage(A, env) {
    var c = classify(A), rt = roundTrip(env), blackout = !!env.blackout, head, body, send, mode;
    if (c.fast.length) {
      mode = "fast"; send = "now";
      if (blackout) { head = "No link. Act on board now."; body = "Follow the checklist. The Crew Medical Officer decides. Save the report to send when the link returns."; }
      else if (rt < 1) { head = "Call the Flight Surgeon now."; body = "The link is live. Send the report while you call."; }
      else if (rt < 5) { head = "Call now. The delay is only a few seconds."; body = "Advice arrives at once; the slow part is evacuation, which takes days. Send the report while you call."; }
      else { head = "Act on board now. Do not wait for Earth."; body = "The earliest reply is " + fmtMin(rt) + " away. Start the onboard checklist and send the report at the same time."; }
    } else if (c.slow.length) {
      mode = "slow"; send = blackout ? "queue" : "now";
      head = A.overall === "crimson" ? (blackout ? "Pattern across indicators. Queue the report." : "Pattern across indicators. Send the report now.") : "Slow change. Act, report, re-check.";
      body = blackout ? "Queue the report for the next link and re-measure at the next check-in." : (rt >= 1 ? "A reply in " + fmtMin(rt) + " changes nothing here. Send the report and re-measure at the next check-in." : "Send the report on the next call and re-measure at the next check-in.");
    } else { mode = "none"; send = "daily"; head = "Nothing urgent to send."; body = "The daily summary is enough."; }
    return { rt: rt, blackout: blackout, fast: c.fast, slow: c.slow, mode: mode, send: send, head: head, body: body };
  }
  /* advice for a generic fast or slow event at a given round-trip time (minutes; null = no link). Used by the home-page slider. */
  function advice(mode, rt) {
    if (mode === "fast") {
      if (rt === null) return { head: "No link. Act on board now.", body: "Follow the checklist; the crew medical officer decides. Save the report for when the link returns." };
      if (rt < 1) return { head: "Call the Flight Surgeon now.", body: "The link is live. Send the report while you call." };
      if (rt < 5) return { head: "Call now. The delay is seconds.", body: "Advice arrives at once. Send the report while you call." };
      return { head: "Act on board now. Do not wait for Earth.", body: "The earliest reply is " + fmtMin(rt) + " away. Start the onboard checklist and send the report at the same time." };
    }
    if (rt === null) return { head: "Queue the report.", body: "Send it when the link returns and re-measure at the next check-in." };
    return { head: "Send the report, re-measure.", body: (rt >= 1 ? "A reply in " + fmtMin(rt) + " changes nothing here. " : "") + "Drift builds over days, so the delay does not matter." };
  }
  root.Delay = { advice: advice, roundTrip: roundTrip, fmtMin: fmtMin, classify: classify, triage: triage };
  if (typeof module !== "undefined") module.exports = root.Delay;
})(typeof window !== "undefined" ? window : globalThis);
