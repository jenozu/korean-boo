# 한글 — Korean Alphabet & Stage 1

A beginner's Korean app, rebuilt from the Russian `rossia` project (Азбука). It teaches all 40 Hangul letters and a 100-item "speak first" Stage 1 of everyday words and expressions.

It is a single static page, `index.html`, with no build step and no dependencies. Open it in a browser, or deploy the folder to any static host.

## What it does

**Alphabet**
- All 40 Hangul letters (19 consonants, 21 vowels), grouped into five decks: familiar shapes, sneaky lookalikes, new characters, tricky sounds, and combined vowels.
- Letters unlock gradually. Mastering letters opens more of the learning order.
- Flashcards with the Hangul name, sound, a guide, an example syllable block word, romanization, meaning, and a tip.
- Spaced repetition: Again, Hard, and Got it reschedule each letter. Difficult letters return sooner.
- Daily goal (5–30, adjustable), practice streak, and completion percentage.
- Two session modes: flip cards, and "Listen & choose," which plays audio and asks you to pick the letter.

**Stage 1**
- 100 everyday words and expressions in seven days, in ten groups.
- Each item follows the sequence: meaning, pronunciation, say it aloud, recognize the Hangul, use a tiny sentence.
- Ten sentence patterns, three mini conversations, a pronunciation key, and a 10-point Stage 2 readiness checklist.

**Reading**
- Eight short words built from letters you have already met, each broken into syllable blocks.

Audio uses the browser's Korean (`ko-KR`) speech voice when one is available.

Progress is saved in your browser's local storage. Nothing is sent to a server.

## Files

- `index.html` — the whole app: content, learning logic, and UI.
- `TODO.md` — the build checklist, carried over from the original project.

## Local preview

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Notes

- The original project also contained an Expo / React Native app. Its app shell was not in the uploaded source, so that code has not been ported. This version is the complete, runnable web app.
- Stage 1 romanization is a practical pronunciation guide, not a strict academic transcription. Korean has no stress marks, so the guide does not mark stress.
