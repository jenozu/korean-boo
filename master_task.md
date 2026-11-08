# Hangeul Master Task Plan

## Purpose

This document turns the original Korean voice-tutor idea into a sequence of independently implementable milestones. The current repository is the framework baseline only. This plan is documentation and sequencing; it does not claim that the future milestones are already implemented.

The working rule is strict: implement one milestone, verify it in the standalone browser app, record the result, and only then begin the next milestone. Avoid adding a second major capability while the current milestone is still unstable.

## Baseline: preserve before extending

**Status: framework prepared; future feature work not started.**

The baseline contains the standalone HTML prototype, the 100-item Korean Stage 1 curriculum, the 40-letter alphabet content, the current neo-brutalist visual system, browser text-to-speech playback, localStorage progress, the imported source curriculum, and a standalone-only runtime boundary.

Before feature work begins:

- Keep `standalone.html` runnable without a build step.
- Keep the Stage 1 learning order: meaning, pronunciation, say it aloud, recognize Hangul, use a tiny sentence.
- Keep all 40 letters and all 100 Stage 1 items available.
- Keep local progress data backward-compatible when new fields are introduced.
- Keep each milestone small enough to test manually in one short session.

## Milestone 1 — Make the learning state explicit

**Status: complete in the standalone HTML app.**

Implemented versioned local state (`version: 1`), migration from the original `goal`/`stage`/`letters` shape, per-item review records, event history, calendar-day reset handling, JSON export/import, and local-progress reset controls. JavaScript syntax and static HTTP smoke checks pass.

**Goal:** replace the prototype’s simple reviewed-item arrays with a versioned local data model that can support future features safely.

Implement:

- A versioned state object with learner preferences, daily activity, Stage 1 item records, alphabet records, and event history.
- Per-item fields for status, attempts, correct attempts, last reviewed timestamp, next review timestamp, difficulty, and streak contribution.
- A migration function from the current `localStorage` shape (`goal`, `stage`, `letters`) into the versioned shape.
- A reset/export/import control for debugging and user data portability.
- Calendar-day handling for daily progress and streaks.

Verify:

- Existing saved progress still appears after the migration.
- Refreshing the browser preserves all state.
- Corrupted or missing state falls back safely.
- Exported JSON can be imported into a clean browser session.

Do not add microphone input or new quiz types in this milestone.

## Milestone 2 — Add real review ratings and spaced repetition

**Status: complete in the standalone HTML app.**

Implemented Again/Hard/Good/Easy ratings, deterministic intervals, due-first and weak-item queue ordering, independent Stage 1 and alphabet scheduling records, visible return reasons, and a Settings debug view showing last review, rating, and next review. Browser-level checks confirmed Again (10 minutes) < Good (3 days) < Easy (7 days), overdue items are selected before untouched items, and scheduled state persists in localStorage.

**Goal:** turn review history into meaningful scheduling.

Implement:

- Rating buttons such as Again, Hard, Good, and Easy.
- A transparent scheduling algorithm with short intervals for weak items and longer intervals for mastered items.
- A due queue that prioritizes overdue items, then weak items, then new items.
- Separate scheduling for Stage 1 phrases and alphabet letters.
- A visible explanation of why an item is appearing again.
- A small debug view showing last review, rating, and next review date.

Verify:

- Again brings an item back sooner than Good or Easy.
- Easy does not make an item disappear permanently.
- Due items survive page refresh.
- The daily session selects due items before untouched future material.
- Scheduling is deterministic enough to reproduce during testing.

Do not add speech recognition in this milestone.

## Milestone 3 — Improve browser Korean audio

**Goal:** make listening practice dependable before asking the learner to speak.

Implement:

- A reusable audio controller around browser `speechSynthesis`.
- Korean voice discovery with graceful fallback when a native `ko-KR` voice is unavailable.
- Play, pause, replay, and adjustable playback speed.
- Sentence-level and word-level playback.
- Loading and unavailable states that do not block the lesson.
- Optional phonetic guide highlighting while audio plays, if browser support allows it.

Verify:

