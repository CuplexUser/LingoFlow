# LingoFlow Completed Work Archive

Historical record of finished roadmap items, moved out of `TODO.md` to keep the
active roadmap focused on pending work. Phase numbers are preserved from the
original roadmap.

---

## Phase 13: Content file restructuring — completed steps

**Step 1 — Restructure content files** (directory-per-language, file-per-category)

- [x] Create a migration script that splits each `<language>.json` into the new structure.
- [x] Update `contentLoader.ts` to scan language directories, load `_meta.json` + category files,
      and merge them into the same in-memory shape the rest of the server expects.
- [x] Keep validation (duplicate IDs, unknown categories, required fields) working across split files.
- [x] Verify with `npm run test --prefix server` and a manual spot-check.
- [x] Delete the old monolithic JSON files after migration passes.

**Step 2 — Content fill progress snapshot (2026-04-24)**

- English `work` expanded to 20 per level (A1/A2/B1/B2).
- English `essentials` expanded to A2=20 and B1=20.
- English sparse categories expanded:
  `hobbies_leisure`, `sports_fitness`, `news_media`, `money_finance`,
  `science_technology`, `culture_history`, `nature_animals` now at A1=20, A2=20, B1=20, B2=18.
- English core categories expanded:
  `conversation` now at 20 per level, `travel` now at A1=20/A2=20/B1=20/B2=19,
  and `health`, `family_friends`, `food_cooking`, `grammar` now at A1=20, A2=20, B1=20, B2=18.
- Russian expansion completed across all categories:
  every Russian category now has A1=20, A2=20, B1=20, B2=20.

**Step 3 — Add new languages**

- [x] Add French as a selectable course language with split category content files.
- [x] Add an interactive TypeScript LibreTranslate script for creating new language category files from English.
- [x] Split `practice-words.json` into per-language files under `server/content/practice_words/` and add a `_template.json` English source list.
- [x] Extend the LibreTranslate wizard to generate practice word pools from the template, with batched API calls.
- [x] Generate the French and German practice word pools from the template (`npm run translate:language`).
- [x] Evaluate adding German and French based on user demand.

---

## Phase 14: Moderation UI for community contributions ✓ COMPLETE

**Step 1 — Moderation inbox page**

- [x] Build a `ModerationPage` (or extend `ContributionInbox`) with:
  - filterable list by status (`pending`, `approved`, `rejected`), language, and category
  - exercise preview card showing prompt, answer, hints, and metadata
  - approve / reject / request-changes actions with optional reviewer comment
  - batch selection for bulk approve/reject
- [x] Gate the page behind a moderator role check (use existing `CONTRIBUTION_REVIEWER_EMAILS`).

**Step 2 — Review workflow**

- [x] Add `reviewer_comment` and `reviewed_by` columns to `contributions` table if missing.
- [x] On approve: inject the exercise into the in-memory content pool immediately; approved exercises also loaded at server startup.
- [x] On reject: send feedback to the contributor (visible on their ContributePage).
- [x] Add notification badge on nav when pending contributions exist (moderators only).

**Step 3 — Contributor feedback loop**

- [x] Show submission status (pending / approved / rejected / changes requested) on ContributePage.
- [x] Display reviewer comments inline so contributors can iterate.

---

## Phase 15: App.tsx refactor ✓ COMPLETE

**Step 1 — Extract context providers**

- [x] `AuthContext` — token, user, login/logout/register actions.
- [x] `CourseContext` — languages, progress, stats, active language/category (wraps `useAuthenticatedAppData`).
- [x] `NavigationContext` — wrap `useAppNavigation` so any component can navigate without prop drilling.
- [x] `SessionContext` — active session state, wrapping `useCourseSessionState`.

**Step 2 — Extract page orchestration**

- [x] Move the page-switch logic into a `<PageRouter>` component that reads from `NavigationContext`.
- [x] Each page receives only the props it needs from context, not everything from App.
- [x] App.tsx becomes a thin shell: providers → PageRouter → pages.
- [x] `AppShell` handles layout (topbar, nav, status banners, share card).
- [x] `AppProvider` holds all state/logic and distributes into the 4 contexts.

**Step 3 — Verify**

