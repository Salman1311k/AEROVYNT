# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""
v3.4 (this release): self-calibrated noise guard. Sigma is now max(window sigma, robust spread of the baseline's own recent out-of-sample
forecast errors over the last 28 clean days). Independent noise is unaffected, but day-to-day memory (autocorrelation) and slow cycles, which the v3.3
stress tests showed drove action false alarms to 24 % and 63 %, widen sigma automatically. A plain "personal rolling z-score" comparator was added to
the benchmark so AEROVYNT is compared with a fair personalised rule and not only with fixed Earth limits.

AEROVYNT autonomous crew health triage engine v3.3: trend-aware baseline, standard CUSUM, bounded alert-freeze,
plus a sleep-health layer (absolute 7-night floor and sleep debt) and a sleep noise floor calibrated on real wearable data (pure Python / NumPy).

v3.3 changes versus v3.2 (see research/realdata_results.json and the Evidence page):
  1. Sleep noise floor 0.35 h -> 0.9 h. Real free-living nightly sleep (PMData, 13 people) varies ~0.9 h night to night (robust SD),
     not 0.35 h, so v3.2 alerted on ordinary nights. The value is the median over a pre-declared calibration half of the participants.
  2. Layer C (sleep health): a 7-night rolling mean below 6.0 h is a sleep advisory, below 5.0 h a sleep alert. Sleep debt against a
     7 h target is reported alongside. NASA schedules 8.5 h but ISS crews average about 6.1 h (Barger 2014); observed is not healthy,
     so this layer is absolute and is NOT relative to the person's own (short) baseline. It is reported separately from event alerts.
  3. Benchmarks report fixed Earth rules with and without the sleep clause, and event alerts with and without Layer C.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------------------
# Frozen Parameters
# --------------------------------------------------------------------------------------
ENGINE_VERSION = "3.4"
N_DAYS = 140
DEMO_SEED = 42
DEMO_ONSET = 134
SPE_EXTRA = {112: 5.0, 113: 14.0, 114: 4.0}
BASE_DOSE = 1.8

BASELINE_WINDOW = 14
BASELINE_LAG = 3
MIN_BASELINE_DAYS = 7
PE_WINDOW = 28  # v3.4: out-of-sample prediction errors (value minus its own baseline forecast) kept to learn how wrong the baseline really is
PE_MIN = 10     # fewer clean errors than this and the window-based sigma is used alone
MAX_FREEZE_DAYS = 14  # an alert may freeze the baseline for at most this long before it is re-learned (prevents runaway false alarms)

# Frozen Layer A (Acute Convergence) Thresholds
Z_FLAG = 3.0
CONVERGE_WATCH = 2
CONVERGE_ACTION = 3

# Frozen Layer B (Slow-Drift CUSUM & Persistence) Thresholds
Z_PERSIST = 2.0
PERSIST_WATCH_DAYS = 3
PERSIST_ACTION_DAYS = 5
CUSUM_K = 1.0
CUSUM_WATCH_H = 6.0
CUSUM_ACTION_H = 9.0

# Illustrative Absolute Safety Nets
HARD_TEMP_C = 39.0
HARD_SPO2 = 94.0
SEVERE_SLEEP_H = 4.5
GLUCOSE_WATCH = 100.0
GLUCOSE_ACTION = 126.0
CO2_WATCH = 0.42
SPE_WATCH = 4.0
SPE_SHELTER = 10.0
CAREER_LIMIT_MSV = 600.0
EARTH_FEVER_C = 38.0

# Layer C: sleep health (absolute, not baseline-relative). Targets from published guidance; a clinician must confirm them.
SLEEP_TARGET_H = 7.0          # adult recommendation (Watson et al. 2015 consensus statement); NASA schedules 8.5 h as opportunity, not a medical threshold
SLEEP_WINDOW = 7              # nights in the rolling window
SLEEP_MIN_NIGHTS = 4          # at least this many logged nights in the window, otherwise no rolling judgement (missing is never "normal")
SLEEP_ADVISORY_MEAN_H = 6.0   # 7-night mean below this: sleep advisory (chronic restriction to 6 h degrades performance, Van Dongen et al. 2003)
SLEEP_ALERT_MEAN_H = 5.0      # 7-night mean below this: sleep alert
SLEEP_NIGHT_SHORT_H = 6.0     # a single night below this is logged as a short night (the Co-Pilot's per-night note and the Earth-style rule)
SLEEP_SIGMA_FLOOR_H = 0.9     # calibrated on PMData calibration participants: median robust night-to-night SD (aerovynt_realdata.py)

SIGNALS: dict[str, dict] = {
    "core_temp_c": dict(label="Core temperature", short="core temp", unit="°C", sign=+1, min_delta=0.30, sigma_floor=0.08, dec=2, default=37.5),
    "hrv_ms": dict(label="Heart-rate variability", short="HRV", unit="ms", sign=-1, min_delta=7.0, sigma_floor=2.5, dec=1, default=55.0),
    "hr_bpm": dict(label="Resting heart rate", short="heart rate", unit="bpm", sign=+1, min_delta=5.0, sigma_floor=2.0, dec=1, default=66.0),
    "sleep_hrs": dict(label="Sleep duration", short="sleep", unit="h", sign=-1, min_delta=1.0, sigma_floor=SLEEP_SIGMA_FLOOR_H, dec=1, default=6.2),
    "pvt_ms": dict(label="Reaction time", short="reaction time", unit="ms", sign=+1, min_delta=15.0, sigma_floor=6.0, dec=0, default=245.0),
    "glucose_mgdl": dict(label="Fasting glucose", short="glucose", unit="mg/dL", sign=+1, min_delta=7.0, sigma_floor=1.5, dec=1, default=88.0),
    "stress_vas": dict(label="Stress (1-10)", short="stress", unit="", sign=+1, min_delta=1.5, sigma_floor=0.4, dec=1, default=3.5),
}
_COLS = list(SIGNALS)
_SIGN = np.array([SIGNALS[c]["sign"] for c in _COLS], float)
_MIN_DELTA = np.array([SIGNALS[c]["min_delta"] for c in _COLS], float)
_FLOOR = np.array([SIGNALS[c]["sigma_floor"] for c in _COLS], float)


