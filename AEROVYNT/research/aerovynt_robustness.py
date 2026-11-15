# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""Stress tests and bootstrap confidence intervals for the AEROVYNT benchmark.

Why this exists: the original benchmark uses a simulator and an engine written by the same team, so good results can
partly reflect the simulator's own assumptions. This module (1) adds realistic nuisance effects the engine was never
tuned on (outlier spikes, correlated noise, slow oscillating trends, sensor drift, missing telemetry), (2) uses new random
seeds, (3) keeps every engine threshold frozen, and (4) reports 95% bootstrap confidence intervals, resampling whole crews
(days inside one crew are not independent). Nothing here changes aerovynt_engine.py.

v3.3: the stress seeds are NEW (47000+) because engine v3.3 was designed after the v3.2 stress results (seeds 31000+) were seen. A new
condition resamples nightly sleep noise from real PMData deviations (calibration participants only), and results now report fixed
Earth rules with and without the sleep clause, and event alerts with and without the sleep-health layer.

Run:  python aerovynt_robustness.py            (about 15 minutes on 2 cores; writes robustness_results.json)
"""
from __future__ import annotations

import hashlib, json, sys, time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

import aerovynt_engine as eng

OUT = Path(__file__).with_name("robustness_results.json")
N_CREWS, N_BOOT, WINDOW_DEFAULT = 200, 4000, 7
POOL_FILE = Path(__file__).with_name("data") / "pmdata_sleep_deviations.json"
SLEEP_POOL = np.array(json.loads(POOL_FILE.read_text())) if POOL_FILE.exists() else None
CH = list(eng.SIGNALS)
BASE_SD = dict(core_temp_c=0.06, hrv_ms=2.5, hr_bpm=2.0, sleep_hrs=0.35, pvt_ms=6.0, glucose_mgdl=1.5, stress_vas=0.3)  # simulator's baseline noise per channel

# Thresholds in force for every run. Recorded with a hash so a reader can see none were retuned after the stress tests.
FROZEN_NAMES = ["ENGINE_VERSION", "BASELINE_WINDOW", "BASELINE_LAG", "MIN_BASELINE_DAYS", "MAX_FREEZE_DAYS", "Z_FLAG", "CONVERGE_WATCH", "CONVERGE_ACTION",
                "Z_PERSIST", "PERSIST_WATCH_DAYS", "PERSIST_ACTION_DAYS", "CUSUM_K", "CUSUM_WATCH_H", "CUSUM_ACTION_H", "HARD_TEMP_C", "SEVERE_SLEEP_H",
                "GLUCOSE_WATCH", "GLUCOSE_ACTION", "EARTH_FEVER_C",
                "SLEEP_TARGET_H", "SLEEP_WINDOW", "SLEEP_MIN_NIGHTS", "SLEEP_ADVISORY_MEAN_H", "SLEEP_ALERT_MEAN_H", "SLEEP_NIGHT_SHORT_H", "SLEEP_SIGMA_FLOOR_H", "PE_WINDOW", "PE_MIN"]

SCENARIOS = {  # name -> (event_scale, event_type, detect_window, benchmark seed0 used on the Evidence page)
    "Strong Multi-System (1.0×)": (1.0, "multi_system", 7, 5000),
    "Subtle Multi-System (0.5× + CUSUM)": (0.5, "multi_system", 7, 5200),
    "Slow Metabolic Drift (14d ramp)": (1.0, "slow_metabolic", 10, 5400),
    "HR / Autonomic Infection": (1.0, "hr_infection", 7, 5600),
    "Sleep-Only Disruption (Hard Case)": (1.0, "sleep_only", 7, 5800),
}
STRESS_SEED0 = 63000  # new seeds. v3.4 was designed AFTER seeing the v3.3 stress results (seeds 47000+), so those seeds are spent; development used 5000-5800 and 9000
ALL = dict(spikes=0.03, ar1=0.7, osc=2.0, drift=0.15, miss=0.10, dropout=0.03, sleep_real=True)
CONDITIONS = {
    "Reference noise (as published)": {},
    "Outlier spikes (3% of readings, 4-6 SD)": dict(spikes=0.03),
    "Correlated noise (day-to-day memory)": dict(ar1=0.7),
    "Slow oscillating trends (25-45 day cycles)": dict(osc=2.0),
    "Sensor drift (random walk)": dict(drift=0.15),
    "Missing telemetry (10% of readings, 3% of days)": dict(miss=0.10, dropout=0.03),
    "Real-wearable sleep variability (resampled from PMData)": dict(sleep_real=True),
    "All of the above at once": ALL,
}


def frozen_config() -> dict:
    vals = {n: getattr(eng, n) for n in FROZEN_NAMES}
    vals["sha256"] = hashlib.sha256(json.dumps(vals, sort_keys=True).encode()).hexdigest()[:16]
    return vals


def perturb(df, cfg: dict, rng):
    """Add nuisance effects on top of the simulator's own Gaussian noise (so it is strictly a harder test)."""
    if not cfg:
        return df
    d = df.copy(); n = len(d); t = np.arange(1, n + 1)
    for c in CH:
        sd = BASE_SD[c]; x = d[c].to_numpy(float).copy()
        if "ar1" in cfg:
            phi = cfg["ar1"]; e = rng.normal(0, sd * np.sqrt(1 - phi ** 2), n); a = np.zeros(n); a[0] = rng.normal(0, sd)
            for i in range(1, n):
                a[i] = phi * a[i - 1] + e[i]
            x += a
        if "osc" in cfg:
            x += cfg["osc"] * sd * np.sin(2 * np.pi * t / rng.uniform(25, 45) + rng.uniform(0, 2 * np.pi))
        if "drift" in cfg:
            x += np.cumsum(rng.normal(0, cfg["drift"] * sd, n))
        if "spikes" in cfg:
            x += (rng.random(n) < cfg["spikes"]) * rng.choice([-1.0, 1.0], n) * rng.uniform(4, 6, n) * sd
        if "miss" in cfg:
            x[rng.random(n) < cfg["miss"]] = np.nan
        d[c] = x
    if "dropout" in cfg:
        gone = rng.random(n) < cfg["dropout"]
        for c in CH:
            d.loc[gone, c] = np.nan
    return d