- [x] `npm run build --prefix client` passes.
- [x] `npm run test --prefix client` passes (35/35).
- [x] Manual smoke test: login → learn → session → stats → setup → contribute → bookmarks.

---

## Phase 16: Test coverage expansion — completed step

**Step 1 — Server test gaps**

- [x] Auth routes: register (validation, duplicate email), login (wrong password, unverified),
      Google OAuth callback, email verification, password reset flow.
- [x] User routes: GET/PUT settings, GET progress, GET progress-overview, GET stats.
- [x] Bookmark routes: POST bookmark, GET bookmarks, DELETE bookmark.
- [x] Community routes: POST contribution, GET contributions (contributor vs moderator view),
      PATCH contribution status.
- [x] Course routes: GET /api/course, GET /api/languages.
- [x] Edge cases: expired JWT, malformed tokens, rate limit enforcement.

---

## Phase 17: Engagement features — completed step

**Step 1 — Achievement system** ✓ COMPLETE

- [x] `achievements` table: `id`, `user_id`, `achievement_id`, `earned_at`, `metadata_json`.
- [x] Define achievement types:
  - Streak milestones (3-day, 7-day, 30-day, 100-day)
  - XP milestones (100, 500, 1000, 5000 XP)
  - Category mastery (complete a category at 80%+)
  - Completionist (all categories in a language at 50%+)
  - Polyglot (practice 2+ languages)
  - Speed demon (10 correct in a row with no hints)
  - Night owl / early bird (practice at unusual hours)
- [x] Achievement check runs at session completion; newly earned ones show as a toast/modal.
- [x] Achievements page or section in StatsPage displaying earned badges with dates.

**Speed Match mini-game** ✓ SHIPPED (per-language highscore, Practice tab) — open follow-ups remain in `TODO.md`.

---

## Phase 7: Integrity, operations, and scale ✓ COMPLETE

- [x] Prevent score inflation via duplicate `questionId` submissions.
- [x] Wrap session completion writes in a DB transaction (atomic completion).
- [x] Replace hardcoded frontend API base URL with environment configuration.
- [x] Add rate limiting for auth and session endpoints.
- [x] Add SQLite indexes for stats/history query paths.
- [x] Add structured request/error logging and basic health diagnostics.

---

## Phase 10: Session UX and retention polish ✓ COMPLETE

- [x] Post-session mistake drill from attempt logs ("Review mistakes" mini-session).
- [x] Stats visuals with bars and a 14-day XP trend graph from `daily_xp`.
- [x] Refine stats visuals to match template blocks (KPI cards, chart titles, error pills, language rows) and ensure chart theming stays correct across dark/light toggles.
- [x] Add focused Russian `ты` vs `вы` exercises.
- [x] Session-player keyboard shortcuts (`1-4` select option, `Enter` submit).
- [x] Daily challenge endpoint with deterministic same-per-language/per-day sessions.
- [x] React error boundary around `SessionPlayer` with friendly fallback.
- [x] Session summary share card with copyable one-line result.

---

## Phase 12: Engagement, quality, and UX polish ✓ COMPLETE

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

---

## Phase 8: Quality tooling and maintainability ✓ COMPLETE

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

---

## Phase 9: Content breadth and richer lesson formats — completed items

- [x] Add new course categories: `Hobbies & Leisure`, `Science & Technology`, `Culture & History`, `Environment & Sustainability`.
- [x] Seed starter JSON batches with richer exercise fields:
  `prompt`, `correctAnswer`, `hints`, `difficulty`, optional `audioUrl`, `imageUrl`, `culturalNote`, `exerciseType`.
- [x] Add culture-aware starter content, including Swedish `fika` notes.
- [x] Extend session rendering for richer lesson types: flashcards, matching, pronunciation capture, image display, Web Audio playback for referenced clips.
- [x] Add a learner beta flag for experimental lessons.
- [x] Add a community exercise contribution route and frontend submission form.
- [x] Track per-exercise usage/completion data in the DB for iteration.
- [x] Surface recommendation data based on learner strengths and weak spots.
- [x] Add moderation review tooling for community exercises.

---

## Phase 11: Content quality and learning depth plan ✓ COMPLETE

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

