# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""
AEROVYNT Crew Co-Pilot: self-assessment, hazard mapping, guidance and gamification.

Design rules
- Personal baseline first (median/MAD, same method as aerovynt_engine), absolute safety nets second.
- Missing measurements are never treated as normal.
- Guidance is general crew-self-care + escalation, never drug dosing. Prototype, not a medical device.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import aerovynt_engine as engine

RANK = ["emerald", "amber", "crimson"]
Z_FLAG = 3.0
MIN_BASE = 5
BASE_WINDOW = 14

# --------------------------------------------------------------------------------------
# NASA HRP five hazards
# --------------------------------------------------------------------------------------
HAZARDS = {
    "radiation": dict(
        name="Space Radiation", icon="☢️",
        blurb="Galactic cosmic rays and solar particle events raise cancer, cardiovascular, immune and CNS risk.",
        watch=["temp_c", "hr_bpm", "mood"],
        countermeasure="Shelter during solar particle events, track cumulative dose, protect sleep and immune health.",
    ),
    "isolation": dict(
        name="Isolation & Confinement", icon="🧠",
        blurb="Small crew, monotony and sleep/circadian disruption erode mood, cognition and team cohesion.",
        watch=["mood", "sleep_hrs"],
        countermeasure="Protect sleep, schedule private time and crew social time, do a daily mood check, use private medical conference early.",
    ),
    "distance": dict(
        name="Distance from Earth", icon="📡",
        blurb="Delayed or no communication and no quick evacuation: crews must self-assess and self-treat.",
        watch=["sys_bp", "dia_bp", "hr_bpm", "temp_c", "glucose", "sleep_hrs", "spo2_pct", "mood", "urine_color", "exercise_min"],
        countermeasure="On-board guidance, saved reports, checklists and clear escalation rules.",
    ),
    "gravity": dict(
        name="Altered Gravity Fields", icon="⚖️",
        blurb="Fluid shifts, bone and muscle unloading, vision changes (SANS) and cardiovascular deconditioning.",
        watch=["sys_bp", "dia_bp", "hr_bpm", "urine_color", "exercise_min", "glucose"],
        countermeasure="2+ h/day resistive and aerobic exercise, hydration and nutrition, daily vision check, post-landing reconditioning.",
    ),
    "closed_env": dict(
        name="Hostile Closed Environment", icon="🫧",
        blurb="Recycled air, CO₂, noise, microbes and temperature in a sealed vehicle or habitat.",
        watch=["spo2_pct", "sleep_hrs", "temp_c", "urine_color"],
        countermeasure="Monitor cabin CO₂ and O₂, hygiene and cleaning schedule, noise control, report headaches early.",
    ),
}

# 1-5 relative hazard intensity
ENVIRONMENTS = {
    "iss": dict(name="ISS / Low Earth Orbit", icon="🛰️", one_way_min=0.0, blackout=False,
                levels=dict(radiation=2, isolation=2, distance=1, gravity=5, closed_env=3),
                kit="Full medical kit, ultrasound, ground medical support (live)",
                escalation="Live private medical conference with the Flight Surgeon."),
    "artemis": dict(name="Artemis / Orion Deep-Space Transit", icon="🚀", one_way_min=0.0, blackout=False,
                    levels=dict(radiation=4, isolation=3, distance=3, gravity=5, closed_env=5),
                    kit="Compact kit, limited diagnostics, near-real-time comms",
                    escalation="Near-real-time link with short delays; prepare data before calling."),
    "moon": dict(name="Lunar Surface Base / Rover", icon="🌙", one_way_min=0.02, blackout=False,
                 levels=dict(radiation=4, isolation=3, distance=3, gravity=3, closed_env=4),
                 kit="Habitat kit, dust exposure risk, rover suits",
                 escalation="About 1.3 s light delay. Conversation is possible, but evacuation takes days."),
    "mars_transit": dict(name="Mars Transit (22 min delay)", icon="🔴", one_way_min=22.0, blackout=False,
                         levels=dict(radiation=5, isolation=5, distance=5, gravity=5, closed_env=4),
                         kit="Medical decision support that works without Earth is essential",
                         escalation="Reply from Earth takes 44 min round trip. Act on the onboard checklist first, then send the report to Earth."),
    "mars_surface": dict(name="Mars Surface Habitat / Rover", icon="🏜️", one_way_min=22.0, blackout=False,
                         levels=dict(radiation=4, isolation=5, distance=5, gravity=3, closed_env=4),
                         kit="Habitat kit, dust toxicity, long-range rover isolation",
                         escalation="44 min round trip. During solar conjunction there is no link: reports are saved and sent later."),
    "conjunction": dict(name="Solar Conjunction (no link)", icon="☀️", one_way_min=None, blackout=True,
                        levels=dict(radiation=4, isolation=5, distance=5, gravity=4, closed_env=4),
                        kit="Fully autonomous operations",
                        escalation="No ground link for weeks. Crew Medical Officer decides; save the report to send later."),
}

