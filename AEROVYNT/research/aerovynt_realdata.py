# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""Real wearable check: PMData (Fitbit resting heart rate + nightly sleep; 16 participant folders, up to 152 days each in the supplied files).

What this file does and does not show
-------------------------------------
PMData has NO illness or event labels. So it cannot tell us whether AEROVYNT *detects* infections. It can answer two narrower
questions with real people instead of our simulator:
  1. Are the simulator's noise assumptions realistic?  (They were not for sleep: real night-to-night variation is ~2.5x larger.)
  2. How often does the engine alert on ordinary free-living days?  Every alert here is an UPPER bound on false alarms, because
     some alerted days may be real illness, hard training or travel that nobody labelled.

Pre-declared protocol (written before looking at held-out results)
  - A participant qualifies if they have >= 60 nights of sleep AND >= 60 resting-heart-rate days.
  - Qualifying participants are sorted by id and split alternately: 1st, 3rd, 5th... = CALIBRATION, 2nd, 4th, 6th... = VALIDATION.
  - The only quantity calibrated is the sleep sigma floor = median (over calibration participants) of the robust night-to-night SD
    (1.4826 x MAD of the night minus the trailing 14-day median, same window and lag as the engine), rounded to 0.1 h.
  - Validation participants are never used to set anything. Their alert rates are reported with 95% intervals that resample people.

Run:  python aerovynt_realdata.py                      (uses the shipped derived table data/pmdata_daily.csv)
      python aerovynt_realdata.py --rebuild PATH/pmdata (rebuilds that table from the raw PMData folder first)
