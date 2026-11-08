# 한글 — Korean Voice Tutor

한글 (Hangeul) is a beginner-first Korean learning app built as a standalone HTML experience, modeled on the Russian `russia` project (Азбука). The repository contains the dependency-free browser app, its generator, the curriculum data, and documentation.

## Standalone browser app

`index.html` and `standalone.html` are the same generated file. No build step or runtime dependency is needed to use them:

- Open the file directly in a browser, or serve the folder with any static host (this is what Vercel serves).
- **Stage 1:** 100 everyday words and expressions in five 20-item study days, with Korean, a pronunciation guide, meaning, sentence patterns, mini conversations, a pronunciation key, and a Stage 2 readiness checklist.
- **Alphabet:** all 40 Hangul letters (basic consonants, vowels, aspirated and tense consonants, and combined vowels) with names, sound guides, example words, and tips. Tap a card to hear its example word.
- **Spaced repetition:** Again / Hard / Good / Easy ratings (10 minutes / 1 day / 3 days / 7 days, growing with repeats). The queue shows overdue items first, then weak items, then untouched ones, and says why each item is appearing.
- **Progress, Settings:** daily goal, completion bars, JSON backup / import / reset, and a review-schedule debug panel.
- **Local only:** progress is versioned and saved in the browser's `localStorage` (`hangeul-standalone`). Progress from the first Korean prototype (`hangeul-web-v1`) is migrated automatically.

```bash
python3 -m http.server 4173
# open http://localhost:4173/
```

## Regenerating the app

Edit `curriculum/korean/data.json` (content), `scripts/app.js` (logic), or `scripts/template.html` (markup and styles), then run:

```bash
python3 scripts/build_standalone.py
```

The script validates the data (100 items, 40 letters, complete unlock order) and writes `standalone.html` and `index.html`.

## Repository structure

```text
index.html, standalone.html     Generated, dependency-free browser app
scripts/build_standalone.py     Validates data and regenerates both files
scripts/template.html           Markup and styles
scripts/app.js                  App logic
curriculum/korean/data.json     Letters, Stage 1 items, patterns, conversations
master_task.md                  Incremental implementation roadmap
plan.md, TODO.md                Product boundary and milestone status
```

## Design language

Neo-brutalist candy-pop: Bubblegum Pink `#FFD8E8` canvas, Pastel Cyan `#9BE9FB` for primary actions, Pastel Lilac `#FAE8FF` for secondary content, white cards, heavy black borders, and offset black shadows.

## Development principle

Add one feature, verify it, document it, then move on. See `master_task.md`.

## Notes

- Korean audio uses the browser's `ko-KR` speech voice. Quality depends on the device; the app prefers a higher-quality Korean voice when one is installed.
- Vocabulary, romanization, and translations were written without a native review. Have a fluent speaker check Stage 1.