# --------------------------------------------------------------------------------------
# Indicators: what to measure, why, how, thresholds, guidance
# --------------------------------------------------------------------------------------
INDICATORS = {
    "sys_bp": dict(
        label="Systolic blood pressure", unit="mmHg", dec=0, step=1, lo=70, hi=220, default=112, zone="Neck & Vascular",
        warn_hi=140, act_hi=160, warn_lo=95, act_lo=85, sign=0, min_delta=12, floor=4, freq=2,
        device="Automatic upper-arm BP cuff", hazards=["gravity", "distance"],
        why="Microgravity shifts fluid toward the head, lowers plasma volume and changes baroreflexes. BP often drops in flight and after landing; high BP can signal stress, sleep loss or fluid retention.",
        how=["Sit or float relaxed for 5 min.", "Cuff on the bare upper arm at heart level.", "Do not talk or move; take 2 readings 1 min apart and log the second."],
        amber=["Repeat in 30 min after rest and hydration.", "Review sleep, caffeine, sodium, stress and recent exercise.", "If persistent for 2 days, add to the next medical conference."],
        crimson=["Stop strenuous work and rest; repeat the measurement.", "Check for chest pain, severe headache, vision change or fainting.", "Escalate to the Crew Medical Officer and Flight Surgeon now."],
    ),
    "dia_bp": dict(
        label="Diastolic blood pressure", unit="mmHg", dec=0, step=1, lo=40, hi=140, default=74, zone="Neck & Vascular",
        warn_hi=90, act_hi=100, warn_lo=55, act_lo=50, sign=0, min_delta=8, floor=3, freq=2,
        device="Automatic upper-arm BP cuff", hazards=["gravity"],
        why="Pairs with systolic BP to show vascular load and volume status.",
        how=["Taken with the systolic reading in the same cuff cycle."],
        amber=["Repeat after rest; compare with your own 2-week baseline."],
        crimson=["Rest, repeat and escalate with the systolic value."],
    ),
    "hr_bpm": dict(
        label="Resting heart rate", unit="bpm", dec=0, step=1, lo=30, hi=200, default=64, zone="Neck & Vascular",
        warn_hi=100, act_hi=120, warn_lo=45, act_lo=40, sign=0, min_delta=8, floor=2, freq=1,
        device="Wrist or chest strap, or pulse oximeter", hazards=["gravity", "radiation", "distance"],
        why="Rises with infection, dehydration, deconditioning and stress. A drift above your own baseline is an early infection or overtraining signal.",
        how=["Measure on waking, before exercise or caffeine.", "Rest 5 min, then read 60 s of stable pulse."],
        amber=["Hydrate and rest; repeat tomorrow morning.", "Check temperature and sleep for an early infection pattern."],
        crimson=["Stop exercise and sit or float at rest; repeat in 10 min.", "Check for chest pain, dizziness or breathlessness.", "Escalate to the Crew Medical Officer."],
    ),
    "temp_c": dict(
        label="Body temperature (oral)", unit="°C", dec=1, step=0.1, lo=34.0, hi=42.0, default=36.8, zone="Systemic & Immune",
        warn_hi=38.0, act_hi=39.0, warn_lo=35.5, act_lo=35.0, sign=1, min_delta=0.5, floor=0.15, freq=1,
        device="Medical thermometer", hazards=["radiation", "closed_env"],
        why="Fever is an early marker of infection and immune reactivation. Core temperature in flight runs slightly higher at rest and during exercise, so compare against your own baseline.",
        how=["Measure at rest, not within 20 min of hot drinks or exercise.", "Use the same thermometer and site each day."],
        amber=["Rest, hydrate, and recheck in 4 h.", "Log other symptoms: cough, sore throat, cold-sore tingling, rash.", "Limit close crew contact and wipe shared surfaces."],
        crimson=["Isolate if possible, and escalate now.", "Start the onboard fever checklist.", "Downlink the packet with temperature, heart rate and symptoms."],
    ),
    "glucose": dict(
        label="Fasting blood glucose", unit="mg/dL", dec=0, step=1, lo=30, hi=400, default=88, zone="Core & Metabolic",
        warn_hi=100, act_hi=126, warn_lo=70, act_lo=54, sign=0, min_delta=12, floor=3, freq=3,
        device="Glucometer (fingerstick)", hazards=["gravity", "radiation"],
        why="Stress hormones, exercise changes and sleep loss alter insulin sensitivity in flight; post-flight values can also swing. Compare against your own pre-flight and in-flight baseline.",
        how=["Fast 8 h; wash and dry hands.", "Fingerstick on the side of the fingertip.", "Apply the drop and log the result."],
        amber=["Repeat the fasting check tomorrow.", "Review meals, sleep and exercise timing.", "Add to the next flight surgeon conference."],
        crimson=["High: hydrate, check symptoms, repeat and escalate.", "Low (<54 mg/dL): take fast carbohydrate and recheck in 15 min.", "Escalate and log the event."],
    ),
    "sleep_hrs": dict(
        label="Sleep last night", unit="h", dec=1, step=0.1, lo=0.0, hi=14.0, default=6.8, zone="Head & Eyes",
        warn_hi=None, act_hi=None, warn_lo=6.0, act_lo=4.5, sign=-1, min_delta=1.0, floor=0.9, freq=1,
        roll=dict(window=7, min_nights=4, advisory=6.0, alert=5.0, target=7.0),  # sleep-health layer, same constants as engine v3.3 Layer C
        device="Sleep log or wrist tracker", hazards=["isolation", "closed_env", "distance"],
        why="Noise, light, CO₂ and shifting work schedules shorten sleep. Short sleep degrades judgement, mood, immunity and glucose control.",
        how=["Log total hours of sleep after waking.", "Note awakenings or noise."],
        amber=["Protect a fixed sleep window; reduce light and noise.", "Avoid caffeine in the 6 h before sleep.", "Avoid critical tasks without a double check."],
        crimson=["Defer high-risk tasks (EVA, docking, medical procedures).", "Escalate fatigue to the commander and flight surgeon.", "Schedule recovery sleep."],
    ),
    "mood": dict(
        label="Mood / wellbeing (10 = great)", unit="/10", dec=0, step=1, lo=1, hi=10, default=7, zone="Head & Eyes",
        warn_hi=None, act_hi=None, warn_lo=5, act_lo=3, sign=-1, min_delta=2, floor=0.7, freq=1,
        device="Self-rating (1 minute)", hazards=["isolation", "radiation", "distance"],
        why="Isolation and confinement are a top behavioral-health risk. A falling trend is an early warning, and a quick daily score makes it visible.",
        how=["Rate your overall mood now.", "Add a note if something changed."],
        amber=["Talk to a crew member or schedule a private family call.", "Take a break, exercise or do a hobby.", "Add behavioral health to the next conference."],
        crimson=["Contact the Crew Medical Officer or request a private conference now.", "You are not alone; help is available. Do not wait."],
    ),
    "spo2_pct": dict(
        label="Blood oxygen (SpO₂)", unit="%", dec=0, step=1, lo=70, hi=100, default=98, zone="Chest & Lungs",
        warn_hi=None, act_hi=None, warn_lo=95, act_lo=92, sign=-1, min_delta=2, floor=0.5, freq=2,
        device="Fingertip pulse oximeter", hazards=["closed_env"],
        why="Low SpO₂ can reflect cabin atmosphere problems (O₂ or CO₂), lung issues or infection. It is an immediate safety check.",
        how=["Warm the hand; remove nail polish.", "Clip on the finger, hold still for 30 s.", "Log the stable number."],
        amber=["Check cabin O₂ and CO₂ readings.", "Repeat after deep breaths and rest."],
        crimson=["Check the atmosphere monitors first.", "Use the emergency atmosphere checklist if cabin readings are off.", "Escalate immediately."],
    ),
    "urine_color": dict(
        label="Urine color / hydration (1-8)", unit="scale", dec=0, step=1, lo=1, hi=8, default=3, zone="Core & Metabolic",
        warn_hi=5, act_hi=7, warn_lo=None, act_lo=None, sign=1, min_delta=2, floor=0.6, freq=1,
        device="Color chart", hazards=["gravity", "closed_env"],
        why="Plasma volume falls in microgravity and thirst is blunted; hydration also affects kidney-stone risk and exercise tolerance.",
        how=["Compare the first void of the day against the 1-8 color chart (1 = pale, 8 = dark)."],
        amber=["Drink 500 mL now and rehydrate through the day.", "Review sodium and exercise sweat loss."],
        crimson=["Rehydrate; check for dizziness, low urine output or flank pain.", "Escalate if flank pain, fever or blood in urine."],
    ),
    "exercise_min": dict(
        label="Exercise today", unit="min", dec=0, step=5, lo=0, hi=300, default=120, zone="Musculoskeletal",
        warn_hi=None, act_hi=None, warn_lo=60, act_lo=30, sign=-1, min_delta=30, floor=10, freq=1,
        device="Treadmill / bike / resistive device log", hazards=["gravity"],
        why="Resistive and aerobic exercise (about 2 h/day on the ISS) is the primary countermeasure for bone loss, muscle atrophy and cardiovascular deconditioning.",
        how=["Log total minutes of aerobic plus resistive exercise."],
        amber=["Re-schedule missed sessions; do not skip two days in a row.", "Check protein and calorie intake."],
        crimson=["Review the prescription with the exercise physiologist.", "Check for pain or injury that prevents exercise."],
    ),
}
ORDER = list(INDICATORS)

