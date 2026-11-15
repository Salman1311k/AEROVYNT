/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* NASA HRP risk coverage map: which of the 17 published risks AEROVYNT measures, only reflects indirectly, or leaves out of scope.
   Risk names and research titles come from nasa.gov/hrp/risks and nasa.gov/hrp/ongoing-research. */
(function () {
  "use strict";
  var el = document.getElementById("riskmap"); if (!el) return;
  var M = "measured", I = "indirect", O = "out";
  var R = [
    ["Physiology", "Altered immune system responses", I, "Fever, resting heart rate and early flu-like symptoms flag a possible infection. No immune biomarkers.", "Immune Biomarkers (Artemis II), Altered Immunity"],
    ["Physiology", "Altered sensorimotor and vestibular function", O, "Dizziness and coordination are not measured.", ""],
    ["Physiology", "Cardiovascular adaptations", M, "Blood pressure and resting heart rate against your own baseline, plus neck or calf swelling and chest symptoms.", "Venous Haemostasis"],
    ["Physiology", "Decompression sickness", O, "Needs suit-pressure and EVA data that the app does not take.", ""],
    ["Physiology", "Host-microorganism interactions", O, "Microbiome sampling is outside a self-check. Temperature only hints at illness.", ""],
    ["Physiology", "Hypoxia", M, "SpO₂ with a prompt to check cabin O₂ and CO₂ first.", ""],
    ["Physiology", "Inadequate food and nutrition", I, "Hydration colour scale and glucose. No food log yet.", "Food Physiology, Food Acceptability"],
    ["Physiology", "Injury and compromised performance from spacewalks", O, "No EVA workload or suit data.", ""],
    ["Physiology", "Reduced cardiorespiratory and musculoskeletal fitness", I, "Daily exercise minutes against the countermeasure target.", "Zero T2, Standard Measures"],
    ["Physiology", "Spaceflight Associated Neuro-ocular Syndrome (SANS)", I, "Amsler grid test and vision symptoms trigger an escalation. This is screening and cannot replace OCT or ultrasound.", "Brain Fluid Pressure, Thigh Cuff, B-Complex"],
    ["Physiology", "Spaceflight-induced bone changes", I, "Only exercise is tracked, which is the main countermeasure. Bone density is not measured.", "Spinal Health"],
    ["Behavioral", "Behavioral changes and psychiatric disorders", I, "Daily mood trend and a self-harm question that routes to private medical conference.", "ARCHeR, Space Gardening"],
    ["Behavioral", "Inadequate teamwork", O, "Crew-level dynamics are beyond one person’s check-in.", ""],
    ["Behavioral", "Inadequate sleep and irregular schedules", M, "Nightly sleep hours against your baseline, with fatigue guidance before risky tasks.", "ARCHeR (wrist actigraphy)"],
    ["Behavioral", "Inadequate systems operations support", O, "Out of scope for a health tool.", ""],
    ["Behavioral", "Injury from dynamic loads", O, "Landing and re-entry loads are not modelled.", "Spacecraft Occupant Protection"],
    ["Radiation", "Radiation-induced cancers", I, "Environment briefing shows radiation intensity. Dose needs onboard dosimeters, which AEROVYNT does not read.", ""]
  ];
  var LAB = { measured: "Measured daily", indirect: "Indirect signal", out: "Not covered" }, FILT = [["all", "All 17"], [M, "Measured"], [I, "Indirect"], [O, "Not covered"]], cur = "all";
  function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(l) { return R.filter(function (r) { return r[2] === l; }).length; }
  function draw() {
    var rows = R.filter(function (r) { return cur === "all" || r[2] === cur; });
    el.innerHTML = '<div class="g rk-head"><div><div class="kicker">NASA risk coverage</div><h3 class="rk-t">How AEROVYNT lines up with NASA’s 17 published human spaceflight risks</h3>' +
      '<p class="rk-sub">Measured on a daily check: <strong>' + n(M) + '</strong>. Reflected through an indirect signal: <strong>' + n(I) + '</strong>. Not covered: <strong>' + n(O) + '</strong>. We list the gaps on purpose, so you can see what a self-check can and cannot do.</p></div>' +
      '<div class="rk-filter" role="group" aria-label="Filter risks">' + FILT.map(function (f) { return '<button type="button" class="btn btn-sm" data-f="' + f[0] + '" aria-pressed="' + (f[0] === cur) + '">' + f[1] + '</button>'; }).join("") + '</div></div>' +
      '<div class="rk-grid">' + rows.map(function (r) { return '<article class="g rk rk-' + r[2] + '"><div class="rk-top"><span class="rk-grp">' + r[0] + '</span><span class="rk-tag">' + LAB[r[2]] + '</span></div><h4>' + esc(r[1]) + '</h4><p>' + esc(r[3]) + '</p>' +
        (r[4] ? '<p class="rk-nasa"><strong>Related NASA research:</strong> ' + esc(r[4]) + '</p>' : "") + '</article>'; }).join("") + '</div>' +
      '<p class="caption">Source: NASA Human Research Program, Risks of Human Spaceflight and Ongoing HRP Research. The list shows relevance and is not an endorsement by NASA.</p>';
  }
  el.addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; cur = b.getAttribute("data-f"); draw(); var nb = el.querySelector('[data-f="' + cur + '"]'); if (nb) nb.focus(); });
  draw();
})();
