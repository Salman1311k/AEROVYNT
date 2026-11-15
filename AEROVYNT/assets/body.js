/* SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md. */
/* AEROVYNT body map v2: an anatomical figure whose organs are the six health zones. Colours come from the engine's zone status,
   the heart beats at the logged heart rate, every organ and label is a keyboard-focusable button. Pure SVG, no libraries. */
(function () {
  "use strict";
  var UI = window.UI, esc = UI.esc, COLOR = UI.COLOR;

  /* where each zone's leader line lands on the body (figure coordinates, before the +70 shift) and where its label sits */
  var ANCHOR = { "Head & Eyes": [236, 56], "Neck & Vascular": [200, 138], "Chest & Lungs": [262, 170], "Core & Metabolic": [236, 262], "Musculoskeletal": [150, 410], "Systemic & Immune": [150, 150] };
  var LABEL = { "Head & Eyes": ["R", 44], "Neck & Vascular": ["L", 100], "Chest & Lungs": ["R", 150], "Core & Metabolic": ["R", 252], "Musculoskeletal": ["L", 400], "Systemic & Immune": ["L", 200] };
  var SHIFT = 70, GREEN = COLOR.emerald;

  function fillFor(c) { return c === GREEN ? "#34D399" : c; }

  function organs(zone, c, hrSec) {
    var f = fillFor(c), st = 'stroke="#fff" stroke-width="1.6" stroke-linejoin="round"', cls = c === GREEN ? "" : " org-alert";
    var out = "";
    if (zone === "Head & Eyes") {
      out += '<g class="org' + cls + '"><path d="M186 52 C185 34 200 26 210 29 C220 26 235 34 234 52 C236 65 226 73 210 73 C194 73 184 65 186 52Z" fill="' + f + '" ' + st + '/>' +
        '<path d="M210 30 V72 M195 42 C201 46 201 54 196 58 M225 42 C219 46 219 54 224 58 M200 63 C205 60 215 60 220 63" fill="none" stroke="#fff" stroke-width="1.3" opacity=".75" stroke-linecap="round"/>' +
        '<ellipse cx="198" cy="84" rx="7" ry="4" fill="#fff" stroke="' + f + '" stroke-width="2"/><circle cx="198" cy="84" r="2.2" fill="' + f + '"/>' +
        '<ellipse cx="222" cy="84" rx="7" ry="4" fill="#fff" stroke="' + f + '" stroke-width="2"/><circle cx="222" cy="84" r="2.2" fill="' + f + '"/></g>';
    } else if (zone === "Neck & Vascular") {
      out += '<g class="org' + cls + '"><path d="M201 102 C199 118 198 132 200 148 M219 102 C221 118 222 132 220 148" fill="none" stroke="' + f + '" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M210 168 C210 168 192 156 192 143 C192 134 203 131 210 140 C217 131 228 134 228 143 C228 156 210 168 210 168Z" fill="' + f + '" ' + st + ' class="heart" style="animation-duration:' + hrSec + 's"/>' +
        '<path d="M210 168 V196" stroke="' + f + '" stroke-width="4" stroke-linecap="round" fill="none" opacity=".8"/></g>';
    } else if (zone === "Chest & Lungs") {
      out += '<g class="org' + cls + '"><path d="M197 130 C182 126 158 142 152 172 C148 198 154 212 172 212 C188 212 197 200 197 180Z" fill="' + f + '" ' + st + ' opacity=".92"/>' +
        '<path d="M223 130 C238 126 262 142 268 172 C272 198 266 212 248 212 C232 212 223 200 223 180Z" fill="' + f + '" ' + st + ' opacity=".92"/>' +
        '<path d="M190 140 C184 160 182 178 184 196 M230 140 C236 160 238 178 236 196" fill="none" stroke="#fff" stroke-width="1.2" opacity=".6" stroke-linecap="round"/></g>';
    } else if (zone === "Core & Metabolic") {
      out += '<g class="org' + cls + '"><path d="M222 222 C246 216 258 232 250 250 C244 264 226 268 218 256 C212 246 212 228 222 222Z" fill="' + f + '" ' + st + '/>' +
        '<path d="M178 252 C170 244 184 238 190 250 C194 262 186 276 178 272 C172 266 172 258 178 252Z" fill="' + f + '" ' + st + ' opacity=".9"/>' +
        '<path d="M242 280 C250 272 262 280 258 292 C254 302 244 300 240 292 C238 288 238 284 242 280Z" fill="' + f + '" ' + st + ' opacity=".9"/>' +
        '<path d="M196 276 C206 270 224 276 232 282" fill="none" stroke="' + f + '" stroke-width="5" stroke-linecap="round" opacity=".85"/></g>';
    } else if (zone === "Musculoskeletal") {
      var bone = function (d) { return '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="8.5" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="' + f + '" stroke-width="5" stroke-linecap="round"/>'; };
      out += '<g class="org' + cls + '">' + bone("M178 346 L174 410 L176 470 L172 534") + bone("M242 346 L246 410 L244 470 L248 534") +
        bone("M142 146 L134 232 L128 292") + bone("M278 146 L286 232 L292 292") +
        '<path d="M186 312 C190 330 200 336 210 330 C220 336 230 330 234 312 C226 304 194 304 186 312Z" fill="' + f + '" ' + st + '/>' +
        '<circle cx="174" cy="440" r="6" fill="' + f + '" ' + st + '/><circle cx="246" cy="440" r="6" fill="' + f + '" ' + st + '/></g>';
    } else {
      out += '<g class="org' + cls + '"><circle cx="190" cy="110" r="5.5" fill="' + f + '" ' + st + '/><circle cx="230" cy="110" r="5.5" fill="' + f + '" ' + st + '/>' +
        '<circle cx="150" cy="150" r="6.5" fill="' + f + '" ' + st + '/><circle cx="270" cy="150" r="6.5" fill="' + f + '" ' + st + '/>' +
        '<circle cx="190" cy="326" r="5.5" fill="' + f + '" ' + st + '/><circle cx="230" cy="326" r="5.5" fill="' + f + '" ' + st + '/>' +
        '<path d="M250 224 C258 220 264 228 262 238 C260 246 252 246 250 240Z" fill="' + f + '" ' + st + '/></g>';
    }
    return out;
  }

  /* opts: { vals: {zone: "short readout"}, hr: bpm number, status: {zone: "emerald|amber|crimson|unknown"} } */
  function svg(colors, selected, opts) {
    opts = opts || {}; var vals = opts.vals || {}, hr = opts.hr > 30 && opts.hr < 200 ? opts.hr : 66, hrSec = Math.round(60 / hr * 100) / 100;
    var zones = ["Chest & Lungs", "Core & Metabolic", "Musculoskeletal", "Systemic & Immune", "Head & Eyes", "Neck & Vascular"], nodes = "", labels = ""; /* draw order: heart and neck vessels on top of the lungs */
    var half = "M210 98 L227 98 L229 118 C256 122 282 130 294 146 C302 160 304 190 306 226 L314 298 C316 312 298 316 296 302 L288 250 L284 204 C281 236 280 262 282 304 L286 336 C288 360 286 392 282 420 L290 560 C291 574 262 576 258 566 L244 446 L236 410 L228 362 L210 346 Z";
    var body = '<g filter="url(#bm-soft)"><ellipse cx="210" cy="62" rx="34" ry="40" fill="url(#bm-body)" stroke="#fff" stroke-width="2"/>' +
      '<path d="' + half + '" fill="url(#bm-body)" stroke="#fff" stroke-width="2"/><path transform="translate(420,0) scale(-1,1)" d="' + half + '" fill="url(#bm-body)" stroke="#fff" stroke-width="2"/></g>';
    zones.forEach(function (z) {
      var c = colors[z] || COLOR.unknown, sel = z === selected, a = ANCHOR[z], l = LABEL[z], right = l[0] === "R";
      var lx = right ? 410 : 150, ly = l[1], tx = right ? lx + 8 : lx - 8, anchor = right ? "start" : "end";
      var ax = a[0] + SHIFT, ay = a[1];
      var aria = z + ": " + (vals[z] || "") + (colors[z] === GREEN ? ", normal" : colors[z] === COLOR.amber ? ", watch" : colors[z] === COLOR.crimson ? ", action needed" : ", no data");
      nodes += '<g class="zone-node' + (sel ? " is-sel" : "") + '" data-zone="' + esc(z) + '" tabindex="0" role="button" aria-label="' + esc(aria) + '" aria-pressed="' + sel + '">' +
        '<g class="org-hit">' + organs(z, c, hrSec) + '</g>' +
        (sel ? '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="22" fill="none" stroke="#0A84FF" stroke-width="2" stroke-dasharray="4 4" class="sel-ring"/>' : '') + '</g>';
      var w = 138, h = 44, rx = right ? lx : lx - w, tag = '<tspan class="bm-sub">' + esc(vals[z] || "") + '</tspan>';
      labels += '<g class="zone-node bm-label' + (sel ? " is-sel" : "") + '" data-zone="' + esc(z) + '">' +
        '<line x1="' + (right ? lx : lx) + '" y1="' + ly + '" x2="' + ax + '" y2="' + ay + '" stroke="' + c + '" stroke-width="1.6" opacity=".75" stroke-dasharray="' + (sel ? "0" : "3 3") + '"/>' +
        '<rect x="' + rx + '" y="' + (ly - h / 2) + '" width="' + w + '" height="' + h + '" rx="12" fill="#fff" stroke="' + (sel ? "#0A84FF" : "#D6E4F7") + '" stroke-width="' + (sel ? 2.2 : 1.2) + '"/>' +
        '<circle cx="' + (rx + 14) + '" cy="' + (ly - 8) + '" r="5" fill="' + c + '"/>' +
        '<text x="' + (rx + 26) + '" y="' + (ly - 4.5) + '" font-size="11.2" font-weight="800" fill="#12305C" font-family="Inter,sans-serif">' + esc(z.length > 17 ? z.replace(" & ", " & ") : z) + '</text>' +
        '<text x="' + (rx + 14) + '" y="' + (ly + 14) + '" font-size="10" font-weight="600" fill="#52657F" font-family="Inter,sans-serif">' + esc(vals[z] || "not measured") + '</text></g>';
    });
    return '<svg class="bodymap" width="100%" viewBox="0 0 560 590" xmlns="http://www.w3.org/2000/svg" style="max-width:600px" role="group" aria-label="Interactive body map with six health zones. Each organ group is a button.">' +
      '<defs><linearGradient id="bm-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C7DDFF"/><stop offset="100%" stop-color="#E4E1FF"/></linearGradient>' +
      '<filter id="bm-soft" x="-20%" y="-10%" width="140%" height="130%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#1F468C" flood-opacity=".2"/></filter></defs>' +
      '<g transform="translate(' + SHIFT + ',0)">' + body + nodes + '</g>' + labels + '</svg>';
  }

  /* which spaceflight hazards act on a zone: hazards whose watch-list includes one of the zone's indicators */
  function hazardsFor(zone, C, env) {
    var zi = C.ZONES[zone], out = [];
    Object.keys(C.HAZARDS).forEach(function (hk) {
      var h = C.HAZARDS[hk], hit = h.watch.some(function (k) { return zi.indicators.indexOf(k) >= 0; });
      if (hit) out.push({ key: hk, name: h.name, icon: h.icon, level: env && env.levels ? env.levels[hk] : null });
    });
    return out;
  }

  window.AeroBody = { svg: svg, hazardsFor: hazardsFor };
})();