def _refresh_constants() -> None:
    """Re-read SIGNALS into the cached arrays (used only by aerovynt_realdata.py to replay the v3.2 sleep floor for comparison)."""
    global _FLOOR, _MIN_DELTA, _SIGN
    _FLOOR = np.array([SIGNALS[c]["sigma_floor"] for c in _COLS], float)
    _MIN_DELTA = np.array([SIGNALS[c]["min_delta"] for c in _COLS], float)
    _SIGN = np.array([SIGNALS[c]["sign"] for c in _COLS], float)


# --------------------------------------------------------------------------------------
# Adversarial / Multi-Phenotype Simulator
# --------------------------------------------------------------------------------------
def simulate_crew(
    seed: int,
    n_days: int = N_DAYS,
    onset: int | None = None,
    spe: bool = False,
    personalize: bool = False,
    bad_nights: bool = True,
    symptoms: bool = False,
    event_scale: float = 1.0,
    event_type: str = "multi_system",
    sleep_noise_pool: np.ndarray | None = None,
) -> pd.DataFrame:
    """sleep_noise_pool: optional array of real night-minus-own-median deviations (hours). When given, nightly sleep noise is drawn
    from it (with replacement) instead of a Gaussian, which keeps the heavy tails of real wearable sleep."""
    rng = np.random.default_rng(seed)
    d = np.arange(1, n_days + 1)

    if personalize:
        t0 = 37.0 + rng.normal(0, 0.18)
        hr0 = 66.0 + rng.normal(0, 5.0)
        hrv0 = 58.0 + rng.normal(0, 8.0)
        glu0 = 85.0 + rng.normal(0, 5.0)
        sl0 = 6.15 + rng.normal(0, 0.40)
        pvt0 = 245.0 + rng.normal(0, 15.0)
        adapt = float(np.clip(1.0 + rng.normal(0, 0.25), 0.4, 1.4))
        adapt_days = float(np.clip(75.0 + rng.normal(0, 15.0), 45.0, 105.0))
        noise_mult = float(rng.uniform(0.75, 1.55))
    else:
        t0, hr0, hrv0, glu0, sl0, pvt0 = 37.0, 66.0, 58.0, 85.0, 6.15, 245.0
        adapt, adapt_days, noise_mult = 1.0, 75.0, 1.0

    ramp_days = 14.0 if event_type == "slow_metabolic" else 5.0
    e = np.zeros(n_days) if onset is None else np.clip((d - onset + 1) / ramp_days, 0, 1) * event_scale

    w = dict(temp=0.0, hr=0.0, hrv=0.0, glu=0.0, sleep=0.0, pvt=0.0, stress=0.0, spo2=0.0)
    if event_type == "multi_system":
        w = dict(temp=0.55, hr=6.0, hrv=14.0, glu=10.0, sleep=1.4, pvt=30.0, stress=2.5, spo2=0.4)
    elif event_type == "sleep_only":
        w = dict(temp=0.0, hr=1.0, hrv=2.0, glu=0.0, sleep=1.5, pvt=14.0, stress=0.8, spo2=0.0)
    elif event_type == "hr_infection":
        w = dict(temp=0.42, hr=8.5, hrv=15.0, glu=1.5, sleep=0.2, pvt=6.0, stress=0.9, spo2=0.2)
    elif event_type == "slow_metabolic":
        w = dict(temp=0.10, hr=3.5, hrv=10.0, glu=11.5, sleep=0.3, pvt=8.0, stress=1.2, spo2=0.0)

    core_temp = t0 + adapt * np.clip(d / adapt_days, 0, 1) + rng.normal(0, 0.06 * noise_mult, n_days) + w["temp"] * e
    bp_shift = np.minimum(9.0, d / 30.0 * 9.0)
    sys_bp = 119.0 - bp_shift + rng.normal(0, 1.8 * noise_mult, n_days)
    dia_bp = 78.0 - bp_shift * 0.7 + rng.normal(0, 1.2 * noise_mult, n_days)
    hr = hr0 + rng.normal(0, 2.0 * noise_mult, n_days) + w["hr"] * e
    hrv = hrv0 - 0.04 * d + rng.normal(0, 2.5 * noise_mult, n_days) - w["hrv"] * e
    glucose = glu0 + 0.12 * np.clip(d - 75, 0, None) + rng.normal(0, 1.5 * noise_mult, n_days) + w["glu"] * e
    if sleep_noise_pool is None:
        sleep_noise = rng.normal(0, 0.35 * noise_mult, n_days)
    else:
        sleep_noise = rng.choice(np.asarray(sleep_noise_pool, float), n_days)
    sleep = sl0 + sleep_noise - w["sleep"] * e
    pvt = pvt0 + rng.normal(0, 6.0 * noise_mult, n_days) + w["pvt"] * e
    spo2 = 97.8 + rng.normal(0, 0.4, n_days) - w["spo2"] * e
    co2 = 0.36 + rng.normal(0, 0.03, n_days)
    ared = np.maximum(83.0, 96.0 - 0.06 * d + rng.normal(0, 0.8, n_days))
    vo2 = np.maximum(84.0, 97.0 - 0.05 * d + rng.normal(0, 0.8, n_days))
    stress = np.minimum(9.5, 3.2 + 0.015 * d + rng.normal(0, 0.3 * noise_mult, n_days) + w["stress"] * e)

    nights = (rng.random(n_days) < 0.04) & (d >= 8) if bad_nights else np.zeros(n_days, bool)
    sleep = sleep - nights * rng.uniform(1.2, 2.0, n_days)
    stress = stress + 1.5 * nights
    pvt = pvt + 8.0 * nights

    rad_day = BASE_DOSE + rng.normal(0, 0.08, n_days)
    if spe:
        for day, extra in SPE_EXTRA.items():
            if day <= n_days:
                rad_day[day - 1] += extra
    rad_30d = pd.Series(rad_day).rolling(30, min_periods=1).sum().to_numpy()
    rad_cum = np.cumsum(rad_day)

    amsler = np.where((e >= 0.8) & symptoms, "Mild Wavy/Blur", "Clear")
    prodrome = (e >= 0.8) & symptoms

    df = pd.DataFrame(
        {
            "day": d,
            "core_temp_c": core_temp.round(2),
            "sys_bp": sys_bp.round(1),
            "dia_bp": dia_bp.round(1),
            "hr_bpm": hr.round(1),
            "hrv_ms": hrv.round(1),
            "glucose_mgdl": glucose.round(1),
            "sleep_hrs": sleep.round(2),
            "pvt_ms": pvt.round(0),
            "spo2_pct": spo2.round(1),
            "cabin_co2_pct": co2.round(2),
            "ared_strength_pct": ared.round(1),
            "vo2max_pct": vo2.round(1),
            "rad_day_mgy": rad_day.round(2),
            "rad_30d_mgy": rad_30d.round(1),
            "rad_career_msv": rad_cum.round(1),
            "stress_vas": stress.round(1),
            "amsler_status": amsler,
            "viral_prodrome": prodrome,
            "event_intensity": e.round(2),
        }
    )
    df["ared_7d"] = df["ared_strength_pct"].rolling(7, min_periods=1).mean().round(1)
    df["vo2_7d"] = df["vo2max_pct"].rolling(7, min_periods=1).mean().round(1)
    df["spe_level"] = np.where(df["rad_day_mgy"] >= SPE_SHELTER, 2, np.where(df["rad_day_mgy"] >= SPE_WATCH, 1, 0))
    return df