SYMPTOMS = {
    "vision_blur": ("Blurred or wavy vision (Amsler grid)", "amber", "Head & Eyes",
                    "Repeat the Amsler grid test one eye at a time; log it and flag it for ocular ultrasound/OCT review (possible SANS)."),
    "vision_spot": ("Central blind spot / sudden vision loss", "crimson", "Head & Eyes",
                    "Possible SANS or acute eye problem. Escalate now, and cover one eye at a time to document which one."),
    "headache": ("Severe headache, confusion or drowsiness", "crimson", "Head & Eyes",
                 "Check cabin CO₂ and O₂ first, then vitals. Escalate: this can be an atmosphere or intracranial issue."),
    "neck_calf": ("One-sided neck or calf swelling, pain or fullness", "crimson", "Neck & Vascular",
                  "Possible venous clot. Do not massage the area; escalate immediately and request an ultrasound."),
    "chest": ("Chest pain or breathlessness at rest", "crimson", "Chest & Lungs",
              "Stop activity, check SpO₂, check cabin atmosphere, escalate immediately."),
    "prodrome": ("Cold sore, rash or early flu-like signs", "amber", "Systemic & Immune",
                 "Latent virus reactivation is common in flight. Log it, check temperature trends and tell the Crew Medical Officer."),
    "self_harm": ("Thoughts of harming myself", "crimson", "Head & Eyes",
                  "You deserve support now. Please contact the Crew Medical Officer or request a private medical conference immediately. If you are with someone, tell them."),
}