---

## Phase 18: Story Reader (comprehensible input) — MVP shipped

A tap-to-translate reading mode that turns leveled short stories into a vocabulary
pipeline feeding the spaced-repetition system.

**Done**
- [x] Story content type loaded through a validated pipeline (`server/src/data/storyLoader.ts`,
  `server/content/stories/<language>.json`), mirroring the `practice_words/` per-language convention.
  Startup validation enforces unique ids, required fields, CEFR level, glossary `{g,pos,note?}`,
  and cultural note. Seeded with three stories each (A1 morning, A2 market, B1 letter) for all six
  learnable languages: Russian, Spanish, Italian, Swedish, French, German.
- [x] Read endpoints: `GET /api/stories` (filter by language/level/category) and `GET /api/stories/:id`,
  auth-gated alongside other content routes.
- [x] Gloss resolution reuses the existing three-tier system: curated story glossary (tier 1) +
  the `/api/dictionary/batch` cache→LibreTranslate fallback (tiers 2–3), pre-fetched on story open
  exactly like reverse-translation/cloze tooltips.
- [x] Save-to-review: `saved_words` table + idempotent `item_progress` row (fresh `next_due`, no
  reschedule on re-save). Saved words are injected into the per-user practice pool so they resurface
  in practice/speak/listen sessions. `POST/GET/DELETE /api/saved-words`.
- [x] Client `StoryPage.tsx` + `styles/story.css` (theme tokens, no injected `<style>`/font `@import`),
  registered as the **Read** nav tab. Serif reading body, two-tier underline, amber "saved" signal,
  bottom lookup drawer, sentence audio (browser TTS), Show/Hide English, cultural note, counters,
  Finish summary. A11y: focusable word buttons, focus rings, Escape closes the drawer, `aria-live`,
  reduced-motion. Reading grants **no XP**.
- [x] Tests: story loader (+ bad-fixture cases), list/fetch routes, save idempotency; client tokenizer
  edge cases (`«Сколько`, `яблоки?»`, hyphenated compounds, em dash) and drawer/save/English/level UI.

### Phase 18.1: Longer content, progressive library & translation pipeline — shipped

Expands the MVP from one short story per level to a multi-story library that tracks progress, with
a tooling path to scale authored content across languages.

**Done**
- [x] **Progressive library + completion tracking.** New `story_completions` table
  (`UNIQUE(user_id, story_id)`) with `markStoryComplete` / `getCompletedStoryIds` in `db.ts`.
  `POST /api/stories/:id/complete` records a finish; `GET /api/stories` is now user-aware and returns
  a `completed` flag per summary. "Finish story" calls the endpoint and the modal offers **Read next**
  (the next unread story, lowest level first).
- [x] **Client `StoryPage.tsx`** rebuilt around a two-tier selector: level tabs (A1/A2/B1) drive a
  per-level story list (`sr-library`) showing each story's title + a completed check. On load it
  defaults to the first unread story; completed stories persist across reloads.
- [x] **Longer stories with paragraph breaks.** `storyLoader.ts` accepts an optional `break` flag per
  sentence (rendered as a paragraph gap) and treats glossary `pos` as optional. English + Russian
  authored as the reference set: six stories each (Daily life, Family, Market, Weekend, Travel letter,
  First day at work) at ~10–20 sentences with full grammar-aware glossaries.
- [x] **English as dual-purpose source.** `server/content/stories/english.json` ships as the
  English-course story set and is the canonical translation source.
- [x] **LibreTranslate Stories job.** `scripts/libretranslate` gained a "Stories" content type:
  forward (English → target) for sentences/titles plus a reverse (target → English) glossary pass
  (`translateStories` in `content-generator.ts`). Generated glossaries borrow `pos` (and exact-match
  `note`) from the English source glossary, and are written in the compact one-line-per-entry layout of
  the hand-authored files. Never overwrites existing files.
- [x] **Per-culture localization.** `scripts/libretranslate/story-localization.json` swaps
  culturally-specific terms (place names, currency) and overrides the cultural note per target culture,
  so each language gets a native setting (the B1 letter is set in Barcelona/Paris/Berlin/Rome/Stockholm,
  not London) instead of carrying English proper nouns straight through MT. The native spelling is fed
  to MT and shielded from the glossary; the English exonym is kept as the reference.
