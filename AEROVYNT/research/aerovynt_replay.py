# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""Replay AEROVYNT on ANY labelled wearable dataset: the one-command route to the validation this project still lacks.

Input CSV (one row per person per day), columns:
  participant                       any id
  day                               integer day index (1, 2, 3, ...)
  hr_bpm, temp_c|core_temp_c, sleep_hrs, hrv_ms, glucose_mgdl, pvt_ms, stress_vas   any subset (blank = missing, never "normal")
  ill                               1 on days the person was ill / symptomatic / test-positive, else 0 (blank = 0)

Method: per person, the engine runs causally (it only ever sees past days). A false alarm is an alert on a day before the person's
first ill day. Detection is an alert within WINDOW days of the first ill day. The same days are scored for the plain personal
z-score and for fixed Earth-style rules, and 95% intervals resample PEOPLE (days inside a person are not independent).

Run:   python aerovynt_replay.py your_labelled.csv [--window 7] [--out replay_results.json]
Demo:  python aerovynt_replay.py data/example_labelled_SYNTHETIC.csv      (synthetic file made by --make-example; it proves the harness
       runs end to end and says NOTHING about real-world accuracy)
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

import numpy as np
import pandas as pd

import aerovynt_engine as eng

ALIASES = {"core_temp_c": ["temp_c", "temperature", "skin_temp", "body_temp"], "hr_bpm": ["hr", "heart_rate", "resting_hr", "rhr"],
           "sleep_hrs": ["sleep", "sleep_hours", "sleep_duration"], "glucose_mgdl": ["glucose"], "hrv_ms": ["hrv", "rmssd"], "pvt_ms": ["pvt"]}


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy(); df.columns = [str(c).strip().lower() for c in df.columns]
    for std, al in ALIASES.items():
        for a in al:
            if std not in df.columns and a in df.columns:
                df[std] = df[a]
    return df


def score_person(g: pd.DataFrame, window: int):
    raw, _ = eng.prepare_uploaded_csv(g.sort_values("day").reset_index(drop=True), fill_missing=False)
    ill = pd.to_numeric(g.sort_values("day")["ill"], errors="coerce").fillna(0).to_numpy() > 0
    df = eng.add_flags(raw); A = eng.fast_eval(df)
    days = df["day"].to_numpy(); valid = days >= 8
    onset = int(days[np.flatnonzero(ill)[0]]) if ill.any() else None
    mask = valid if onset is None else (valid & (days < onset))
    keys = ("earth_no_sleep", "naive_personal", "watch", "action_all")
    rec = dict(n=int(mask.sum()), fa={k: int(A[k][mask].sum()) for k in keys}, onset=onset)
    if onset is not None:
        post = days >= onset
        rec["det"] = {}
        for k in keys:
            hits = np.flatnonzero(post & A[k])
            rec["det"][k] = bool(len(hits) and int(days[hits[0]] - onset) <= window)
    return rec


def run(path: str, window: int = 7, n_boot: int = 4000, seed: int = 1) -> dict:
    df = _normalise(pd.read_csv(path))
    need = {"participant", "day", "ill"}
    if not need <= set(df.columns):
        raise SystemExit(f"missing columns: {sorted(need - set(df.columns))}")
    recs = [score_person(g, window) for _, g in df.groupby("participant")]
    keys = ("earth_no_sleep", "naive_personal", "watch", "action_all")
    rng = np.random.default_rng(seed); n = len(recs); out = {}
    ev = [r for r in recs if r["onset"] is not None]
    for k in keys:
        fa = np.array([r["fa"][k] for r in recs]); nn = np.array([r["n"] for r in recs])
        pt = 100 * fa.sum() / max(nn.sum(), 1)
        b = [100 * fa[i].sum() / max(nn[i].sum(), 1) for i in (rng.integers(0, n, n) for _ in range(n_boot))]
        out[k] = dict(false_alarm_pct=[round(pt, 1), round(float(np.percentile(b, 2.5)), 1), round(float(np.percentile(b, 97.5)), 1)])
        if ev:
            d = np.array([r["det"][k] for r in ev], float); bd = [100 * d[rng.integers(0, len(ev), len(ev))].mean() for _ in range(n_boot)]
            out[k]["detected_pct"] = [round(100 * d.mean(), 1), round(float(np.percentile(bd, 2.5)), 1), round(float(np.percentile(bd, 97.5)), 1)]
    return dict(engine_version=eng.ENGINE_VERSION, file=Path(path).name, n_people=n, n_ill_people=len(ev), window_days=window, results=out,
                caution="With few ill people the detection interval is very wide. Report it with the interval, never as a single number.")


def make_example(path: Path, n_people: int = 24, seed: int = 7):
    """SYNTHETIC labelled file (from the project's own simulator): only for testing the harness."""
    rows = []
    for i in range(n_people):
        onset = 80 + (i * 3) % 30 if i % 2 == 0 else None
        d = eng.simulate_crew(900000 + seed * 100 + i, onset=onset, personalize=True, event_type="hr_infection")
        for _, r in d.iterrows():
            rows.append(dict(participant=f"s{i:02d}", day=int(r["day"]), hr_bpm=r["hr_bpm"], temp_c=r["core_temp_c"], sleep_hrs=r["sleep_hrs"], hrv_ms=r["hrv_ms"],
                             ill=int(onset is not None and r["day"] >= onset and r["event_intensity"] >= 0.5)))
    pd.DataFrame(rows).to_csv(path, index=False)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("csv", nargs="?"); ap.add_argument("--window", type=int, default=7); ap.add_argument("--out")
    ap.add_argument("--make-example", action="store_true")
    a = ap.parse_args()
    if a.make_example:
        p = Path(__file__).with_name("data") / "example_labelled_SYNTHETIC.csv"; make_example(p); print("wrote", p); sys.exit()
    if not a.csv: ap.error("give a labelled CSV, or --make-example")
    res = run(a.csv, a.window); txt = json.dumps(res, indent=1); print(txt)
    if a.out: Path(a.out).write_text(txt)
