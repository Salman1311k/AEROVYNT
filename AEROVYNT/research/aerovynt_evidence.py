# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""Evidence layer: loads the real NASA OSD-575 CMP file and tests personal baselines vs population ranges."""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).with_name("data") / "LSDS-8_CMP_TRANSFORMED.csv"
TP_ORDER = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
TP_DAY = {"L-92": -92, "L-44": -44, "L-3": -3, "R+1": 1, "R+45": 45, "R+82": 82, "R+194": 194}
PRE, POST = ["L-92", "L-44", "L-3"], ["R+1", "R+45", "R+82", "R+194"]
RCV_Z = 1.96 * np.sqrt(2)  # 95% two-sided reference change value multiplier

ANALYTES = {  # key -> (label, unit, csv prefix)
    "glucose": ("Glucose", "mg/dL", "glucose"),
    "albumin": ("Albumin", "g/dL", "albumin"),
    "creatinine": ("Creatinine", "mg/dL", "creatinine"),
    "bun": ("Urea nitrogen (BUN)", "mg/dL", "urea_nitrogen_bun"),
    "sodium": ("Sodium", "mmol/L", "sodium"),
    "potassium": ("Potassium", "mmol/L", "potassium"),
    "calcium": ("Calcium", "mg/dL", "calcium"),
    "chloride": ("Chloride", "mmol/L", "chloride"),
    "co2": ("Carbon dioxide", "mmol/L", "carbon_dioxide"),
    "protein": ("Total protein", "g/dL", "total_protein"),
    "alp": ("Alkaline phosphatase", "U/L", "alkaline_phosphatase"),
    "alt": ("ALT", "U/L", "alt"),
    "ast": ("AST", "U/L", "ast"),
    "bilirubin": ("Total bilirubin", "mg/dL", "total_bilirubin"),
}


def load_cmp() -> pd.DataFrame:
    raw = pd.read_csv(DATA, na_values=["NA", "N/A", ""])
    out = pd.DataFrame({"crew": raw["Sample Name"].str.extract(r"(C\d+)")[0],
                        "timepoint": raw["Sample Name"].str.extract(r"serum_(.+)$")[0]})
    out["rel_day"] = out["timepoint"].map(TP_DAY)
    for k, (_, _, p) in ANALYTES.items():
        vcol = [c for c in raw.columns if c.startswith(p + "_value")][0]
        lo = [c for c in raw.columns if c.startswith(p + "_range_min") or c.startswith(p + "_min")][0]
        hi = [c for c in raw.columns if c.startswith(p + "_range_max") or c.startswith(p + "_max")][0]
        out[k] = pd.to_numeric(raw[vcol], errors="coerce")
        out[k + "_lo"] = pd.to_numeric(raw[lo], errors="coerce")
        out[k + "_hi"] = pd.to_numeric(raw[hi], errors="coerce")
    out["bun_cr_ratio"] = out["bun"] / out["creatinine"]
    out["order"] = out["timepoint"].map({t: i for i, t in enumerate(TP_ORDER)})
    return out.sort_values(["crew", "order"]).reset_index(drop=True)


