# LingoFlow TODO and Roadmap

This file captures current product and technical priorities for future assignments.

## Scope decisions

- We are **not** aiming for a fully tamper-proof system.
- We **do** want to prevent trivial cheating and easy score inflation.
- Hearts are currently de-prioritized in the product experience.

## Current focus

## Active roadmap

### Phase 7: Integrity, operations, and scale

- [x] Prevent score inflation via duplicate `questionId` submissions.
- [x] Wrap session completion writes in a DB transaction (atomic completion).
- [x] Replace hardcoded frontend API base URL with environment configuration.
- [x] Add rate limiting for auth and session endpoints.
- [x] Add SQLite indexes for stats/history query paths.
- [x] Add structured request/error logging and basic health diagnostics.

### Phase 10: Session UX and retention polish

- [x] Post-session mistake drill from attempt logs ("Review mistakes" mini-session).
- [x] Stats visuals with bars and a 14-day XP trend graph from `daily_xp`.
- [x] Refine stats visuals to match template blocks (KPI cards, chart titles, error pills, language rows) and ensure chart theming stays correct across dark/light toggles.
- [x] Add focused Russian `ты` vs `вы` exercises.
- [x] Session-player keyboard shortcuts (`1-4` select option, `Enter` submit).
- [x] Daily challenge endpoint with deterministic same-per-language/per-day sessions.
- [x] React error boundary around `SessionPlayer` with friendly fallback.
- [x] Session summary share card with copyable one-line result.

### Phase 12: Engagement, quality, and UX polish

- [x] Daily streak badge with "streak at risk" warning when no practice today.
- [x] Live XP estimate tally in session header (updates per correct answer).
- [x] Smooth question transitions (slide-up animation on question change).
- [x] Improve `build_sentence` noise token quality: 3 plausible-length distractors instead of 2 random words.
- [x] Bookmark / "Save for review" button on feedback panel — persisted per user via `bookmarks` table and `/api/bookmarks` REST endpoints.
- [x] SQLite indexes on `daily_xp(user_id, date)`, `daily_xp(user_id, language, date)`, `progress(user_id)`, and `bookmarks(user_id)`.
- [x] In-memory sliding-window rate limiting on auth endpoints (5 req/min for login/register, 10 req/min for others).
- [x] Fix MC punctuation giveaway: normalize all option endings to match correct answer terminal punctuation.
- [x] Progressive build-sentence hints: 1st click plays audio, 2nd click pulses the next token to place.
- [x] Correct-answer flash: 900 ms "Correct!" green banner before auto-advancing.
- [x] Keyboard shortcut key labels (1–4) on multiple-choice option buttons.

### Phase 8: Quality tooling and maintainability

- [x] Expand progression test coverage with level-up and unlock-threshold edge cases.
- [x] Add project-level ESLint and Prettier configuration in `package.json`.
- [x] Refactor `server/src/data.ts` into smaller focused modules.
- [x] Set up Husky pre-commit verification hooks.
- [x] Start the client TypeScript migration:
  - install React type packages
  - switch the client entrypoint to `main.tsx`
  - replace JS/JSX compatibility shims with direct TS/TSX modules
- [x] Add typed client domain models for course, session, and contribution flows.
- [x] Normalize raw session payloads into discriminated TypeScript question unions.

### Phase 9: Content breadth and richer lesson formats

- [x] Add new course categories:
  - `Hobbies & Leisure`
  - `Science & Technology`
  - `Culture & History`
  - `Environment & Sustainability`
- [ ] Expand each new category from the starter batch toward a 20-50 exercise target per level.
- [x] Seed starter JSON batches with richer exercise fields:
  - `prompt`
  - `correctAnswer`
  - `hints`
  - `difficulty`
  - optional `audioUrl`, `imageUrl`, `culturalNote`, `exerciseType`
- [x] Add culture-aware starter content, including Swedish `fika` notes.
- [x] Extend session rendering for richer lesson types:
  - flashcards
  - matching
  - pronunciation capture
  - image display
  - Web Audio playback for referenced clips
- [x] Add a learner beta flag for experimental lessons.
- [x] Add a community exercise contribution route and frontend submission form.
- [x] Track per-exercise usage/completion data in the DB for iteration.
- [x] Surface recommendation data based on learner strengths and weak spots.
- [ ] Add moderation review tooling for community exercises.
- [ ] Add sourced language-specific audio batches from providers such as Forvo or LibriVox.

### Phase 11: Content quality and learning depth plan

- [x] Baseline and instrumentation pass before content expansion:
  - define per-language/category baseline metrics (accuracy, reveal rate, retry rate, completion rate)
  - capture objective-level weak spots to guide which content to add first
  - lock an evaluation checklist for each content PR (clarity, CEFR fit, distractor quality, hint usefulness)
- [x] Phrase bank expansion (`server/content/languages/*.json`):
  - expand high-traffic categories first, then underused categories
  - target 20-50 exercises per level with balanced skill mix (recognition, production, listening, word order)
  - add accepted-answer variants and culturally natural phrasing to reduce false negatives
