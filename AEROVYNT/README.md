# AEROVYNT static site

Team: Muhammad Salman and Sayed Hamza. NASA Space Apps Challenge 2026. See SI_DISCLOSURE.md.

Plain HTML, CSS and JavaScript. Upload this folder to your web root (Porkbun static hosting). Also opens by double-clicking index.html.

- index.html Home, copilot/ Co-Pilot, evidence/ Evidence
- assets/ shared CSS and JS; assets/data.js holds the cached benchmark, NASA OSD-575 table and demo history
- research/ original Python engine and data; regenerate cached data with: cd research && python tools/build_data.py
- sw.js, manifest.webmanifest, assets/pwa.js: offline support and installability (needs https; bump VERSION in sw.js on each release)
- assets/risks.js: NASA HRP risk coverage map shown in Co-Pilot > Trends & hazards
- assets/pages.css and assets/stars.js: shared dark mission stage used by Co-Pilot and Evidence (Home keeps its own home.css/home.js)

## Mars transit simulator (mission/, cache aerovynt-v39)

- mission/index.html: self-contained 180-day transit demo. Crew dashboard (4 crew), editable profile, simulated sensor stream, five risk domains (radiation, sleep/circadian, deconditioning, hydration, wellbeing), explainable alerts with rule and clock (fast/slow), recommendations, countermeasure planner with a no-countermeasure comparison line, mission log (events and daily data, CSV export) and a provenance table separating simulated inputs, published constants and modeled assumptions. Local only, cached for offline use.
- Not done: validated radiation cancer/CNS models, per-person genetics, clinical review, mapping to the existing Co-Pilot check-in data.

## Final submission (cache aerovynt-v38)

- Home: proof bar now shows the action-level detection range across all five simulated scenarios and a "Where it is weak" line; "168/168" is labelled a data-integrity check, not a validation; "Tested before flight" renamed.
- Evidence: new limitation that thresholds were set on the same simulator and that simulator noise is lower than real wearables.
- Team names added to footers; SI_DISCLOSURE.md completed; evidence-ladder count corrected to 3 of 6.

## AEROVYNT: previous release

- Check-in console: numbered groups (Vitals, Body and routine, Mind, Symptoms); 1-10 tap scales for mood, stress and hydration that are tinted by the status each value would get; a "Same as last" shortcut on every field; symptom pills with "None today"; a sticky save bar with live status and readiness.
- Stress (1-10) is now a scored indicator (high is bad; watch at 7, action at 9; same personal-baseline rule as the others) and sits with Mood in the Head & Eyes zone and in a combined Mood · Stress card. It was added after the research benchmark and is not part of it. Seed history, demo days, hazards and reviewer sheet include it.
- Earlier releases below. Cache version aerovynt-v32.

## Release v4.2

- Differentiation: a "Move the crew away from Earth" slider on Home (space station to Mars, or no link) changes the fast-clock and slow-clock advice live. The static signal bar was removed.
- "What you will not find in a plain health tracker": four tiles (delay-aware advice, body map, camera pulse, checked on real NASA data) and a compact evidence-ladder bar (3 of 6 rungs reached, unreached ones shown).
- Delay.advice() in assets/delay.js. Cache version aerovynt-v31.

## Release v4.1

- Judge-first layout: Home has a 30-second demo button, a three-number proof strip (simulated results labelled) and a 3-step explainer; the 6-card section and long paragraphs are gone.
- Co-Pilot: 3 tabs (Body map, Check-in & report, Trends & hazards). The check-in banner, Reset and Skip-day buttons are merged or removed; "Log today's check-in" sits beside the demo days.
- Sealed report: the report for Earth carries a SHA-256 seal and can be verified offline (Check-in & report > Verify). It detects edits; it is not an identity signature.
- Evidence: 2 tabs (Results, Limits & review); simulation merged into Results; review cards merged; pilot test collapsed.
- Motion: animated ECG line under the headline, orbit, scrolling ticker and scroll-reveal (all off with reduced-motion). assets/fx.js.
- "Offline ready" badge once the service worker is active. Cache version aerovynt-v30.

## Release v4.0

