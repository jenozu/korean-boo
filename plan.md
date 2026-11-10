# 한글 — Standalone HTML Plan

## Product boundary

A dependency-free standalone HTML Korean-learning app for complete beginners. No framework, backend, package manager, or build-time JavaScript dependency. The browser opens `index.html` / `standalone.html` directly or through a basic static server.

## Current implementation

100-item Stage 1 curriculum (five 20-item days) and all 40 Hangul letters. Milestones 1–14 from `master_task.md`: versioned local state with merge-on-import; Again/Hard/Good/Easy scheduling; browser Korean audio; in-memory microphone recording; consent-gated browser transcription with word feedback; adaptive Korean → English quiz; "Meeting someone" scenario; "Alex's morning" story; grammar and culture tips; XP, streak, weekly goal and badges; local learner profile; PWA offline shell. Content from Milestones 9–11 is flagged for native review. Server accounts and sync are not built.

## Design system

Neo-brutalist candy-pop: Bubblegum Pink canvas, Pastel Cyan primary actions, Pastel Lilac supporting surfaces, heavy black borders and offset shadows, large Hangul glyphs, concise beginner copy.

## Development approach

One milestone at a time, each preserving direct browser use, saved-progress compatibility, the curriculum, and the visual system. Regenerate with `python3 scripts/build_standalone.py`. Future milestones are in `master_task.md`.
