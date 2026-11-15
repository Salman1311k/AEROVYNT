# SI-assisted: developed with Claude (Anthropic), a large language model, and reviewed and tested by the AEROVYNT team. See SI_DISCLOSURE.md.
"""Regenerate assets/data.js from the Python research code (run from research/: python tools/build_data.py)."""
import json, math, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import numpy as np
import aerovynt_coach as coach, aerovynt_engine as engine, aerovynt_evidence as ev

def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.floating, float)):
        return None if math.isnan(o) else float(o)
    if isinstance(o, np.bool_): return bool(o)
    return o

seed = coach.seed_history()
df = ev.load_cmp()
table, events = ev.personal_vs_population(df)
dq = ev.data_quality_flags(df)
cols = ["crew", "timepoint", "rel_day"] + [c for k in ev.ANALYTES for c in (k, k + "_lo", k + "_hi")]
data = dict(
    benchmark=engine.load_benchmark_results(),
    coach=dict(INDICATORS=coach.INDICATORS, ORDER=coach.ORDER, SYMPTOMS=coach.SYMPTOMS, ZONES=coach.ZONES,
               HAZARDS=coach.HAZARDS, ENVIRONMENTS=coach.ENVIRONMENTS, SCENARIOS=coach.SCENARIOS),
    seed=clean(seed.to_dict("records")),
    analytes={k: dict(label=v[0], unit=v[1]) for k, v in ev.ANALYTES.items()},
    cmp=clean(df[cols].to_dict("records")),
    pvp=clean(table.to_dict("records")),
    events=clean(events.to_dict("records")),
    dq=clean(dq.to_dict("records")),
    pvp_null=clean(ev.personal_flag_null(df)),
)
ar = pathlib.Path(__file__).resolve().parent.parent / "archive" / "benchmark_results_v3.2.json"
if ar.exists(): data["benchmark_v32"] = json.loads(ar.read_text(encoding="utf-8"))
rd = pathlib.Path(__file__).resolve().parent.parent / "realdata_results.json"  # produced by: python aerovynt_realdata.py
if rd.exists(): data["realdata"] = json.loads(rd.read_text(encoding="utf-8"))
rb = pathlib.Path(__file__).resolve().parent.parent / "robustness_results.json"
if rb.exists():  # produced by: python aerovynt_robustness.py
    data["robust"] = json.loads(rb.read_text(encoding="utf-8"))
r33 = pathlib.Path(__file__).resolve().parent.parent / "archive" / "robustness_results_v3.3.json"
if r33.exists(): data["robust_v33"] = json.loads(r33.read_text(encoding="utf-8"))
out = pathlib.Path(__file__).resolve().parent.parent.parent / "assets" / "data.js"
out.write_text("window.AERO_DATA=" + json.dumps(clean(data), separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
print("wrote", out, out.stat().st_size, "bytes")