# --------------------------------------------------------------------------------------
# CSV Upload Normalizer
# --------------------------------------------------------------------------------------
def prepare_uploaded_csv(raw_df: pd.DataFrame, *, fill_missing: bool = False) -> tuple[pd.DataFrame, list[str]]:
    """Normalize CSV telemetry. Missing channels stay NaN unless demo imputation is explicit."""
    if raw_df is None or raw_df.empty:
        raise ValueError("The uploaded telemetry CSV is empty.")
    df = raw_df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    if "day" not in df.columns:
        df.insert(0, "day", np.arange(1, len(df) + 1))
    else:
        day = pd.to_numeric(df["day"], errors="coerce")
        if day.isna().all():
            raise ValueError("The 'day' column contains no numeric values.")
        df["day"] = day.ffill().bfill().astype(int)
    present = [c for c in _COLS if c in df.columns]
    for c, cfg in SIGNALS.items():
        if c not in df.columns:
            df[c] = cfg["default"] if fill_missing else np.nan
        else:
            df[c] = pd.to_numeric(df[c], errors="coerce")
            if fill_missing:
                df[c] = df[c].fillna(cfg["default"])
    defaults = {"sys_bp":112.0,"dia_bp":74.0,"spo2_pct":98.0,"cabin_co2_pct":0.36,
                "ared_strength_pct":94.0,"vo2max_pct":94.0,"rad_day_mgy":BASE_DOSE,
                "amsler_status":"Clear","viral_prodrome":False}
    for col,val in defaults.items():
        if col not in df.columns: df[col]=val
    for col in ("sys_bp","dia_bp","spo2_pct","cabin_co2_pct","ared_strength_pct","vo2max_pct","rad_day_mgy"):
        df[col]=pd.to_numeric(df[col],errors="coerce")
    df["rad_30d_mgy"] = df["rad_day_mgy"].rolling(30,min_periods=1).sum()
    df["rad_career_msv"] = df["rad_day_mgy"].fillna(0).cumsum()
    df["ared_7d"] = df["ared_strength_pct"].rolling(7,min_periods=1).mean()
    df["vo2_7d"] = df["vo2max_pct"].rolling(7,min_periods=1).mean()
    df["spe_level"] = np.where(df["rad_day_mgy"]>=SPE_SHELTER,2,np.where(df["rad_day_mgy"]>=SPE_WATCH,1,0))
    df.attrs["present_signals"] = present
    df.attrs["missing_signals"] = [c for c in _COLS if c not in present]
    df.attrs["synthetic_defaults_applied"] = bool(fill_missing)
    return df,present


def telemetry_quality_report(df: pd.DataFrame) -> dict:
    """Coverage and baseline readiness by signal; no observations are assumed normal."""
    signals={}
    for col in _COLS:
        values=pd.to_numeric(df[col],errors="coerce") if col in df.columns else pd.Series(dtype=float)
        n=int(values.notna().sum())
        signals[col]={"present":n>0,"observations":n,"coverage_pct":round(100*n/max(len(df),1),1),"baseline_ready":n>=MIN_BASELINE_DAYS}
    return {"rows":int(len(df)),"signals":signals,"available_signal_count":sum(v["present"] for v in signals.values()),
            "baseline_ready_signal_count":sum(v["baseline_ready"] for v in signals.values()),
            "note":"Missing or insufficiently sampled channels are not interpreted as normal."}