PMData: Thambawita et al. (2020), "PMData: A sports logging dataset", datasets.simula.no/pmdata. Licence CC BY 4.0. Only a derived table
(day index, weekday, sleep hours, resting heart rate) is shipped here, not the raw files.
"""
from __future__ import annotations

import json, sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
TABLE = HERE / "data" / "pmdata_daily.csv"
POOL = HERE / "data" / "pmdata_sleep_deviations.json"
OUT = HERE / "realdata_results.json"
MIN_OBS = 60
N_BOOT = 4000


# ---------------------------------------------------------------------------------------------------- build derived table
def rebuild_table(root: Path) -> pd.DataFrame:
    frames = []
    for pdir in sorted(root.glob("p[0-9][0-9]")):
        fb = pdir / "fitbit"
        sl = json.loads((fb / "sleep.json").read_text())
        s = pd.DataFrame([dict(date=pd.Timestamp(r["dateOfSleep"]), main=r.get("mainSleep", True), asleep=r["minutesAsleep"]) for r in sl])
        sleep = s[s.main].groupby("date")["asleep"].sum() / 60.0          # main sleep only, hours asleep
        hr = pd.Series(dtype=float)
        if (fb / "resting_heart_rate.json").exists():
            rows = json.loads((fb / "resting_heart_rate.json").read_text())
            hr = pd.Series({pd.Timestamp(r["dateTime"]).normalize(): r["value"]["value"] for r in rows if r["value"].get("value")})
            hr = hr[hr > 0]
        lo = min([x.index.min() for x in (sleep, hr) if len(x)]); hi = max([x.index.max() for x in (sleep, hr) if len(x)])
        idx = pd.date_range(lo, hi)
        f = pd.DataFrame(dict(participant=pdir.name, day=np.arange(1, len(idx) + 1), weekday=idx.dayofweek,
                              sleep_hrs=sleep.reindex(idx).round(3).to_numpy(), hr_bpm=hr.reindex(idx).round(2).to_numpy() if len(hr) else np.nan))
        frames.append(f)
    t = pd.concat(frames, ignore_index=True)
    TABLE.parent.mkdir(exist_ok=True); t.to_csv(TABLE, index=False)
    return t


def load_table() -> pd.DataFrame:
    return pd.read_csv(TABLE)


# ---------------------------------------------------------------------------------------------------- noise statistics
def trailing_residuals(x: pd.Series, win: int = 14, lag: int = 3, minp: int = 7) -> np.ndarray:
    v = x.to_numpy(float); out = []
    for t in range(len(v)):
        hi = t - lag + 1
        if hi <= 0 or np.isnan(v[t]):
            continue
        w = v[max(0, hi - win):hi]; w = w[~np.isnan(w)]
        if len(w) >= minp:
            out.append(v[t] - np.median(w))
    return np.array(out)


def robust_sd(res: np.ndarray) -> float:
    return float(1.4826 * np.median(np.abs(res - np.median(res))))


def qualify(t: pd.DataFrame) -> list[str]:
    g = t.groupby("participant")
    ok = (g["sleep_hrs"].count() >= MIN_OBS) & (g["hr_bpm"].count() >= MIN_OBS)
    return sorted(ok[ok].index)


def split(parts: list[str]) -> tuple[list[str], list[str]]:
    return parts[0::2], parts[1::2]


def noise_table(t: pd.DataFrame, parts: list[str]) -> pd.DataFrame:
    rows = []
    for p in parts:
        d = t[t.participant == p].sort_values("day")
        r = dict(participant=p, sleep_nights=int(d.sleep_hrs.count()), hr_days=int(d.hr_bpm.count()),
                 sleep_mean_h=round(float(d.sleep_hrs.mean()), 2),
                 sleep_robust_sd_h=round(robust_sd(trailing_residuals(d.sleep_hrs)), 2),
                 sleep_sd_h=round(float(d.sleep_hrs.std()), 2),
                 sleep_lt6_pct=round(float(100 * (d.sleep_hrs.dropna() < 6).mean()), 1),
                 sleep_lt7_pct=round(float(100 * (d.sleep_hrs.dropna() < 7).mean()), 1),
                 hr_robust_sd_bpm=round(robust_sd(trailing_residuals(d.hr_bpm)), 2),
                 hr_lag1_autocorr=round(float(d.hr_bpm.dropna().autocorr(1)), 2),
                 sleep_lag1_autocorr=round(float(d.sleep_hrs.dropna().autocorr(1)), 2))
        wk = d.dropna(subset=["sleep_hrs"]); r["weekend_minus_weekday_sleep_h"] = round(float(wk[wk.weekday >= 5].sleep_hrs.mean() - wk[wk.weekday < 5].sleep_hrs.mean()), 2)
        rows.append(r)
    return pd.DataFrame(rows)


def sleep_deviation_pool(t: pd.DataFrame, parts: list[str]) -> list[float]:
    """Each night minus that person's own median night, pooled over the given participants (used to give the simulator real-looking sleep noise)."""
    devs = []
    for p in parts:
        s = t[t.participant == p].sleep_hrs.dropna()
        devs.extend((s - s.median()).round(3).tolist())
    return devs


# ---------------------------------------------------------------------------------------------------- run the engine on real days
def alert_rates(engine, t: pd.DataFrame, parts: list[str]) -> dict:
    """Engine alert rates on real days, per participant (days >= 8 with at least one real reading)."""
    per = {}
    for p in parts:
        d = t[t.participant == p].sort_values("day")
        raw = d[["day", "sleep_hrs", "hr_bpm"]].reset_index(drop=True)
        prep, _ = engine.prepare_uploaded_csv(raw)
        f = engine.add_flags(prep)
        a = engine.fast_eval(f)
        valid = (f["day"].to_numpy() >= 8) & f[["sleep_hrs", "hr_bpm"]].notna().any(axis=1).to_numpy()
        n = int(valid.sum())
        pct = lambda k: round(100.0 * float(a[k][valid].sum()) / n, 2)
        per[p] = dict(days=n, earth_sleep_lt6=pct("earth"), watch=pct("watch"), action=pct("action"), sleep_advisory=pct("sleep_advisory"),
                      sleep_alert=pct("sleep_alert"), watch_all=pct("watch_all"), action_all=pct("action_all"),
                      _counts={k: int(a[k][valid].sum()) for k in ("watch", "action", "sleep_advisory", "watch_all", "action_all")})
    return per