- Audio works on desktop and mobile browsers that expose speech synthesis.
- No duplicate speech queues accumulate after repeated taps.
- The app remains usable when speech synthesis is missing or blocked.
- Pronunciation guide text remains clearly separate from strict transliteration.

## Milestone 4 — Add learner microphone capture

**Goal:** let the learner record a response in the browser without scoring it yet.

Implement:

- `MediaRecorder` capability detection.
- Microphone permission request only after an explicit learner action.
- Record, stop, replay, and discard controls.
- Recording duration and clear permission/error messages.
- An in-memory recording path for the prototype; do not upload audio yet.
- A secure-context note for deployments that require HTTPS.

Verify:

- The user can record and replay a short Korean response.
- Permission denial leaves the rest of the app usable.
- Unsupported browsers show a useful fallback.
- Repeated recordings do not leak object URLs or stale controls.
- No audio is sent anywhere in this milestone.

## Milestone 5 — Add speech transcription

**Goal:** convert a learner recording into text so the app can compare what was said with the target.

Choose and document one implementation path:

- Browser-native speech recognition where it is available, or
- A small server/API transcription boundary, or
- A managed speech service with explicit privacy and cost handling.

Implement:

- A transcription request state machine: idle, recording, uploading/processing, result, error.
- Korean-language selection.
- Transcript display with retry behavior.
- Explicit user consent before sending audio to a remote service.
- No fake score when transcription fails.

Verify:

- Clear speech produces a transcript for supported environments.
- Errors are distinguishable from an incorrect answer.
- The user can retry without losing the target phrase.
- Audio and transcript handling are documented for privacy.

## Milestone 6 — Add pronunciation scoring and feedback

**Goal:** give useful feedback on a spoken target phrase rather than only showing a transcript.

Start with transcript-level similarity as the first measurable version. Do not describe it as phoneme-accurate scoring.

Implement:

- Normalization for case, punctuation, and whitespace.
- Word-level comparison and partial credit.
- A score plus human-readable feedback.
- Feedback categories such as missing words, extra words, and likely syllable trouble spots.
- A retry flow that preserves the prior attempt for comparison.
- Storage of score and attempt metadata in the review record.

Later enhancement:

- Add phoneme or acoustic scoring only after the transcript-based version is reliable and its limitations are clearly communicated.

Verify:

- Exact recognition gives a high score.
- Missing or extra words lower the score predictably.
- A transcription error is not presented as a pronunciation failure.
- Feedback is actionable for a beginner.

## Milestone 7 — Add structured quiz modes

**Goal:** expand beyond reveal cards while keeping short, manageable sessions.

Implement one mode at a time in this order:

1. Korean → English multiple choice.
2. English → Korean multiple choice.
3. Hangul letter recognition.
4. Sound-to-letter matching using the audio controller.
5. Typed fill-in-the-blank.
6. Typed translation.
7. Spoken response using the microphone/transcription pipeline.

For each mode:

- Reuse the due queue from spaced repetition.
- Show one clear question and one clear answer action.
- Give immediate feedback.
- Record the result as a review event.
- Keep a retry path without resetting the entire session.

Verify each mode independently before enabling the next one. Do not create a single large quiz screen with all modes mixed together.

## Milestone 8 — Add adaptive quiz selection

**Goal:** use performance to choose the next question intelligently.

Implement:

- Weak-area selection by item, letter, deck, and quiz mode.
- A balance between due reviews, new material, and confidence-building items.
- Protection against repeating the same item too many times in one session.
- A learner-visible reason such as “This one is back because it was tricky last time.”
- Difficulty tuning based on actual results rather than arbitrary labels alone.

Verify:

- Incorrect items reappear sooner.
- Strong items appear less often but still receive maintenance reviews.
- New material is introduced gradually.
- Selection remains usable when the learner has no review history.

## Milestone 9 — Add conversation scenarios

**Goal:** turn the vocabulary curriculum into guided, practical exchanges.

Start with one Korean scenario, such as meeting someone or asking for directions.

Implement:

- A short scripted dialogue with tutor and learner turns.
- English support that can be revealed without interrupting the flow.
- Listen, read, type, and speak response options where supported.
- Expected response variants rather than one exact string only.
- A safe recovery path when the learner says something unexpected.
- Scenario completion and review tagging.