# --------------------------------------------------------------------------------------
# Personal Baselines + Layer A (Acute) & Layer B (CUSUM / Persistence) Flags
# --------------------------------------------------------------------------------------
def add_flags(
    df: pd.DataFrame,
    z_thresh: float = Z_FLAG,
    cusum_watch: float = CUSUM_WATCH_H,
    cusum_action: float = CUSUM_ACTION_H,
    trend: bool = True,
) -> pd.DataFrame:
    n = len(df)
    k = len(_COLS)
    x = df[_COLS].to_numpy(float)
    base = np.full((n, k), np.nan)
    sigma = np.full((n, k), np.nan)
    z = np.zeros((n, k))
    flag = np.zeros((n, k), bool)
    streak = np.zeros((n, k), int)
    cusum = np.zeros((n, k), float)
    clean = np.ones(n, bool)
    err = np.full((n, k), np.nan)  # signed forecast error x_t - base_t, kept for the self-calibrated sigma

    for t in range(n):
        hi = t - BASELINE_LAG + 1
        if hi > 0:
            cand = np.flatnonzero(clean[:hi])[-BASELINE_WINDOW:]
            if hi - 1 - (cand[-1] if len(cand) else -999) > MAX_FREEZE_DAYS:
                cand = np.arange(max(0, hi - BASELINE_WINDOW), hi)
            if len(cand) >= MIN_BASELINE_DAYS:
                w = x[cand]
                # Per-channel robust baseline: missing telemetry is never imputed as normal.
                valid_n = np.isfinite(w).sum(axis=0)
                med = np.full(k, np.nan)
                mad = np.full(k, np.nan)
                infl = np.ones(k)
                enough = valid_n >= MIN_BASELINE_DAYS
                for j in np.flatnonzero(enough):
                    finite = np.isfinite(w[:, j])
                    channel = w[finite, j]
                    if trend:
                        # Trend-aware baseline (Theil-Sen): normal spaceflight adaptation (slow
                        # temperature, HRV, stress, glucose drift) is absorbed instead of being
                        # flagged forever. Acute events are gated out of the window, so they stand out.
                        tt = cand[finite].astype(float)
                        dt = tt[None, :] - tt[:, None]
                        dy = channel[None, :] - channel[:, None]
                        pos = dt > 0
                        slope = float(np.median(dy[pos] / dt[pos])) if pos.any() else 0.0
                        icpt = float(np.median(channel - slope * tt))
                        med[j] = icpt + slope * t
                        resid = channel - (icpt + slope * tt)
                        mad[j] = np.median(np.abs(resid - np.median(resid)))
                        # prediction-interval inflation: extrapolating a fitted trend adds uncertainty
                        sxx = float(((tt - tt.mean()) ** 2).sum())
                        infl[j] = np.sqrt(1.0 + 1.0 / len(tt) + ((t - tt.mean()) ** 2) / max(sxx, 1e-9))
                    else:
                        med[j] = np.median(channel)
                        mad[j] = np.median(np.abs(channel - med[j]))
                base[t] = med
                sigma[t] = np.where(enough, np.maximum(1.4826 * mad, _FLOOR) * infl, np.nan)
                # v3.4: self-calibrated guard. Forecast errors on earlier clean days show the real noise, including memory and slow cycles.
                pidx = np.flatnonzero(clean[:t])[-PE_WINDOW:]
                if len(pidx) >= PE_MIN:
                    E = err[pidx]
                    cnt = np.isfinite(E).sum(axis=0)
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", RuntimeWarning)
                        em = np.nanmedian(E, axis=0)
                        pe = 1.4826 * np.nanmedian(np.abs(E - em), axis=0)
                    sigma[t] = np.where(enough & (cnt >= PE_MIN), np.maximum(sigma[t], pe), sigma[t])

        available = np.isfinite(base[t]) & np.isfinite(x[t]) & np.isfinite(sigma[t])
        err[t] = np.where(np.isfinite(base[t]) & np.isfinite(x[t]), x[t] - base[t], np.nan)
        if available.any():
            delta = _SIGN * (x[t] - base[t])
            z[t, available] = delta[available] / sigma[t, available]
            flag[t] = available & (z[t] >= z_thresh) & (delta >= _MIN_DELTA)
            mild_shift = available & (z[t] >= Z_PERSIST) & (delta >= 0.5 * _MIN_DELTA)
            if t > 0:
                streak[t] = np.where(mild_shift, streak[t - 1] + 1, 0)
                # standard one-sided CUSUM: S_t = max(0, S_{t-1} + z_t - k)
                cusum[t] = np.where(available, np.maximum(0.0, cusum[t - 1] + z[t] - CUSUM_K), cusum[t - 1])
            else:
                streak[t] = mild_shift.astype(int)
                cusum[t] = np.where(available, np.maximum(0.0, z[t] - CUSUM_K), 0.0)
        valid_streak = streak[t][available] if available.any() else np.array([0])
        valid_cusum = cusum[t][available] if available.any() else np.array([0.0])
        clean[t] = (flag[t].sum() < 2) and (valid_streak.max() < PERSIST_WATCH_DAYS) and (valid_cusum.max() < cusum_watch)

    out = df.copy()
    for i, c in enumerate(_COLS):
        out[f"{c}__base"] = base[:, i]
        out[f"{c}__sigma"] = sigma[:, i]
        out[f"{c}__z"] = z[:, i]
        out[f"{c}__flag"] = flag[:, i]
        out[f"{c}__streak"] = streak[:, i]
        out[f"{c}__cusum"] = cusum[:, i]

    out["n_flag"] = flag.sum(axis=1)
    out["max_streak"] = streak.max(axis=1)
    out["max_cusum"] = cusum.max(axis=1)
    out["drift_watch"] = (out["max_streak"] >= PERSIST_WATCH_DAYS) | (out["max_cusum"] >= cusum_watch)
    out["drift_action"] = (out["max_streak"] >= PERSIST_ACTION_DAYS) | (out["max_cusum"] >= cusum_action)
    out = add_sleep_health(out)
    return out