ZONES = {
    "Head & Eyes": dict(fn="Brain, vision and sleep/mood regulation.",
                        space="Headward fluid shift can cause Spaceflight-Associated Neuro-Ocular Syndrome (SANS); isolation affects mood and sleep.",
                        indicators=["sleep_hrs", "mood"], symptoms=["vision_blur", "vision_spot", "headache", "self_harm"]),
    "Neck & Vascular": dict(fn="Blood pressure, jugular flow and heart-rate regulation.",
                            space="Fluid redistribution, reduced plasma volume and slower jugular flow change vascular risk, including venous clots.",
                            indicators=["sys_bp", "dia_bp", "hr_bpm"], symptoms=["neck_calf"]),
    "Chest & Lungs": dict(fn="Breathing and oxygen delivery.",
                          space="Closed-cabin air (CO₂, O₂), dust and deconditioning affect oxygen delivery.",
                          indicators=["spo2_pct"], symptoms=["chest"]),
    "Core & Metabolic": dict(fn="Glucose control, kidneys and hydration.",
                             space="Stress hormones, diet and blunted thirst change glucose and fluid balance.",
                             indicators=["glucose", "urine_color"], symptoms=[]),
    "Musculoskeletal": dict(fn="Muscle and bone strength.",
                            space="Unloading drives about 1% per month bone loss and rapid muscle atrophy without exercise.",
                            indicators=["exercise_min"], symptoms=[]),
    "Systemic & Immune": dict(fn="Infection defense and stress response.",
                              space="Radiation, stress and sleep loss shift immune function and reactivate latent viruses.",
                              indicators=["temp_c"], symptoms=["prodrome"]),
}