def run_condition(scale, etype, window, seed0, cfg, n_crews=N_CREWS) -> dict:
    """Same crew loop as aerovynt_engine.run_scenario_benchmark, but keeps one record per crew for resampling."""
    rng = np.random.default_rng(seed0)
    n_h, fa, det, is_ev, delay = [], [], [], [], []
    for i in range(n_crews):
        onset = int(rng.integers(92, 126)) if i % 2 == 0 else None
        raw = eng.simulate_crew(seed0 + i, onset=onset, personalize=True, event_scale=scale, event_type=etype,
                                sleep_noise_pool=SLEEP_POOL if cfg.get("sleep_real") else None)
        raw = perturb(raw, cfg, np.random.default_rng([seed0 + i, 777]))
        df = eng.add_flags(raw)
        A = eng.fast_eval(df)
        days = df["day"].to_numpy(); valid = days >= 8
        mask = valid if onset is None else (valid & (days < onset))
        n_h.append(int(mask.sum())); fa.append([int(A[k][mask].sum()) for k in eng.FA_KEYS]); is_ev.append(onset is not None)
        dd, dl = [False] * len(eng.DET_KEYS), [np.nan] * len(eng.DET_KEYS)
        if onset is not None:
            post = days >= onset
            for j, k in enumerate(eng.DET_KEYS):
                hits = np.flatnonzero(post & A[k])
                if len(hits) and int(days[hits[0]] - onset) <= window:
                    dd[j] = True; dl[j] = int(days[hits[0]] - onset)
        det.append(dd); delay.append(dl)
    return dict(n_h=np.array(n_h), fa=np.array(fa), det=np.array(det), ev=np.array(is_ev), delay=np.array(delay, float))


