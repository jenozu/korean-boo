"""Regenerate standalone.html (and index.html, which Vercel serves) from local data.

Inputs:  curriculum/korean/data.json, scripts/template.html, scripts/app.js
Output:  standalone.html, index.html (identical, dependency-free)
Run from the repository root:  python3 scripts/build_standalone.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
data = json.loads((root / 'curriculum/korean/data.json').read_text(encoding='utf-8'))

assert len(data['items']) == 100, len(data['items'])
assert len(data['letters']) == 40, len(data['letters'])
ids = [l['id'] for l in data['letters']]
assert len(set(ids)) == 40 and sorted(data['learnOrder']) == sorted(ids), 'learnOrder must cover every letter once'
assert [i['n'] for i in data['items']] == list(range(1, 101))
assert {i['day'] for i in data['items']} == {1, 2, 3, 4, 5}

html = (root / 'scripts/template.html').read_text(encoding='utf-8')
app = (root / 'scripts/app.js').read_text(encoding='utf-8')
payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = html.replace('__DATA__', payload).replace('__APP__', app)
assert '__DATA__' not in html and '__APP__' not in html

for name in ('standalone.html', 'index.html'):
    (root / name).write_text(html, encoding='utf-8')
print(f"wrote standalone.html + index.html: {len(data['items'])} items, {len(data['letters'])} letters")