# --------------------------------------------------------------------------------------
# Assessment
# --------------------------------------------------------------------------------------
def _fmt(key: str, v: float) -> str:
    return f"{v:.{INDICATORS[key]['dec']}f}"


def assess_indicator(key: str, value, history=None) -> dict:
    """Absolute safety nets + personal-baseline shift. Missing value => 'unknown' (never normal)."""
    s = INDICATORS[key]
    if value is None or pd.isna(value):
        return dict(key=key, value=None, status="unknown", reasons=["Not measured"], base=None, z=None, delta=None)
    value = float(value)
    level, reasons = 0, []
    if s["act_hi"] is not None and value >= s["act_hi"]:
        level = 2; reasons.append(f"≥ {s['act_hi']} {s['unit']} safety limit")
    elif s["warn_hi"] is not None and value >= s["warn_hi"]:
        level = 1; reasons.append(f"≥ {s['warn_hi']} {s['unit']} watch limit")
    if s["act_lo"] is not None and value <= s["act_lo"]:
        level = 2; reasons.append(f"≤ {s['act_lo']} {s['unit']} safety limit")
    elif s["warn_lo"] is not None and value <= s["warn_lo"] and level < 2:
        level = max(level, 1); reasons.append(f"≤ {s['warn_lo']} {s['unit']} watch limit")

    roll = s.get("roll")
    if roll:  # absolute 7-night floor and sleep debt: judged against health targets, never against the person's own (possibly short) baseline
        prior = pd.to_numeric(pd.Series(history if history is not None else [], dtype=float), errors="coerce").iloc[-(roll["window"] - 1):].dropna()
        nights = np.append(np.asarray(prior, float), value)
        if len(nights) >= roll["min_nights"]:
            mean7 = float(nights.mean()); debt = float(np.clip(roll["target"] - nights, 0, None).mean() * roll["window"])
            msg = f"{len(nights)}-night average {mean7:.2f} h (sleep debt {debt:.0f} h vs {roll['target']:.0f} h target)"
            if mean7 < roll["alert"]:
                level = 2; reasons.append(f"{msg}: below the {roll['alert']:.1f} h sleep-health floor")
            elif mean7 < roll["advisory"]:
                level = max(level, 1); reasons.append(f"{msg}: below {roll['advisory']:.1f} h, chronic short sleep")

    base = z = delta = None
    h = np.asarray(pd.to_numeric(pd.Series(history if history is not None else []), errors="coerce").dropna(), float)[-BASE_WINDOW:]
    if len(h) >= MIN_BASE:
        base = float(np.median(h))
        mad = float(np.median(np.abs(h - base)))
        sigma = max(1.4826 * mad, s["floor"])
        delta = value - base
        adverse = abs(delta) if s["sign"] == 0 else s["sign"] * delta
        z = adverse / sigma
        if z >= Z_FLAG and adverse >= s["min_delta"]:
            level = max(level, 1)
            reasons.append(f"{delta:+.{s['dec']}f} {s['unit']} vs your own baseline {base:.{s['dec']}f} " + (" (well outside your normal range)" if z >= 3 else ""))
    elif not reasons:
        reasons.append(f"Learning your baseline ({len(h)}/{MIN_BASE} days)")
    if not reasons:
        reasons.append("Within your personal range")
    return dict(key=key, value=value, status=RANK[level], reasons=reasons, base=base, z=z, delta=delta)