def summarize(rec: dict, seed: int = 1) -> dict:
    rng = np.random.default_rng(seed); n = len(rec["n_h"]); FK, DK = eng.FA_KEYS, eng.DET_KEYS
    pt_fa = 100 * rec["fa"].sum(0) / rec["n_h"].sum()
    idx = rng.integers(0, n, (N_BOOT, n))
    b_fa = 100 * rec["fa"][idx].sum(1) / rec["n_h"][idx].sum(1)[:, None]
    ev = np.flatnonzero(rec["ev"]); det = rec["det"][ev]
    pt_det = 100 * det.mean(0)
    b_det = 100 * det[rng.integers(0, len(ev), (N_BOOT, len(ev)))].mean(1)
    ci = lambda p, b: [round(float(p), 1), round(float(np.percentile(b, 2.5)), 1), round(float(np.percentile(b, 97.5)), 1)]
    med = {k: (None if np.isnan(rec["delay"][ev, j]).all() else float(np.nanmedian(rec["delay"][ev, j]))) for j, k in enumerate(DK) if k != "earth"}
    return dict(n_crews=int(n), n_events=int(len(ev)),
                false_alarm_pct={k: ci(pt_fa[j], b_fa[:, j]) for j, k in enumerate(FK)},
                detected_within_window_pct={k: ci(pt_det[j], b_det[:, j]) for j, k in enumerate(DK)}, median_delay_days=med)


def _cell(args):
    name, c, sc, et, w, s0, cfg, n_crews = args
    return name, c, summarize(run_condition(sc, et, w, s0, cfg, n_crews=n_crews))


def main(n_crews: int = N_CREWS) -> dict:
    t0 = time.time(); published = json.loads((Path(__file__).with_name("benchmark_results.json")).read_text(encoding="utf-8"))["scenarios"]
    frozen = frozen_config(); print("frozen thresholds", frozen["sha256"], flush=True)
    # 1) Same seeds and crews as the published benchmark: points must match exactly, then add CIs.
    bench = {}
    for name, (sc, et, w, s0) in SCENARIOS.items():
        s = summarize(run_condition(sc, et, w, s0, {}, n_crews=120))
        for k in eng.FA_KEYS:
            assert s["false_alarm_pct"][k][0] == published[name]["false_alarm_pct"][k], (name, k, "false alarm differs from published")
        for k in eng.DET_KEYS:
            assert s["detected_within_window_pct"][k][0] == published[name]["detected_within_window_pct"][k], (name, k, "detection differs from published")
        bench[name] = s; print("reproduced + CI:", name, round(time.time() - t0), "s", flush=True)
    # 2) Stress grid on new seeds, thresholds frozen, paired crews across conditions (cells run in parallel).
    jobs = [(name, c, sc, et, w, STRESS_SEED0 + 1000 * si, cfg, n_crews)
            for si, (name, (sc, et, w, _)) in enumerate(SCENARIOS.items()) for c, cfg in CONDITIONS.items()]
    cells = {c: {} for c in CONDITIONS}
    with Pool(2) as pool:
        for name, c, res in pool.imap_unordered(_cell, jobs):
            cells[c][name] = res
            print(f"  {name[:28]:28s} | {c[:34]:34s} | action FA {res['false_alarm_pct']['action']} | watch det {res['detected_within_window_pct']['watch']} | {round(time.time() - t0)} s", flush=True)
    cells = {c: {n: cells[c][n] for n in SCENARIOS} for c in CONDITIONS}
    res = dict(engine_version=eng.ENGINE_VERSION, n_crews=n_crews, n_boot=N_BOOT, stress_seed0=STRESS_SEED0, frozen=frozen, reproduced_published_benchmark=True,
               benchmark_ci=bench, stress=dict(conditions=list(CONDITIONS), scenarios=list(SCENARIOS), cells=cells))
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8"); print("wrote", OUT, round(time.time() - t0), "s", flush=True)
    return res


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else N_CREWS)