- [x] Exercise variety improvements (`server/src/data/sessionGenerator.ts`, `server/src/data/practicePool.ts`):
  - rebalance question-type rotation to avoid repeated patterns in a single session
  - diversify distractor construction by error type (word-order, tense, lexical confusion, formality/register)
  - add rule-based templates for objective-specific generation (e.g., pronouns, agreement, verb forms)
- [x] Difficulty and unlock pacing tuning (`server/src/data/sessionGenerator.ts`, progression rules in `server/src/db.ts`):
  - tune adaptation weights so difficulty shifts are smoother between sessions
  - adjust unlock thresholds with guardrails to prevent early lockouts and late stagnation
  - validate with progression simulations and edge-case tests (high reveal usage, low streak learners, fast improvers)
- [x] Category-specific mistake patterns and hints (`server/content/languages/*.json` + session evaluation paths):
  - map each category/objective to likely mistake families and attach targeted hints/remediation prompts
  - prioritize hints that coach thought process, not just answer reveal
  - add remediation loops in follow-up sessions for repeated error types
- [x] Daily challenge freshness and curation (`/api/session/daily` generation path):
  - preserve deterministic per-day behavior while increasing intra-week variety
  - add weighted objective rotation so daily challenges cover breadth over 7-day windows
  - include one "stretch" item and one "confidence" item per challenge where possible
- [x] Verification and rollout for all content updates:
  - add/update tests for generation balance, difficulty adaptation, and daily challenge coverage
  - run `npm run test --prefix server` and manual session spot checks across at least 3 languages
  - ship in small batches with changelog notes and quick post-release metric review

## Completed archive

### Phase 1: Reliability and anti-trivial-cheat

- [x] Move final scoring authority to server:
  - create server-side session records (`sessionId` + question IDs + expected answers)
  - validate submitted answers server-side on completion
- [x] Add request validation at `/api/session/complete`:
  - reject invalid ranges (`score < 0`, `maxScore <= 0`, `score > maxScore`)
  - normalize and clamp numeric fields
- [x] Add basic anti-tamper checks:
  - ensure `difficultyLevel` and category match started session
  - prevent completion of unknown/expired session IDs

### Phase 2: Automated tests

- [x] Add backend test setup under `server/src/__tests__/`.
- [x] Unit tests for:
  - XP calculation behavior and penalty handling
  - mastery updates and level unlock thresholds
  - session completion validation edge cases
  - session generation level adaptation boundaries
- [x] Integration tests for:
  - `/api/session/start` -> `/api/session/complete` happy path
  - invalid completion payloads

### Phase 3: Better learning depth

- [x] Add per-item progress model (`item_progress`) for retention:
  - `item_id`, `ease`, `last_seen`, `next_due`, `streak`, `error_count`
- [x] Introduce spaced repetition scheduling in session generation.
- [x] Track error types (word order, grammar agreement, tense, vocabulary confusion).
- [x] Improve answer checking:
  - normalized punctuation/casing handling
  - support for accepted answer variants where appropriate
- [x] Improve distractor generation quality:
  - same grammar pattern / semantic neighborhood distractors

### Phase 4: Learning experience expansion

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

### Phase 5: Multi-user foundation

- [x] Add `users` table and authentication endpoints (register/login/me).
- [x] Add `user_id` ownership to learner data tables and queries.
- [x] Derive user identity server-side from auth token/session (never trust client-sent user id).
- [x] Migrate existing single-user data into a default user safely.

### Phase 6: Frontend architecture and test coverage

- [x] Refactor `client/src/App.jsx` into smaller components/hooks.
- [x] Add frontend tests under `client/src/__tests__/`:
  - session flow (submit/retry/reveal/resume)
  - setup save/reset behavior
  - stats rendering with API fixtures

### Phase 6 extension: TypeScript client architecture

- [x] Convert page-level client components to `.tsx` modules:
  - `LearnPage`
  - `PracticePage`
  - `SetupPage`
  - `StatsPage`
  - `ContributePage`
  - `ContributionPanel`
- [x] Convert `SessionPlayer` and extracted session modules to TypeScript:
  - `SessionPlayer.tsx`
  - `SessionPanels.tsx`
  - `sessionHelpers.ts`
- [x] Extract `SessionPlayer` cross-cutting concerns into hooks:
  - `useSessionSpeech`
  - `useSessionSnapshot`
  - `useSessionEngine`
- [x] Extract app-shell concerns into hooks:
  - `useThemeMode`
  - `useAppNavigation`
  - `useCourseSessionState`
  - `useAuthenticatedAppData`
- [x] Add focused client tests for:
  - session normalization
  - navigation hook behavior
  - stored session persistence behavior
- [x] Verify the migrated client with:
  - `npx tsc --noEmit -p client/tsconfig.json`
  - `npm run test --prefix client`
  - `npm run build --prefix client`

### Phase 6 follow-up: Deployable auth UX

- [x] Add dedicated frontend login and registration pages.
- [x] Add token persistence and authenticated API calls in client.
- [x] Add optional Google sign-in path (`/api/auth/google` + Google Identity button).
- [x] Add sign-out flow and auth-gated app bootstrap.
- [x] Require email verification for email/password registration before login.

