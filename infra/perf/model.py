"""Mise à l'échelle théorique (règle client D-004) à partir des mesures de scale-bench.ps1.

1. Complexité attendue de chaque étape, déduite de son fonctionnement (requêtes SQL, index).
2. Ajustement du modèle par moindres carrés sur les médianes des volumes « à chaud ».
3. Marge d'incertitude : rééchantillonnage (bootstrap) des mesures individuelles, intervalle 90 %.
4. Charge simultanée : Universal Scalability Law (Gunther), X(N) = λN / (1 + σ(N−1) + κN(N−1)).
Sorties : results/modele.json, ../../docs/perf/*.png. Usage : python model.py [dossier_results]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import curve_fit, nnls
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RES = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "results"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parents[2] / "docs" / "perf"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(42)

# Étapes : libellé, complexité théorique et justification
STEPS = {
    "liste_page1":    ("Liste, page 1 (tri par nom)", "n",   "index sur le nom + LIMIT, mais le total de la page (count) parcourt la table"),
    "filtre_combine": ("Filtres genre + âge + ville",  "n",   "count et filtrage sur une part de la table proportionnelle à n"),
    "recherche_nom":  ("Recherche par nom",            "log", "index trigramme (pg_trgm) : coût quasi constant"),
    "statistiques":   ("Statistiques (4 compteurs)",   "n",   "count(*) sur 4 tables : parcours complet"),
    "ia_classement":  ("Recherche IA : classement",    "n",   "score calculé en base sur chaque acteur candidat, puis tri"),
    "ia_explication": ("Recherche IA : explication",   "1",   "le modèle ne lit que le top 5 : indépendant du volume"),
}
WARM_FROM = 1_000          # volumes plus petits mesurés juste après le démarrage (JVM pas encore « chaude »)
TARGETS = [1_000_000, 10_000_000]

def design(n, kind):
    n = np.asarray(n, dtype=float)
    if kind == "n":   return np.column_stack([np.ones_like(n), n])
    if kind == "log": return np.column_stack([np.ones_like(n), np.log10(n)])
    return np.ones((len(n), 1))

def fit(n, t, kind):
    # Moindres carrés à coefficients positifs : le temps ne peut pas diminuer quand le volume augmente
    coef, _ = nnls(design(n, kind), np.asarray(t, dtype=float))
    return coef

def predict(coef, n, kind):
    return design(np.atleast_1d(n), kind) @ coef

vol = pd.read_csv(RES / "volume.csv", encoding="utf-8-sig")
measured_n = sorted(vol.acteurs.unique())
model = {"volumes_mesures": [int(x) for x in measured_n], "etapes": {}, "concurrence": {}}

for key, (label, kind, why) in STEPS.items():
    d = vol[(vol.endpoint == key) & (vol.acteurs >= WARM_FROM)]
    groups = {n: g.ms.to_numpy() for n, g in d.groupby("acteurs")}
    ns = np.array(sorted(groups))
    med = np.array([np.median(groups[n]) for n in ns])
    coef = fit(ns, med, kind)
    # bootstrap : on rééchantillonne les mesures de chaque volume, on réajuste
    boots = []
    for _ in range(2000):
        m = np.array([np.median(rng.choice(groups[n], len(groups[n]))) for n in ns])
        boots.append(predict(fit(ns, m, kind), TARGETS, kind))
    boots = np.array(boots)
    lo, hi = np.percentile(boots, 5, axis=0), np.percentile(boots, 95, axis=0)
    pred = predict(coef, TARGETS, kind)
    resid = med - predict(coef, ns, kind)
    all_med = vol[vol.endpoint == key].groupby("acteurs").ms.median()
    model["etapes"][key] = {
        "libelle": label, "complexite": {"n": "O(n)", "log": "O(log n)", "1": "O(1)"}[kind], "justification": why,
        "mesures_mediane_ms": {int(n): round(float(v), 1) for n, v in all_med.items()},
        "coefficients": [float(c) for c in coef],
        "pente_ms_par_1000_acteurs": round(float(coef[1]) * 1000, 3) if kind == "n" else None,
        "erreur_residuelle_ms": round(float(np.sqrt(np.mean(resid ** 2))), 1),
        "extrapolation": {str(t): {"ms": round(float(p), 0), "intervalle_90": [round(float(a), 0), round(float(b), 0)]}
                          for t, p, a, b in zip(TARGETS, pred, lo, hi)},
    }

# ── Universal Scalability Law ──
def usl(N, lam, sigma, kappa):
    return lam * N / (1 + sigma * (N - 1) + kappa * N * (N - 1))

conc = pd.read_csv(RES / "concurrence.csv", encoding="utf-8-sig")
for key, g in conc.groupby("endpoint"):
    N, X = g.utilisateurs.to_numpy(float), g.debit_req_s.to_numpy(float)
    p, _ = curve_fit(usl, N, X, p0=[X[1] / 2, 0.05, 0.001], bounds=([0, 0, 0], [1e4, 1, 1]), maxfev=20000)
    lam, sigma, kappa = p
    n_star = float(np.sqrt((1 - sigma) / kappa)) if kappa > 0 else float("inf")
    model["concurrence"][key] = {
        "libelle": STEPS[key][0], "acteurs": int(g.acteurs.iloc[0]),
        "mesures": [{"utilisateurs": int(a), "debit_req_s": float(b), "latence_ms": float(c)}
                    for a, b, c in zip(g.utilisateurs, g.debit_req_s, g.latence_moy_ms)],
        "lambda": round(float(lam), 2), "sigma_contention": round(float(sigma), 4), "kappa_coherence": round(float(kappa), 5),
        "utilisateurs_optimum": round(n_star, 1), "debit_max_req_s": round(float(usl(n_star, *p)), 1),
    }

(RES / "modele.json").write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Graphiques : mesuré (points) et extrapolé (tirets + bande 90 %) ──
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
COLORS = {"liste_page1": "#5B7FD1", "filtre_combine": "#C99400", "recherche_nom": "#2E9E8F",
          "statistiques": "#8A6BC9", "ia_classement": "#D9573F"}
fig, ax = plt.subplots(figsize=(9, 5.2), dpi=150)
grid = np.logspace(2, 7, 200)
for key, color in COLORS.items():
    label, kind, _ = STEPS[key]
    e = model["etapes"][key]
    ns = np.array(list(e["mesures_mediane_ms"].keys()), float)
    ax.plot(ns, list(e["mesures_mediane_ms"].values()), "o", color=color, ms=6, label=f"{label} — {e['complexite']}")
    coef = np.array(e["coefficients"])
    ax.plot(grid, predict(coef, grid, kind), "--", color=color, lw=1.4, alpha=.9)
    lo = [e["extrapolation"][str(t)]["intervalle_90"][0] for t in TARGETS]
    hi = [e["extrapolation"][str(t)]["intervalle_90"][1] for t in TARGETS]
    ax.fill_between(TARGETS, lo, hi, color=color, alpha=.12)
ax.axvspan(1e2, max(measured_n), color="#888", alpha=.06)
ax.text(1.2e2, 0.92, "zone mesurée", transform=ax.get_xaxis_transform(), color="#666")
ax.text(1.3e6, 0.92, "zone extrapolée", transform=ax.get_xaxis_transform(), color="#666")
ax.set_xscale("log"); ax.set_yscale("log")
ax.set_xlabel("Nombre d'acteurs dans la base"); ax.set_ylabel("Temps de réponse médian (ms)")
ax.set_title("Temps de réponse selon le volume — points : mesuré · tirets : modèle extrapolé (bande : intervalle 90 %)", fontsize=10)
ax.legend(fontsize=8.5, frameon=False, loc="upper left", bbox_to_anchor=(0, 0.88))
ax.grid(alpha=.25, which="both")
fig.tight_layout(); fig.savefig(OUT / "temps-volume.png"); plt.close(fig)

fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
Ng = np.linspace(1, 40, 200)
for key, color in [("filtre_combine", "#C99400"), ("ia_classement", "#D9573F")]:
    c = model["concurrence"][key]
    N = [m["utilisateurs"] for m in c["mesures"]]; X = [m["debit_req_s"] for m in c["mesures"]]
    ax.plot(N, X, "o", color=color, ms=6, label=f"{c['libelle']} — mesuré")
    ax.plot(Ng, usl(Ng, c["lambda"], c["sigma_contention"], c["kappa_coherence"]), "--", color=color,
            label=f"modèle USL (σ={c['sigma_contention']}, κ={c['kappa_coherence']}, optimum ≈ {c['utilisateurs_optimum']} utilisateurs)")
ax.set_xlabel("Utilisateurs simultanés"); ax.set_ylabel("Débit (requêtes par seconde)")
nb = f"{model['concurrence']['filtre_combine']['acteurs']:,}".replace(",", " ")
ax.set_title(f"Débit selon la charge (base de {nb} acteurs) — points : mesuré · tirets : modèle USL", fontsize=10)
ax.legend(fontsize=8.5, frameon=False); ax.grid(alpha=.25)
fig.tight_layout(); fig.savefig(OUT / "debit-utilisateurs.png"); plt.close(fig)

print(json.dumps(model, ensure_ascii=False, indent=1))