def personal_vs_population(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Post-flight draws flagged by (a) lab population range, (b) within-person reference change value.
    Within-person SD is pooled from the three pre-flight draws of all crew (df = 8)."""
    rows, events = [], []
    for k, (label, unit, _) in ANALYTES.items():
        pre = df[df.timepoint.isin(PRE)].pivot(index="crew", columns="timepoint", values=k)[PRE]
        ok = pre.notna().all(axis=1)
        if ok.sum() < 2:
            continue
        sd = float(np.sqrt((pre[ok].var(axis=1, ddof=1)).mean()))
        mean = pre.mean(axis=1)
        n = pop = per = both = 0
        for _, r in df[df.timepoint.isin(POST)].iterrows():
            v = r[k]
            if pd.isna(v) or r.crew not in mean.index or pd.isna(mean[r.crew]) or sd == 0:
                continue
            n += 1
            lo, hi = r[k + "_lo"], r[k + "_hi"]
            f_pop = bool((pd.notna(hi) and v > hi) or (pd.notna(lo) and v < lo))
            f_per = bool(abs(v - mean[r.crew]) > RCV_Z * sd)
            pop += f_pop; per += f_per; both += (f_pop and f_per)
            if f_pop != f_per:
                events.append(dict(crew=r.crew, timepoint=r.timepoint, analyte=label, unit=unit, value=v,
                                   personal_mean=round(float(mean[r.crew]), 2), lab_range=f"{lo:g}–{hi:g}",
                                   caught_by="personal baseline only" if f_per else "lab range only"))
        rows.append(dict(analyte=label, unit=unit, within_person_sd=round(sd, 3), post_draws=n,
                         flagged_lab_range=pop, flagged_personal=per, flagged_both=both,
                         personal_only=per - both, lab_only=pop - both))
    return pd.DataFrame(rows), pd.DataFrame(events)


def data_quality_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Values that look physiologically implausible or likely pre-analytical artifacts (need repeat draw)."""
    out = []
    for _, r in df.iterrows():
        if pd.notna(r.glucose) and r.glucose < 54:
            out.append(dict(crew=r.crew, timepoint=r.timepoint, analyte="Glucose", value=r.glucose, unit="mg/dL",
                            note="< 54 mg/dL in an asymptomatic crew member: confirm with repeat draw (possible delayed sample separation)."))
        if pd.notna(r.potassium) and r.potassium > 5.5:
            out.append(dict(crew=r.crew, timepoint=r.timepoint, analyte="Potassium", value=r.potassium, unit="mmol/L",
                            note="Isolated high K⁺: check for hemolysis before acting."))
    return pd.DataFrame(out)


# --------------------------------------------------------------------------------------
# Chance expectation for the personal-baseline flags (parametric-bootstrap null)
# --------------------------------------------------------------------------------------
def _resolution(values: pd.Series) -> float:
    """Measurement step of an analyte, inferred from the number of decimals in the reported values."""
    dec = 0
    for v in values.dropna():
        s = f"{float(v):.4f}".rstrip("0")
        dec = max(dec, len(s.split(".")[1]) if "." in s else 0)
    return 10.0 ** -dec


def personal_flag_null(df: pd.DataFrame, n_sim: int = 20000, seed: int = 575, sigma_mult: float = 1.0) -> dict:
    """How many post-flight draws would the personal-baseline rule flag if NOTHING had changed?

    Null model: every draw (3 pre-flight and each post-flight draw) is the crew member's own pre-flight mean plus
    Gaussian noise with the observed pooled within-person SD (times sigma_mult), rounded to the lab's reporting step.
    The same rule as personal_vs_population is then applied to the simulated data, so the chance rate includes the
    small-sample uncertainty of the SD (8 degrees of freedom) and rounding. Draw counts per crew mirror the real file.
    """
    rng = np.random.default_rng(seed)
    per_analyte = {}
    tot_per = np.zeros(n_sim); tot_only = np.zeros(n_sim); obs_per = obs_only = 0
    for k, (label, unit, _) in ANALYTES.items():
        pre = df[df.timepoint.isin(PRE)].pivot(index="crew", columns="timepoint", values=k)[PRE]
        ok = pre.notna().all(axis=1)
        if ok.sum() < 2:
            continue
        crews = list(pre.index[ok]); mu = pre.loc[crews].mean(axis=1).to_numpy()
        sd_obs = float(np.sqrt(pre.loc[crews].var(axis=1, ddof=1).mean()))
        if sd_obs == 0:
            continue
        sig = sd_obs * sigma_mult; res = _resolution(df[k])
        pre_sim = mu[None, :, None] + rng.normal(0, sig, (n_sim, len(crews), 3))
        pre_sim = np.round(pre_sim / res) * res
        sd_sim = np.sqrt(pre_sim.var(axis=2, ddof=1).mean(axis=1))          # pooled within-person SD per simulation
        mean_sim = pre_sim.mean(axis=2)
        n_post = 0; exp_per = np.zeros(n_sim); exp_only = np.zeros(n_sim); o_per = o_only = 0
        for _, r in df[df.timepoint.isin(POST)].iterrows():
            if pd.isna(r[k]) or r.crew not in crews:
                continue
            ci = crews.index(r.crew); n_post += 1
            lo, hi = r[k + "_lo"], r[k + "_hi"]
            v_sim = np.round((mu[ci] + rng.normal(0, sig, n_sim)) / res) * res
            f_per = np.abs(v_sim - mean_sim[:, ci]) > RCV_Z * sd_sim
            f_pop = ((v_sim > hi) if pd.notna(hi) else False) | ((v_sim < lo) if pd.notna(lo) else False)
            exp_per += f_per; exp_only += (f_per & ~f_pop)
            v = r[k]; m_obs = float(pre.loc[r.crew].mean())
            fp_obs = abs(v - m_obs) > RCV_Z * sd_obs
            fpop_obs = bool((pd.notna(hi) and v > hi) or (pd.notna(lo) and v < lo))
            o_per += int(fp_obs); o_only += int(fp_obs and not fpop_obs)
        per_analyte[label] = dict(post_draws=n_post, observed_personal=o_per, expected_personal=round(float(exp_per.mean()), 2))
        tot_per += exp_per; tot_only += exp_only; obs_per += o_per; obs_only += o_only
    q = lambda a: [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]
    return dict(n_sim=n_sim, sigma_mult=sigma_mult, seed=seed,
                observed_personal=int(obs_per), expected_personal=round(float(tot_per.mean()), 1), null_95=q(tot_per),
                p_personal=round(float((tot_per >= obs_per).mean()), 4),
                observed_personal_only=int(obs_only), expected_personal_only=round(float(tot_only.mean()), 1), null_95_only=q(tot_only),
                p_personal_only=round(float((tot_only >= obs_only).mean()), 4),
                post_draws=int(sum(a["post_draws"] for a in per_analyte.values())), per_analyte=per_analyte)