- Two clocks (assets/delay.js): every alert is sorted onto a FAST clock (a safety limit or urgent symptom) or a SLOW clock (drift from the person's own baseline), and the advice changes with the Earth round-trip time. Shown as the Reply clock card in the Co-Pilot and in the Home demo (pick a place and a day). The engine statuses are unchanged; the rule is a design choice, not clinically tested.
- Pulse accuracy test (assets/pilot.js, assets/pilot-data.js): after a camera reading, save a reference-device pair. Agreement statistics (bias, limits of agreement, share within 3 and 5 bpm) appear in Evidence > Status & limits. pilot-data.js is empty until real measurements are pasted in.
- Fewer tabs: Co-Pilot has Body map, Check-in, Trends, Hazards & guide; Evidence has Real data, Simulation, Status & limits. Duplicate buttons and sections removed, copy shortened.
- Cache version aerovynt-v28.

## Release v3.10.1

- Camera pulse button added to the Co-Pilot top banner ("Pulse with camera"), plus a build stamp in the Co-Pilot footer to confirm which version is live. Cache v26.

## Release v3.10

- Body map v2 (assets/body.js): anatomical figure, six organ groups (brain and eyes, heart and neck vessels, lungs, gut and kidneys, bones, immune nodes) coloured by zone status, heart beats at the logged pulse, keyboard accessible, hazards acting on each zone, "measure this" shortcuts. It is now the first tab in the Co-Pilot.
- Camera pulse (assets/camera.js): fingertip photoplethysmography in the browser, with a quality gate and a clearly labelled simulated demo. Processed locally, nothing stored. Tested on synthetic traces only (47 of 48 within 3 bpm, no false readings on 100 noise traces); not yet validated on people.
- Guided demo (assets/tour.js): "Play 30-second demo" in the Co-Pilot, or open copilot/#tour.
- Evidence ladder (Evidence > Evidence ladder & review): seven rungs with reached / not reached, a reviewer outreach text, and assets/reviews.js where real, permitted expert feedback is added. It ships empty on purpose.
- Simulation results are labelled SIMULATED on the home and evidence pages.
- Offline cache version aerovynt-v25.

## Release v3.7

- Sensor feed: sleep is now a once-per-night value set on connect (it no longer jitters every second); fever drift applies a single poor-night report.
- Evidence page slimmed down: raw tables, sensitivity heatmaps, stress-test panel, replay and sensor-feed cards removed from the page (data and scripts remain in research/); limitations consolidated; sources caption now cites the OSDR data-access paper.
- Home: new "How it answers the challenge" section.
- SI (Super Intelligence) disclosure added: SI_DISCLOSURE.md, header comments in code files, meta tag and footer line on each page.
- Offline worker now fetches pages and assets network-first (fresh when online, cache only when offline); pwa.js reloads once when an updated worker takes over; the sensor feed self-repairs a stale cache by clearing it and reloading once. Cache version aerovynt-v24.

## Engine v3.4

- Self-calibrated noise guard: sigma is floored by the baseline's own recent out-of-sample forecast errors (last 28 clean days), which cuts false alarms when data has day-to-day memory. Slow 25-45 day cycles are still a known weakness (see Evidence > Engine benchmarks).
- Benchmarks and stress tests now include a plain personal rolling z-score comparator, not only fixed Earth rules. New stress seeds (63000+); v3.3 results are archived in research/archive/.
- research/aerovynt_replay.py: replays the engine on any labelled wearable table (illness labels) and reports false alarms and detection with 95% intervals that resample people. Not yet run on real labelled data. `python aerovynt_replay.py --make-example` writes a SYNTHETIC test file.
- assets/sensors.js: Co-Pilot > Log vitals > Sensor feed. Import CSV/JSON device exports or run a clearly labelled mock telemetry stream. All local.
- Evidence > Review & next steps: honest clinical-review status and a downloadable reviewer sheet. No clinician has reviewed the prototype yet; add real feedback there when you have it.
- Regenerate everything: cd research && python aerovynt_engine.py && python aerovynt_realdata.py && python aerovynt_robustness.py && python tools/build_data.py

## Engine v3.3

- research/aerovynt_engine.py v3.3: sleep noise floor 0.9 h (calibrated on real wearable data), a sleep-health layer (7-night mean below 6.0 h = advisory, below 5.0 h = alert, sleep debt vs a 7 h target), benchmarks with and without the Earth-rule sleep clause.
- research/aerovynt_realdata.py: real-wearable check on PMData (Thambawita et al. 2020, CC BY 4.0). Ships only a derived table (data/pmdata_daily.csv: day index, weekday, sleep hours, resting heart rate). PMData has NO illness labels, so it checks noise assumptions and alert rates, not detection.
- research/aerovynt_robustness.py: stress tests on new seeds (47000+), including a condition that resamples real sleep noise.
- research/archive/: the v3.2 results, kept for comparison.
- Regenerate everything: cd research && python aerovynt_engine.py && python aerovynt_realdata.py && python aerovynt_robustness.py && python tools/build_data.py
- Sleep targets come from published guidance and are not clinically confirmed for spaceflight.