def worst(statuses) -> str:
    lv = [RANK.index(s) for s in statuses if s in RANK]
    return RANK[max(lv)] if lv else "emerald"


def assess_checkin(values: dict, symptoms: dict, history: pd.DataFrame, env_key: str, today: int) -> dict:
    ind = {k: assess_indicator(k, values.get(k), history[k] if k in history else None) for k in ORDER}
    sym = {k: bool(symptoms.get(k)) for k in SYMPTOMS}
    sym_status = {k: SYMPTOMS[k][1] for k, on in sym.items() if on}

    zones = {}
    for zn, z in ZONES.items():
        sts = [ind[k]["status"] for k in z["indicators"]] + [sym_status[k] for k in z["symptoms"] if k in sym_status]
        zones[zn] = worst(sts)
    # convergence: two amber signals together are treated as a pattern
    n_amber = sum(1 for v in ind.values() if v["status"] == "amber")
    n_crimson = sum(1 for v in ind.values() if v["status"] == "crimson") + sum(1 for s in sym_status.values() if s == "crimson")
    overall = "crimson" if n_crimson else ("amber" if (n_amber or sym_status) else "emerald")
    if overall == "amber" and n_amber >= 3:
        overall = "crimson"  # multi-signal convergence, same philosophy as the engine

    env = ENVIRONMENTS[env_key]
    hazards = {}
    for hk, h in HAZARDS.items():
        impact = worst([ind[k]["status"] for k in h["watch"] if k in ind])
        hazards[hk] = dict(level=env["levels"][hk], impact=impact)

    # prioritized actions
    acts = []
    for k in ORDER:
        st = ind[k]["status"]
        if st in ("amber", "crimson"):
            for a in INDICATORS[k][st][:3 if st == "crimson" else 2]:
                acts.append((2 if st == "crimson" else 1, f"{INDICATORS[k]['label']}: {a}"))
    for k, on in sym.items():
        if on:
            acts.append((2 if SYMPTOMS[k][1] == "crimson" else 1, f"{SYMPTOMS[k][0]}: {SYMPTOMS[k][3]}"))
    acts.sort(key=lambda x: -x[0])
    seen, actions = set(), []
    for _, a in acts:
        if a not in seen:
            seen.add(a); actions.append(a)
    if not actions:
        actions = ["All measured indicators are within your personal range. Keep your exercise, hydration and sleep routine.",
                   "Complete any measurements that are due so your baseline stays reliable."]
    if n_amber >= 3 and not n_crimson:
        actions.insert(0, "Several indicators are off together (pattern). Treat as ACTION: rest, hydrate, repeat measurements and escalate.")

    due = due_measurements(history, today)
    missing = [k for k in ORDER if ind[k]["status"] == "unknown"]
    score = 100 - 7 * n_amber - 18 * sum(1 for v in ind.values() if v["status"] == "crimson")
    score -= sum(8 if s == "amber" else 20 for s in sym_status.values())
    score -= min(15, 3 * len(missing))
    score = int(max(0, min(100, score)))

    if env["blackout"]:
        comms = "No link to Earth: " + env["escalation"]
    else:
        comms = env["escalation"]

    return dict(overall=overall, indicators=ind, symptoms=sym, zones=zones, hazards=hazards, actions=actions[:7],
                due=due, missing=missing, readiness=score, comms=comms, env=env_key, n_amber=n_amber, n_crimson=n_crimson)


def due_measurements(history: pd.DataFrame, today: int) -> list[dict]:
    out = []
    for k in ORDER:
        if k in history:
            seen = history.loc[history[k].notna(), "day"]
            last = int(seen.max()) if len(seen) else None
        else:
            last = None
        since = None if last is None else today - last
        if since is None or since >= INDICATORS[k]["freq"]:
            out.append(dict(key=k, label=INDICATORS[k]["label"], device=INDICATORS[k]["device"], since=since))
    return out


