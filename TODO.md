# LingoFlow TODO and Roadmap

This file captures current product and technical priorities for future assignments.

## Scope decisions

- We are **not** aiming for a fully tamper-proof system.
- We **do** want to prevent trivial cheating and easy score inflation.
- Hearts are currently de-prioritized in the product experience.

## Current focus

## Phase 7: Integrity, operations, and scale

- [ ] Prevent score inflation via duplicate `questionId` submissions.
- [ ] Wrap session completion writes in a DB transaction (atomic completion).
- [x] Replace hardcoded frontend API base URL with environment configuration.
- [ ] Add rate limiting for auth and session endpoints.
- [ ] Add SQLite indexes for stats/history query paths.
- [x] Add structured request/error logging and basic health diagnostics.

## Completed archive

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

## Next roadmap (post-completion backlog)

These items are intentionally left open for the next development cycle.

## Phase 5: Multi-user foundation

- [x] Add `users` table and authentication endpoints (register/login/me).
- [x] Add `user_id` ownership to learner data tables and queries.
- [x] Derive user identity server-side from auth token/session (never trust client-sent user id).
- [x] Migrate existing single-user data into a default user safely.

## Phase 6: Frontend architecture and test coverage

- [x] Refactor `client/src/App.jsx` into smaller components/hooks.
- [x] Add frontend tests under `client/src/__tests__/`:
  - session flow (submit/retry/reveal/resume)
  - setup save/reset behavior
  - stats rendering with API fixtures

## Phase 6 follow-up: Deployable auth UX

- [x] Add dedicated frontend login and registration pages.
- [x] Add token persistence and authenticated API calls in client.
- [x] Add optional Google sign-in path (`/api/auth/google` + Google Identity button).
- [x] Add sign-out flow and auth-gated app bootstrap.
- [x] Require email verification for email/password registration before login.