def add_sleep_health(df: pd.DataFrame) -> pd.DataFrame:
    """Layer C: absolute sleep floor and sleep debt over the last SLEEP_WINDOW nights (causal: tonight's value included).
    Needs at least SLEEP_MIN_NIGHTS logged nights in the window; fewer means 'unknown', never 'fine'."""
    s = pd.to_numeric(df["sleep_hrs"], errors="coerce")
    roll = s.rolling(SLEEP_WINDOW, min_periods=SLEEP_MIN_NIGHTS)
    df = df.copy()
    df["sleep_7d"] = roll.mean()
    df["sleep_debt_7d"] = (SLEEP_TARGET_H - s).clip(lower=0).rolling(SLEEP_WINDOW, min_periods=SLEEP_MIN_NIGHTS).mean() * SLEEP_WINDOW
    df["sleep_short_night"] = (s < SLEEP_NIGHT_SHORT_H).fillna(False)
    df["sleep_advisory"] = (df["sleep_7d"] < SLEEP_ADVISORY_MEAN_H).fillna(False)
    df["sleep_alert"] = (df["sleep_7d"] < SLEEP_ALERT_MEAN_H).fillna(False)
    return df


# --------------------------------------------------------------------------------------
# Evaluation of One Day
# --------------------------------------------------------------------------------------
def _check(col: str, value: float, row: dict, z_thresh: float = Z_FLAG) -> dict:
    cfg = SIGNALS[col]
    base = row.get(f"{col}__base", np.nan)
    sigma = row.get(f"{col}__sigma", np.nan)
    streak = int(row.get(f"{col}__streak", 0))
    cusum = float(row.get(f"{col}__cusum", 0.0))
    if base is None or pd.isna(base):
        return dict(value=value, base=np.nan, delta=0.0, z=0.0, flag=False, streak=0, cusum=0.0)
    adverse = cfg["sign"] * (value - base)
    z = adverse / sigma
    return dict(
        value=value,
        base=float(base),
        delta=float(value - base),
        z=float(z),
        flag=bool(z >= z_thresh and adverse >= cfg["min_delta"]),
        streak=streak,
        cusum=cusum,
    )


def earth_rule_hits(values: dict, spo2: float) -> list[str]:
    hits = []
    if values["core_temp_c"] >= EARTH_FEVER_C:
        hits.append("Fever ≥ 38.0 °C")
    if values["sleep_hrs"] < 6.0:
        hits.append("Sleep < 6 h")
    if values["glucose_mgdl"] >= GLUCOSE_WATCH:
        hits.append("Fasting glucose ≥ 100")
    if spo2 < HARD_SPO2:
        hits.append("SpO₂ < 94 %")
    if values["pvt_ms"] > 245.0 * 1.10:
        hits.append("Reaction time > +10 %")
    return hits


