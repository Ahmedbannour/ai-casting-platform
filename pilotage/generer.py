"""Régénère tableau-de-bord.html à partir de template.html et data.json (python generer.py)."""
import json, pathlib
here = pathlib.Path(__file__).parent
data = json.loads((here / 'data.json').read_text(encoding='utf-8'))
html = (here / 'template.html').read_text(encoding='utf-8')
blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
(here / 'tableau-de-bord.html').write_text(html.replace('__DATA__', blob), encoding='utf-8')
print('tableau-de-bord.html régénéré :', len(data.get('taches', [])), 'tâches')