Add scenarios one at a time: introduction, café, directions, shopping, and asking for help.

Verify:

- The dialogue can be completed from start to finish.
- The learner can replay any tutor turn.
- A wrong or unrecognized response receives a useful hint instead of a dead end.
- Conversation phrases link back to Stage 1 review items.

## Milestone 10 — Add story and comprehension practice

**Goal:** build connected reading/listening practice from known vocabulary.

Implement:

- One beginner Korean story with translation reveal.
- Audio playback for the story.
- Vocabulary highlighting for known and new words.
- Three comprehension questions.
- A cloze or fill-the-blank activity.
- Story vocabulary linked to the review queue.

Verify:

- The story is understandable using the learner’s available support.
- Questions are answerable from the text.
- Unknown vocabulary can be reviewed without abandoning the story.
- The activity remains short enough for a daily session.

## Milestone 11 — Add grammar and cultural context

**Goal:** provide small, relevant explanations at the moment of need.

Implement:

- A structured tip format with title, explanation, example, and optional “learn more.”
- Korean-specific beginner topics such as formal/informal you, soft sign behavior, stress, and pronunciation changes.
- Cultural notes attached to relevant vocabulary or scenarios.
- A dismissible tip that does not interrupt the core lesson.

Verify:

- Tips appear only when relevant.
- Tips do not overload the learner with grammar terminology.
- Every explanation has an example.
- Content can be updated independently from UI code.

## Milestone 12 — Add motivation and habit mechanics

**Goal:** make progress visible without turning practice into noise.

Implement:

- XP for completed reviews, quiz results, speaking attempts, and scenario completion.
- A small badge system tied to meaningful milestones.
- Streak calculation based on actual activity dates.
- Daily and weekly goals.
- A private progress summary before considering any leaderboard.

Optional later:

- Weekly leaderboard with clear privacy controls.
- Reminder notifications or email/SMS through a separate opt-in service.

Verify:

- XP cannot be duplicated by refreshing or replaying a completed state.
- Streaks handle missed days correctly.
- Goals are editable and persist.
- Motivation never replaces the learning feedback.

## Milestone 13 — Add durable accounts and sync

**Goal:** make progress portable across devices after the local learning loop is trustworthy.

Implement only after localStorage behavior and the review model are stable:

- Authentication.
- Server-side learner profile.
- Conflict-safe synchronization of review events.
- Backup/export and account deletion.
- Privacy documentation for audio and transcripts.

Verify:

- Local progress can be migrated into an account.
- Multiple devices converge without silently losing reviews.
- A user can export and delete their data.
- The app still works offline for the basic local loop.

## Milestone 14 — Standalone browser hardening

**Goal:** harden the standalone HTML app for reliable browser use and optional PWA packaging without introducing a mobile framework.

Evaluate:

- Installability and offline caching.
- Mobile microphone behavior.
- Audio behavior on iOS and Android browsers.
- Touch targets and one-handed layout.
- Push notifications.
- Whether a PWA manifest and service worker are worthwhile for the standalone browser experience.

Do not begin this milestone until the browser experience has a reliable learning loop and voice flow.

## Definition of done for the full roadmap

The product is ready for a broader release when a beginner can:

- Start with no Hangul knowledge.
- Complete short Korean sessions with clear progress.
- Hear native-language prompts and respond by typing or speaking.
- Receive honest, useful feedback on pronunciation and recall.
- Encounter difficult material again at the right time.
- Practice vocabulary in quizzes, scenarios, and stories.
- Understand why an answer was corrected.
- Resume across sessions without losing progress.
- Use the app without being overwhelmed by every feature at once.

## Working checklist for every milestone

Before starting a milestone:

- Define the smallest user-visible behavior.
- Identify the state fields and content required.
- Decide what remains intentionally out of scope.

After implementation:

- Test the happy path.
- Test refresh and empty-state behavior.
- Test an error or unsupported-device path.
- Check that old local progress still loads.
- Update this plan with the actual result and any limitation.
- Only then start the next milestone.