def evaluate_day(
    row: dict,
    crew: dict | None = None,
    z_thresh: float = Z_FLAG,
    converge_watch: int = CONVERGE_WATCH,
    converge_action: int = CONVERGE_ACTION,
) -> dict:
    crew = crew or {}
    amsler = crew.get("amsler", row.get("amsler_status", "Clear"))
    prodrome = bool(crew.get("prodrome", row.get("viral_prodrome", False)))
    neck_calf = bool(crew.get("neck_calf", False))
    dyspnea = bool(crew.get("dyspnea", False))

    values = {c: (float(pd.to_numeric(row.get(c), errors="coerce")) if pd.notna(pd.to_numeric(row.get(c), errors="coerce")) else np.nan) for c in _COLS}
    values["sleep_hrs"] = float(crew.get("sleep_hrs", values["sleep_hrs"]))
    values["stress_vas"] = float(crew.get("stress_vas", values["stress_vas"]))

    sig = {c: _check(c, values[c], row, z_thresh=z_thresh) for c in _COLS}
    n_flag = sum(s["flag"] for s in sig.values())
    flagged = [c for c in _COLS if sig[c]["flag"]]
    drift_signals = [c for c in _COLS if sig[c]["streak"] >= PERSIST_WATCH_DAYS or sig[c]["cusum"] >= CUSUM_WATCH_H]

    spo2 = float(pd.to_numeric(row.get("spo2_pct", np.nan), errors="coerce"))
    co2 = float(pd.to_numeric(row.get("cabin_co2_pct", np.nan), errors="coerce"))
    temp = values["core_temp_c"]
    glucose = values["glucose_mgdl"]
    sleep = values["sleep_hrs"]

    pvt_lag_pct = round((values["pvt_ms"] - 245.0) / 245.0 * 100.0, 1)
    hard: list[str] = []

    sleep7 = float(pd.to_numeric(row.get("sleep_7d", np.nan), errors="coerce"))
    debt7 = float(pd.to_numeric(row.get("sleep_debt_7d", np.nan), errors="coerce"))
    sleep_alert = bool(sleep7 < SLEEP_ALERT_MEAN_H) if not np.isnan(sleep7) else False
    sleep_adv = bool(sleep7 < SLEEP_ADVISORY_MEAN_H) if not np.isnan(sleep7) else False

    if amsler == "Central Blind Spot" or (sig["pvt_ms"]["flag"] and sig["sleep_hrs"]["flag"]) or sig["sleep_hrs"]["streak"] >= PERSIST_ACTION_DAYS or sleep_alert:
        head = "crimson"
    elif (
        amsler == "Mild Wavy/Blur"
        or sig["pvt_ms"]["flag"]
        or sig["sleep_hrs"]["flag"]
        or sig["sleep_hrs"]["streak"] >= PERSIST_WATCH_DAYS
        or sleep < SEVERE_SLEEP_H
        or sleep_adv
    ):
        head = "amber"
    else:
        head = "emerald"

    if neck_calf or sig["hr_bpm"]["streak"] >= PERSIST_ACTION_DAYS or sig["hrv_ms"]["streak"] >= PERSIST_ACTION_DAYS:
        vascular = "crimson"
    elif sig["hrv_ms"]["flag"] or sig["hr_bpm"]["flag"] or sig["hr_bpm"]["streak"] >= PERSIST_WATCH_DAYS or sig["hrv_ms"]["streak"] >= PERSIST_WATCH_DAYS:
        vascular = "amber"
    else:
        vascular = "emerald"

    if spo2 < HARD_SPO2 or dyspnea:
        chest = "crimson"
        if spo2 < HARD_SPO2:
            hard.append(f"SpO₂ below {HARD_SPO2:.0f} %")
    elif co2 > CO2_WATCH:
        chest = "amber"
    else:
        chest = "emerald"

    t = sig["core_temp_c"]
    g = sig["glucose_mgdl"]
    if temp >= HARD_TEMP_C or (t["flag"] and t["delta"] >= 0.45) or glucose >= GLUCOSE_ACTION or g["cusum"] >= CUSUM_ACTION_H:
        core = "crimson"
        if temp >= HARD_TEMP_C:
            hard.append(f"Resting core temp ≥ {HARD_TEMP_C} °C")
    elif t["flag"] or g["flag"] or g["cusum"] >= CUSUM_WATCH_H or glucose >= GLUCOSE_WATCH:
        core = "amber"
    else:
        core = "emerald"

    ared7 = float(pd.to_numeric(row.get("ared_7d", np.nan), errors="coerce"))
    vo27 = float(pd.to_numeric(row.get("vo2_7d", np.nan), errors="coerce"))
    if ared7 < 80.0 or vo27 < 80.0:
        msk = "crimson"
    elif ared7 < 86.0 or vo27 < 86.0:
        msk = "amber"
    else:
        msk = "emerald"

    spe_raw = pd.to_numeric(row.get("spe_level", 0), errors="coerce")
    spe_level = int(spe_raw) if pd.notna(spe_raw) else 0
    career = float(pd.to_numeric(row.get("rad_career_msv", np.nan), errors="coerce"))
    if spe_level == 2 or career >= 0.9 * CAREER_LIMIT_MSV or (prodrome and n_flag >= 2):
        systemic = "crimson"
    elif spe_level == 1 or career >= 0.8 * CAREER_LIMIT_MSV or prodrome or (sig["sleep_hrs"]["flag"] and sig["stress_vas"]["flag"]):
        systemic = "amber"
    else:
        systemic = "emerald"

    zones = {
        "Head & Eyes": head,
        "Neck & Vascular": vascular,
        "Chest & Lungs": chest,
        "Core & Metabolic": core,
        "Musculoskeletal": msk,
        "Systemic & Immune": systemic,
    }

    drift_watch = bool(row.get("drift_watch", False))
    drift_action = bool(row.get("drift_action", False))

    if "crimson" in zones.values() or n_flag >= converge_action or drift_action:
        overall = "crimson"
    elif "amber" in zones.values() or n_flag >= converge_watch or drift_watch:
        overall = "amber"
    else:
        overall = "emerald"

    earth = earth_rule_hits(values, spo2)

    if t["flag"]:
        temp_note = f"Acute {t['delta']:+.2f} °C vs personal baseline ({t['base']:.2f} °C)"
    elif temp >= EARTH_FEVER_C:
        temp_note = (
            f"{temp:.2f} °C would trip an Earth fever cutoff, but is {t['delta']:+.2f} °C vs this "
            f"crew member's own baseline ({t['base']:.2f} °C): normal space adaptation"
        )
    elif not pd.isna(t["base"]):
        temp_note = f"{t['delta']:+.2f} °C vs personal baseline ({t['base']:.2f} °C): within adaptation trend"
    else:
        temp_note = "Baseline still being learned"

    blind_spots = {
        "Bone Loss & Renal Stones": (
            "amber" if msk != "emerald" else "emerald",
            f"Exercise-load proxy at {ared7:.1f}% of pre-flight (7-day mean). No onboard DXA or urine calcium.",
        ),
        "Immune Reactivation": (
            "crimson" if (prodrome and n_flag >= 2) else ("amber" if (prodrome or n_flag >= 2) else "emerald"),
            f"Sleep {sleep:.1f} h, stress {values['stress_vas']:.1f}/10{', prodrome logged' if prodrome else ''}. No onboard viral PCR.",
        ),
        "DVT / Venous Clotting": (
            "crimson" if neck_calf else "emerald",
            "One-sided neck/calf fullness reported: evaluate jugular flow."
            if neck_calf
            else "No one-sided neck/calf symptoms. No routine clotting panel in flight.",
        ),
        "Spaceflight Anemia": (
            "crimson" if dyspnea else "emerald",
            "Exertional breathlessness flagged: monitor fatigue."
            if dyspnea
            else "No exertional breathlessness reported. No CBC in flight.",
        ),
    }

    return dict(
        overall=overall,
        zones=zones,
        n_flag=n_flag,
        signals=sig,
        flagged=flagged,
        drift_signals=drift_signals,
        drift_watch=drift_watch,
        drift_action=drift_action,
        hard_limits=hard,
        earth_hits=earth,
        temp_note=temp_note,
        pvt_lag_pct=pvt_lag_pct,
        sleep_health=dict(mean_7d=None if np.isnan(sleep7) else round(sleep7, 2), debt_7d_h=None if np.isnan(debt7) else round(debt7, 1),
                          target_h=SLEEP_TARGET_H, advisory=sleep_adv, alert=sleep_alert, short_night=bool(sleep < SLEEP_NIGHT_SHORT_H)),
        spe_level=spe_level,
        values=values,
        symptoms=dict(amsler=amsler, prodrome=prodrome, neck_calf=neck_calf, dyspnea=dyspnea),
        blind_spots=blind_spots,
    )


