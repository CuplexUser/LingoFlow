# LingoFlow TODO and Roadmap

This file captures current product and technical priorities for future assignments.

## Scope decisions

- We are **not** aiming for a fully tamper-proof system.
- We **do** want to prevent trivial cheating and easy score inflation.
- Hearts are currently de-prioritized in the product experience.

## Priority order

1. Tests for core logic and regression safety.
2. Basic server-side validation and anti-trivial-cheat protections.
3. Better learning depth (retention, diagnosis, exercise quality).
4. Content scaling and analytics improvements.

## Phase 1: Reliability and anti-trivial-cheat

- [x] Move final scoring authority to server:
  - create server-side session records (`sessionId` + question IDs + expected answers)
  - validate submitted answers server-side on completion
- [x] Add request validation at `/api/session/complete`:
  - reject invalid ranges (`score < 0`, `maxScore <= 0`, `score > maxScore`)
  - normalize and clamp numeric fields
- [x] Add basic anti-tamper checks:
  - ensure `difficultyLevel` and category match started session
  - prevent completion of unknown/expired session IDs

## Phase 2: Automated tests

- [x] Add backend test setup under `server/src/__tests__/`.
- [x] Unit tests for:
  - XP calculation behavior and penalty handling
  - mastery updates and level unlock thresholds
  - session completion validation edge cases
  - session generation level adaptation boundaries
- [x] Integration tests for:
  - `/api/session/start` -> `/api/session/complete` happy path
  - invalid completion payloads

## Phase 3: Better learning depth

- [x] Add per-item progress model (`item_progress`) for retention:
  - `item_id`, `ease`, `last_seen`, `next_due`, `streak`, `error_count`
- [x] Introduce spaced repetition scheduling in session generation.
- [x] Track error types (word order, grammar agreement, tense, vocabulary confusion).
- [x] Improve answer checking:
  - normalized punctuation/casing handling
  - support for accepted answer variants where appropriate
- [x] Improve distractor generation quality:
  - same grammar pattern / semantic neighborhood distractors

## Phase 4: Learning experience expansion

- [x] Add exercise types:
  - cloze deletion
  - listening dictation
  - guided dialogue turn completion
- [x] Add grammar/objective tagging:
  - per-objective mastery views (not only category averages)
- [x] Upgrade stats:
  - retention trend
  - error-type trend
  - weak-objective recommendation panel

## Product metrics follow-up

- [x] Replace daily progress from lifetime XP with true "XP earned today".
- [x] Add per-day XP table and daily aggregation API.

