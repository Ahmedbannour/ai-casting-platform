"""Régénère tableau-de-bord.html (salle de pilotage ahmedRoom) à partir de template.html,
data.json (AI Casting) et projets/*.json (autres projets). python generer.py"""
import json, pathlib
here = pathlib.Path(__file__).parent
base = json.loads((here / 'data.json').read_text(encoding='utf-8'))
projets = [{'id': 'ai-casting', 'nom': 'AI Casting', 'emoji': '🎬', 'data': base}]
for f in sorted((here / 'projets').glob('*.json')):
    d = json.loads(f.read_text(encoding='utf-8'))
    # Chaque projet a son équipe d'ingénieurs ; les fonctions support (direction, RH…) sont communes
    d['departements'] = d.get('departements') or base['departements']
    d['cycle'] = d.get('cycle') or base['cycle']
    meta = {'zanqa': ('Safi Jacob · street food', '🥙'), 'patisserie-fares': ('Pâtisserie FARES', '🎂')}.get(f.stem, (d['meta']['projet'], '📁'))
    projets.append({'id': f.stem, 'nom': meta[0], 'emoji': meta[1], 'data': d})
blob = json.dumps({'projets': projets}, ensure_ascii=False).replace('</', '<\\/')
html = (here / 'template.html').read_text(encoding='utf-8')
(here / 'tableau-de-bord.html').write_text(html.replace('__DATA__', blob), encoding='utf-8')
print('tableau-de-bord.html régénéré :', ', '.join(f"{p['nom']} ({len(p['data'].get('taches', []))} tâches)" for p in projets))