- [x] Tests: completion endpoint (idempotent, per-user, 404), loader `break`/optional-`pos`, updated
  content-stats counts; client Finish→complete + Read next flow.

---

## Phase 1: Reliability and anti-trivial-cheat ✓ COMPLETE

- [x] Move final scoring authority to server:
  - create server-side session records (`sessionId` + question IDs + expected answers)
  - validate submitted answers server-side on completion
- [x] Add request validation at `/api/session/complete`:
  - reject invalid ranges (`score < 0`, `maxScore <= 0`, `score > maxScore`)
  - normalize and clamp numeric fields
- [x] Add basic anti-tamper checks:
  - ensure `difficultyLevel` and category match started session
  - prevent completion of unknown/expired session IDs

---

## Phase 2: Automated tests ✓ COMPLETE

- [x] Add backend test setup under `server/src/__tests__/`.
- [x] Unit tests for:
  - XP calculation behavior and penalty handling
  - mastery updates and level unlock thresholds
  - session completion validation edge cases
  - session generation level adaptation boundaries
- [x] Integration tests for:
  - `/api/session/start` -> `/api/session/complete` happy path
  - invalid completion payloads

---

## Phase 3: Better learning depth ✓ COMPLETE

- [x] Add per-item progress model (`item_progress`) for retention:
  - `item_id`, `ease`, `last_seen`, `next_due`, `streak`, `error_count`
- [x] Introduce spaced repetition scheduling in session generation.
- [x] Track error types (word order, grammar agreement, tense, vocabulary confusion).
- [x] Improve answer checking:
  - normalized punctuation/casing handling
  - support for accepted answer variants where appropriate
- [x] Improve distractor generation quality:
  - same grammar pattern / semantic neighborhood distractors

---

## Phase 4: Learning experience expansion ✓ COMPLETE

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

---

## Product metrics follow-up ✓ COMPLETE

- [x] Replace daily progress from lifetime XP with true "XP earned today".
- [x] Add per-day XP table and daily aggregation API.

---

## Phase 5: Multi-user foundation ✓ COMPLETE

- [x] Add `users` table and authentication endpoints (register/login/me).
- [x] Add `user_id` ownership to learner data tables and queries.
- [x] Derive user identity server-side from auth token/session (never trust client-sent user id).
- [x] Migrate existing single-user data into a default user safely.

---

## Phase 6: Frontend architecture and test coverage ✓ COMPLETE

- [x] Refactor `client/src/App.jsx` into smaller components/hooks.
- [x] Add frontend tests under `client/src/__tests__/`:
  - session flow (submit/retry/reveal/resume)
  - setup save/reset behavior
  - stats rendering with API fixtures

### Phase 6 extension: TypeScript client architecture

- [x] Convert page-level client components to `.tsx` modules:
  `LearnPage`, `PracticePage`, `SetupPage`, `StatsPage`, `ContributePage`, `ContributionPanel`.
- [x] Convert `SessionPlayer` and extracted session modules to TypeScript:
  `SessionPlayer.tsx`, `SessionPanels.tsx`, `sessionHelpers.ts`.
- [x] Extract `SessionPlayer` cross-cutting concerns into hooks:
  `useSessionSpeech`, `useSessionSnapshot`, `useSessionEngine`.
- [x] Extract app-shell concerns into hooks:
  `useThemeMode`, `useAppNavigation`, `useCourseSessionState`, `useAuthenticatedAppData`.
- [x] Add focused client tests for: session normalization, navigation hook behavior, stored session persistence behavior.
- [x] Verify the migrated client with:
  `npx tsc --noEmit -p client/tsconfig.json`, `npm run test --prefix client`, `npm run build --prefix client`.

### Phase 6 follow-up: Deployable auth UX

- [x] Add dedicated frontend login and registration pages.
- [x] Add token persistence and authenticated API calls in client.
- [x] Add optional Google sign-in path (`/api/auth/google` + Google Identity button).
- [x] Add sign-out flow and auth-gated app bootstrap.
- [x] Require email verification for email/password registration before login.
