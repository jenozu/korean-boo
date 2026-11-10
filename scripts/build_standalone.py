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

# Milestone 9–11 content must reference real Stage 1 items and have valid answers.
items_by_n = {i['n']: i for i in data['items']}
for tip in data['contextTips']:
    assert all(n in items_by_n for n in tip['related']), f"context tip {tip['id']} references a missing item"
story = data['story']
story_text = ' '.join(line['ko'] for line in story['lines'])
for v in story['vocab']:
    assert v['id'] in items_by_n and v['word'] in story_text, f"story vocab {v['word']} is not in the story or Stage 1"
for q in story['questions']:
    assert q['answer'] in q['options'], f"story question answer missing: {q['q']}"
assert story['cloze']['answer'] in story['cloze']['options'], 'cloze answer missing'
turns = data['scenario']['turns']
assert all(t['accept'] for t in turns[:-1]) and not turns[-1]['accept'], 'scenario turns must end with a completion turn'

html = (root / 'scripts/template.html').read_text(encoding='utf-8')
app = (root / 'scripts/app.js').read_text(encoding='utf-8')
payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = html.replace('__DATA__', payload).replace('__APP__', app)
assert '__DATA__' not in html and '__APP__' not in html

for name in ('standalone.html', 'index.html'):
    (root / name).write_text(html, encoding='utf-8')
print(f"wrote standalone.html + index.html: {len(data['items'])} items, {len(data['letters'])} letters")