def timeline(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in df.to_dict("records"):
        ev = evaluate_day(r)
        rows.append(dict(day=r["day"], earth=bool(ev["earth_hits"]), level=ev["overall"], n_flag=ev["n_flag"]))
    return pd.DataFrame(rows)


def build_downlink_packet(day: int, ev: dict, level: str | None = None) -> dict:
    sig = {}
    for c, s in ev["signals"].items():
        if s["flag"] or c in ev["drift_signals"] or c in ("core_temp_c", "hrv_ms", "sleep_hrs"):
            sig[c] = dict(
                v=None if pd.isna(s["value"]) else round(s["value"], 2),
                base=None if pd.isna(s["base"]) else round(s["base"], 2),
                z=None if pd.isna(s["z"]) else round(s["z"], 1),
                streak=s["streak"],
                cusum=round(s["cusum"], 1),
            )
    return dict(
        day=int(day),
        level=level or ev["overall"],
        n_flag=int(ev["n_flag"]),
        flagged=ev["flagged"],
        drift_signals=ev["drift_signals"],
        hard=ev["hard_limits"],
        zones={k: v for k, v in ev["zones"].items() if v != "emerald"},
        symptoms={k: v for k, v in ev["symptoms"].items() if v not in (False, "Clear")},
        sig=sig,
        spe=ev["spe_level"],
    )


# --------------------------------------------------------------------------------------
# Fast Vectorized Multi-Phenotype Benchmark + Sensitivity Sweep (<0.3s total)
# --------------------------------------------------------------------------------------
def _fast_eval_arrays(df: pd.DataFrame, converge_watch: int = CONVERGE_WATCH, converge_action: int = CONVERGE_ACTION):
    """Vectorized boolean evaluation across all 140 days for fast Monte Carlo benchmarking."""
    earth = (
        (df["core_temp_c"].to_numpy() >= EARTH_FEVER_C)
        | (df["sleep_hrs"].to_numpy() < 6.0)
        | (df["glucose_mgdl"].to_numpy() >= GLUCOSE_WATCH)
        | (df["spo2_pct"].to_numpy() < HARD_SPO2)
        | (df["pvt_ms"].to_numpy() > 245.0 * 1.10)
    )

    t_flag = df["core_temp_c__flag"].to_numpy()
    t_delta = df["core_temp_c"].to_numpy() - df["core_temp_c__base"].to_numpy()
    g_flag = df["glucose_mgdl__flag"].to_numpy()
    g_cusum = df["glucose_mgdl__cusum"].to_numpy()
    s_flag = df["sleep_hrs__flag"].to_numpy()
    s_streak = df["sleep_hrs__streak"].to_numpy()
    p_flag = df["pvt_ms__flag"].to_numpy()
    hr_flag = df["hr_bpm__flag"].to_numpy()
    hr_streak = df["hr_bpm__streak"].to_numpy()
    hrv_flag = df["hrv_ms__flag"].to_numpy()
    hrv_streak = df["hrv_ms__streak"].to_numpy()
    st_flag = df["stress_vas__flag"].to_numpy()
    n_flag = df["n_flag"].to_numpy()
    drift_w = df["drift_watch"].to_numpy()
    drift_a = df["drift_action"].to_numpy()

    crimson = (
        (p_flag & s_flag)
        | (s_streak >= PERSIST_ACTION_DAYS)
        | (hr_streak >= PERSIST_ACTION_DAYS)
        | (hrv_streak >= PERSIST_ACTION_DAYS)
        | (df["spo2_pct"].to_numpy() < HARD_SPO2)
        | (df["core_temp_c"].to_numpy() >= HARD_TEMP_C)
        | (t_flag & (t_delta >= 0.45))
        | (df["glucose_mgdl"].to_numpy() >= GLUCOSE_ACTION)
        | (g_cusum >= CUSUM_ACTION_H)
        | (df["ared_7d"].to_numpy() < 80.0)
        | (df["vo2_7d"].to_numpy() < 80.0)
        | (n_flag >= converge_action)
        | drift_a
    )

    amber = (
        p_flag
        | s_flag
        | (s_streak >= PERSIST_WATCH_DAYS)
        | (df["sleep_hrs"].to_numpy() < SEVERE_SLEEP_H)
        | hrv_flag
        | hr_flag
        | (hr_streak >= PERSIST_WATCH_DAYS)
        | (hrv_streak >= PERSIST_WATCH_DAYS)
        | (df["cabin_co2_pct"].to_numpy() > CO2_WATCH)
        | t_flag
        | g_flag
        | (g_cusum >= CUSUM_WATCH_H)
        | (df["glucose_mgdl"].to_numpy() >= GLUCOSE_WATCH)
        | (df["ared_7d"].to_numpy() < 86.0)
        | (df["vo2_7d"].to_numpy() < 86.0)
        | (s_flag & st_flag)
        | (n_flag >= converge_watch)
        | drift_w
    )
    watch = crimson | amber
    return earth, watch, crimson


def fast_eval(df: pd.DataFrame, converge_watch: int = CONVERGE_WATCH, converge_action: int = CONVERGE_ACTION) -> dict:
    """Everything the benchmark reports, as boolean arrays over days.
    earth / earth_no_sleep : fixed Earth-style rules with and without the 'sleep < 6 h' clause
    watch / action         : AEROVYNT EVENT alerts (Layers A and B plus absolute safety nets), no Layer C
    sleep_advisory/alert   : Layer C only (7-night mean below 6.0 h / below 5.0 h)
    watch_all / action_all : event alerts together with Layer C (this is what the Co-Pilot head zone shows)"""
    earth, watch, action = _fast_eval_arrays(df, converge_watch, converge_action)
    sl = df["sleep_hrs"].to_numpy(float)
    earth_ns = ((df["core_temp_c"].to_numpy() >= EARTH_FEVER_C) | (df["glucose_mgdl"].to_numpy() >= GLUCOSE_WATCH)
                | (df["spo2_pct"].to_numpy() < HARD_SPO2) | (df["pvt_ms"].to_numpy() > 245.0 * 1.10))
    assert not (earth_ns & ~earth).any() and ((earth & ~earth_ns) <= (sl < 6.0)).all()   # the only difference is the sleep clause
    # Fair personalised comparator: rolling 14-day mean and SD of each signal's own previous days, flag any single signal at z >= 3 in the adverse direction.
    naive = np.zeros(len(df), bool)
    for c in _COLS:
        sx = pd.to_numeric(df[c], errors="coerce"); prev = sx.shift(1).rolling(14, min_periods=7)
        zc = (_SIGN[_COLS.index(c)] * (sx - prev.mean()) / prev.std().clip(lower=SIGNALS[c]["sigma_floor"] * 0.5))
        naive |= (zc >= 3.0).fillna(False).to_numpy(bool)
    adv = df["sleep_advisory"].to_numpy(bool); alt = df["sleep_alert"].to_numpy(bool)
    return dict(earth=earth, earth_no_sleep=earth_ns, naive_personal=naive, watch=watch, action=action, sleep_advisory=adv, sleep_alert=alt,
                sleep_short_night=df["sleep_short_night"].to_numpy(bool), watch_all=watch | adv | alt, action_all=action | alt)


FA_KEYS = ("earth", "earth_no_sleep", "naive_personal", "watch", "action", "sleep_advisory", "watch_all", "action_all")
DET_KEYS = ("earth", "naive_personal", "watch", "action", "watch_all", "action_all")


def run_scenario_benchmark(
    n_crews: int = 120,
    seed0: int = 5000,
    detect_window: int = 7,
    event_scale: float = 1.0,
    event_type: str = "multi_system",
    z_thresh: float = Z_FLAG,
    converge_action: int = CONVERGE_ACTION,
    sleep_noise_pool: np.ndarray | None = None,
) -> dict:
    rng = np.random.default_rng(seed0)
    healthy = {k: 0 for k in FA_KEYS}; healthy["n"] = 0; healthy["short_night"] = 0
    detected = {k: 0 for k in DET_KEYS}
    delays = {k: [] for k in ("watch", "action", "watch_all", "action_all")}
    n_events = 0

    for i in range(n_crews):
        onset = int(rng.integers(92, 126)) if i % 2 == 0 else None
        raw = simulate_crew(
            seed0 + i,
            onset=onset,
            personalize=True,
            event_scale=event_scale,
            event_type=event_type,
            sleep_noise_pool=sleep_noise_pool,
        )
        df = add_flags(raw, z_thresh=z_thresh)
        A = fast_eval(df, converge_action=converge_action)
        days = df["day"].to_numpy()
        valid = days >= 8
        mask = valid if onset is None else (valid & (days < onset))
        healthy["n"] += int(mask.sum()); healthy["short_night"] += int(A["sleep_short_night"][mask].sum())
        for k in FA_KEYS:
            healthy[k] += int(A[k][mask].sum())
        if onset is not None:
            n_events += 1
            post = days >= onset
            for k in DET_KEYS:
                hits = np.flatnonzero(post & A[k])
                if len(hits) > 0:
                    delay = int(days[hits[0]] - onset)
                    if delay <= detect_window:
                        detected[k] += 1
                        if k in delays:
                            delays[k].append(delay)

    def pct(a, b):
        return round(100.0 * a / b, 1) if b else 0.0

    return dict(
        n_crews=n_crews,
        n_events=n_events,
        detect_window_days=detect_window,
        false_alarm_pct={k: pct(healthy[k], healthy["n"]) for k in FA_KEYS},
        short_night_pct=pct(healthy["short_night"], healthy["n"]),
        detected_within_window_pct={k: pct(detected[k], n_events) for k in DET_KEYS},
        median_delay_days={k: (float(np.median(v)) if v else None) for k, v in delays.items()},
    )


def run_sensitivity_sweep(n_crews: int = 80, seed0: int = 9000) -> list[dict]:
    grid = []
    for z_val in (2.0, 2.5, 3.0, 3.5):
        for conv in (2, 3, 4):
            res = run_scenario_benchmark(
                n_crews=n_crews,
                seed0=seed0,
                detect_window=7,
                event_scale=0.75,
                event_type="multi_system",
                z_thresh=z_val,
                converge_action=conv,
            )
            grid.append(
                {
                    "z_thresh": z_val,
                    "converge_action": conv,
                    "false_alarm_action_pct": res["false_alarm_pct"]["action"],
                    "detect_action_pct": res["detected_within_window_pct"]["action"],
                    "is_frozen_default": (z_val == Z_FLAG and conv == CONVERGE_ACTION),
                }
            )
    return grid


BENCHMARK_FILE = Path(__file__).with_name("benchmark_results.json")


def build_benchmark_results() -> dict:
    scenarios = {
        "Strong Multi-System (1.0×)": run_scenario_benchmark(120, 5000, 7, 1.0, "multi_system"),
        "Subtle Multi-System (0.5× + CUSUM)": run_scenario_benchmark(120, 5200, 7, 0.5, "multi_system"),
        "Slow Metabolic Drift (14d ramp)": run_scenario_benchmark(120, 5400, 10, 1.0, "slow_metabolic"),
        "HR / Autonomic Infection": run_scenario_benchmark(120, 5600, 7, 1.0, "hr_infection"),
        "Sleep-Only Disruption (Hard Case)": run_scenario_benchmark(120, 5800, 7, 1.0, "sleep_only"),
    }
    return {
        "engine_version": ENGINE_VERSION,
        "scenarios": scenarios,
        "sensitivity": run_sensitivity_sweep(80, 9000),
    }


def load_benchmark_results(recompute: bool = False) -> dict:
    if not recompute and BENCHMARK_FILE.exists():
        try:
            data = json.loads(BENCHMARK_FILE.read_text(encoding="utf-8"))
            if data.get("engine_version") == ENGINE_VERSION and "scenarios" in data and "sensitivity" in data:
                return data
        except (OSError, json.JSONDecodeError):
            pass
    data = build_benchmark_results()
    try:
        BENCHMARK_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass
    return data


if __name__ == "__main__":
    print(json.dumps(load_benchmark_results(recompute=True), indent=2))