def pooled(per: dict, key: str, boot_rng=None) -> list[float]:
    ps = list(per); n = np.array([per[p]["days"] for p in ps], float)
    cnt = np.array([per[p]["days"] * per[p][key] / 100.0 for p in ps])
    pt = 100 * cnt.sum() / n.sum()
    rng = boot_rng or np.random.default_rng(3)
    idx = rng.integers(0, len(ps), (N_BOOT, len(ps)))
    b = 100 * cnt[idx].sum(1) / n[idx].sum(1)
    return [round(float(pt), 1), round(float(np.percentile(b, 2.5)), 1), round(float(np.percentile(b, 97.5)), 1)]


def main(rebuild: str | None = None) -> dict:
    import aerovynt_engine as eng
    t = rebuild_table(Path(rebuild)) if rebuild else load_table()
    parts = qualify(t); cal, val = split(parts)
    excluded = sorted(set(t.participant) - set(parts))
    nt = noise_table(t, parts)
    floor_cal = round(float(np.median(nt[nt.participant.isin(cal)].sleep_robust_sd_h)), 1)
    assert abs(floor_cal - eng.SLEEP_SIGMA_FLOOR_H) < 1e-9, f"engine SLEEP_SIGMA_FLOOR_H={eng.SLEEP_SIGMA_FLOOR_H} but calibration gives {floor_cal}"
    pool = sleep_deviation_pool(t, cal); POOL.write_text(json.dumps(pool))

    # v3.2 reference = the previous engine's constants (sleep floor 0.35, no sleep-health layer) on the same real days
    res = {}
    for label, floor in (("v3.2 (sleep floor 0.35 h)", 0.35), (f"v{eng.ENGINE_VERSION} (sleep floor {eng.SLEEP_SIGMA_FLOOR_H} h)", eng.SLEEP_SIGMA_FLOOR_H)):
        eng.SIGNALS["sleep_hrs"]["sigma_floor"] = floor; eng._refresh_constants()
        for grp, ps in (("calibration", cal), ("validation", val), ("all", parts)):
            per = alert_rates(eng, t, ps)
            res.setdefault(label, {})[grp] = dict(per_participant=per,
                                                  pooled={k: pooled(per, k) for k in ("earth_sleep_lt6", "watch", "action", "sleep_advisory", "watch_all", "action_all")})
    eng.SIGNALS["sleep_hrs"]["sigma_floor"] = eng.SLEEP_SIGMA_FLOOR_H; eng._refresh_constants()
    sim_sd = 0.35  # simulator per-night sleep SD at noise multiplier 1.0
    out = dict(dataset="PMData (Thambawita et al. 2020), Fitbit resting heart rate + sleep", licence="CC BY 4.0", engine_version=eng.ENGINE_VERSION,
               n_participants_total=int(t.participant.nunique()), qualifying=parts, calibration=cal, validation=val, excluded=excluded,
               exclusion_reason="fewer than 60 nights of sleep or fewer than 60 resting-heart-rate days",
               calibrated_sleep_sigma_floor_h=floor_cal, simulator_sleep_sd_h=sim_sd,
               median_real_sleep_robust_sd_h=round(float(nt.sleep_robust_sd_h.median()), 2),
               median_real_hr_robust_sd_bpm=round(float(nt.hr_robust_sd_bpm.median()), 2),
               median_real_sleep_mean_h=round(float(nt.sleep_mean_h.median()), 2),
               median_real_sleep_lt6_pct=round(float(nt.sleep_lt6_pct.median()), 1), median_real_sleep_lt7_pct=round(float(nt.sleep_lt7_pct.median()), 1),
               median_hr_lag1_autocorr=round(float(nt.hr_lag1_autocorr.median()), 2),
               median_weekend_minus_weekday_sleep_h=round(float(nt.weekend_minus_weekday_sleep_h.median()), 2),
               noise=nt.to_dict("records"), engines=res, sleep_pool_size=len(pool),
               caveat="No illness labels exist in PMData. Alert rates are upper bounds on false alarms and say nothing about detection.")
    OUT.write_text(json.dumps(out, indent=1)); print("wrote", OUT)
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[1] if a and a[0] == "--rebuild" else None)