def build_packet(day: int, a: dict) -> dict:
    """Compact JSON for bandwidth-limited downlink."""
    sig = {}
    for k, v in a["indicators"].items():
        if v["status"] in ("amber", "crimson") or k in ("temp_c", "hr_bpm", "sleep_hrs"):
            sig[k] = dict(v=None if v["value"] is None else round(v["value"], 1),
                          b=None if v["base"] is None else round(v["base"], 1),
                          z=None if v["z"] is None else round(v["z"], 1), s=v["status"][0])
    return dict(day=int(day), lvl=a["overall"], rdy=a["readiness"], env=a["env"],
                zones={k: v for k, v in a["zones"].items() if v != "emerald"},
                sym=[k for k, on in a["symptoms"].items() if on], sig=sig)


# --------------------------------------------------------------------------------------
# Seed history, gamification
# --------------------------------------------------------------------------------------
def seed_history(seed: int = 21, n: int = 28) -> pd.DataFrame:
    """Simulated pre-check-in baseline (clearly labelled demo data, produced by the engine's simulator)."""
    sim = engine.simulate_crew(seed=seed, n_days=n, onset=None, personalize=False)
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(dict(
        day=sim["day"], sys_bp=sim["sys_bp"].round(0), dia_bp=sim["dia_bp"].round(0),
        hr_bpm=sim["hr_bpm"].round(0), temp_c=(sim["core_temp_c"] - 0.2).round(1).clip(36.2, 37.4),
        glucose=sim["glucose_mgdl"].round(0), sleep_hrs=sim["sleep_hrs"].round(1),
        mood=(10 - sim["stress_vas"]).round(0).clip(1, 10), spo2_pct=sim["spo2_pct"].round(0),
        urine_color=rng.integers(2, 5, n), exercise_min=rng.integers(100, 150, n),
    ))
    df["source"] = "demo-seed"
    return df


def progress(history: pd.DataFrame, today: int) -> dict:
    crew = history[history["source"] == "crew"]
    xp = 0
    for _, r in crew.iterrows():
        measured = sum(pd.notna(r[k]) for k in ORDER)
        xp += 10 * measured + (25 if measured == len(ORDER) else 0)
    days = sorted(crew["day"].astype(int).tolist())
    streak = 0
    if days and days[-1] == today - 1:
        streak = 1
        for a, b in zip(days[-2::-1], days[::-1]):
            if b - a == 1:
                streak += 1
            else:
                break
    full = int(sum(all(pd.notna(r[k]) for k in ORDER) for _, r in crew.iterrows()))
    badges = []
    if len(crew) >= 1: badges.append(("🚀", "First Check-In"))
    if streak >= 3: badges.append(("🔥", "3-Day Streak"))
    if streak >= 7: badges.append(("🏅", "7-Day Streak"))
    if full >= 3: badges.append(("🧪", "Full Panel x3"))
    if len(history) >= 14: badges.append(("📈", "Baseline Builder"))
    if len(crew) and (crew["exercise_min"].fillna(0) >= 120).sum() >= 3: badges.append(("💪", "Countermeasure Champion"))
    return dict(xp=xp, level=xp // 250 + 1, to_next=250 - xp % 250, streak=streak, badges=badges, logged=len(crew))


SCENARIOS = {
    "Normal day": dict(sys_bp=110, dia_bp=72, hr_bpm=66, temp_c=37.2, glucose=86, sleep_hrs=6.2, mood=6, spo2_pct=98, urine_color=3, exercise_min=125, sym=[]),
    "Fluid shift + poor sleep": dict(sys_bp=96, dia_bp=60, hr_bpm=78, temp_c=36.9, glucose=96, sleep_hrs=4.8, mood=5, spo2_pct=97, urine_color=6, exercise_min=70, sym=["vision_blur"]),
    "Infection onset": dict(sys_bp=114, dia_bp=76, hr_bpm=84, temp_c=38.2, glucose=104, sleep_hrs=5.6, mood=5, spo2_pct=96, urine_color=5, exercise_min=40, sym=["prodrome"]),
    "Possible clot (emergency)": dict(sys_bp=118, dia_bp=78, hr_bpm=96, temp_c=37.0, glucose=90, sleep_hrs=6.5, mood=6, spo2_pct=93, urine_color=4, exercise_min=90, sym=["neck_calf", "chest"]),
}
