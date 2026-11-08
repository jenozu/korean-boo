# 한글 — Standalone HTML Plan

## Product boundary

A dependency-free standalone HTML Korean-learning app for complete beginners. No framework, backend, package manager, or build-time JavaScript dependency. The browser opens `index.html` / `standalone.html` directly or through a basic static server.

## Current implementation

100-item Stage 1 curriculum (five 20-item days) and all 40 Hangul letters; meaning-first review cards; Korean playback through browser speech synthesis; Today, Stage 1, Alphabet, Progress, and Settings views; Milestone 1 (versioned local state, migration, local-date daily tracking, JSON backup/import/reset) and Milestone 2 (Again/Hard/Good/Easy ratings, deterministic intervals, due-first queue, reason text, schedule debug panel).

## Design system

Neo-brutalist candy-pop: Bubblegum Pink canvas, Pastel Cyan primary actions, Pastel Lilac supporting surfaces, heavy black borders and offset shadows, large Hangul glyphs, concise beginner copy.

## Development approach

One milestone at a time, each preserving direct browser use, saved-progress compatibility, the curriculum, and the visual system. Regenerate with `python3 scripts/build_standalone.py`. Future milestones are in `master_task.md`.
