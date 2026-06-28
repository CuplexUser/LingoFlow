# LingoFlow TODO and Roadmap

This file captures current product and technical priorities for future assignments.

## Scope decisions

- We are **not** aiming for a fully tamper-proof system.
- We **do** want to prevent trivial cheating and easy score inflation.
- Hearts are currently de-prioritized in the product experience.

## Current focus

Three priority tracks, ordered by priority:

1. **Content expansion** — fill every category × level to 20-50 exercises per language
2. **Test coverage** — close gaps in page components and E2E
3. **Engagement features** — leaderboards and weekly challenges

---

## Active roadmap

### Phase 13: Content expansion ★ PRIORITY 1

Target: 20-50 exercises per category × level × language across the six languages.

Coverage priorities (sparse categories first):
1. **English shortfalls** — add missing exercises to Essentials B2, Work A1/A2/B1, Essentials A2/B1.
2. **Newer categories** — `hobbies_leisure`, `sports_fitness`, `news_media`, `money_finance`,
   `science_technology`, `culture_history`, `nature_animals` — expand each to 15-20 per level with
   balanced exercise types.
3. **Established categories** — `essentials`, `conversation`, `travel`, `work`, `health`,
   `family_friends`, `food_cooking`, `grammar` — expand toward 20+ per level.
4. **Exercise type balance** — each category should mix recognition (MC, cloze), production
   (build_sentence, dictation), and recall (flashcard, matching) types.
5. **Cultural notes** — add `culturalNote` fields to at least 20% of exercises per language,
   especially in `culture_history`, `food_cooking`, and `conversation`.

Quality checklist per batch:
- [ ] CEFR level-appropriate vocabulary and grammar
- [ ] At least 2 accepted answer variants for production exercises
- [ ] Plausible distractors (same word class, similar length, common confusion pairs)
- [ ] Hints that coach the thought process, not just reveal the answer
- [ ] No duplicate `id` values across the language

### Phase 16: Test coverage expansion

Current coverage: ~40% server, ~20% client. Goal: 70%+ on both. (Server route gaps are closed.)

**Step 1 — Client test gaps**

- [ ] Page components: LearnPage renders categories, PracticePage mode selection,
      StatsPage chart rendering with mock data, SetupPage form save/reset.
- [ ] SessionPlayer: full exercise flows for each type (MC submit, build_sentence drag,
      cloze select, flashcard flip, matching pairs, pronunciation).
- [ ] Session lifecycle: start → answer → complete → mistake drill → share card.
- [ ] BookmarksPage: render bookmarks, delete, TTS playback trigger.
- [ ] Auth flow: login form validation, registration, logout clears state.

**Step 2 — E2E tests (stretch)**

- [ ] Evaluate Playwright or Cypress for critical user journeys:
  - register → verify → login → first session → complete → stats update
  - daily challenge → streak increment
  - contribute exercise → moderator approve

### Phase 17: Engagement features

**Step 1 — Leaderboards**

- [ ] `GET /api/leaderboard?period=daily|weekly|alltime&language=<id>`
- [ ] Leaderboard shows top 20 users by XP for the selected period.
- [ ] User's own rank always visible (even if outside top 20).
- [ ] Optional: opt-out for users who don't want to appear on leaderboards.
- [ ] Frontend: `LeaderboardPage` or panel on LearnPage with tabs for period selection.

**Step 2 — Weekly challenges**

- [ ] Server generates a weekly challenge each Monday (deterministic from week number):
  - "Earn 200 XP in Travel this week"
  - "Complete 5 sessions without using hints"
  - "Practice 3 different categories"
- [ ] `weekly_challenges` table tracking progress and completion.
- [ ] Challenge card on LearnPage with progress bar.
- [ ] Bonus XP reward on completion (50-100 XP).

**Step 3 — Social features (stretch)**

- [ ] Friend system: add friends by username, see their streaks/achievements.
- [ ] Challenge a friend: send a category/level challenge, compare scores.
- [ ] Activity feed: "Alex just completed a 7-day streak!" notifications.

**Step 4 — Speed Match follow-ups** (game shipped; these remain open)

- [ ] Award token XP for playing Speed Match (deferred from v1 to avoid score inflation; gate on a
      per-day cap if added).
- [ ] Optional: cross-user Speed Match leaderboard (current highscore is per-user, per-language only).

### Phase 9: Content breadth and richer lesson formats

- [ ] Expand each newer category (Hobbies & Leisure, Science & Technology, Culture & History,
      Environment & Sustainability) from the starter batch toward a 20-50 exercise target per level.
- [ ] Add sourced language-specific audio batches from providers such as Forvo or LibriVox.

### Phase 18: Story Reader (comprehensible input)

MVP shipped (tap-to-translate reading mode feeding the SRS). Remaining work:

- [ ] **Close the SRS loop on practice completion** — practice sessions (`practice_*` types) currently
  do not write `item_progress`, so a saved word's schedule advances only if it surfaces in a mistake
  review. Update `POST /api/session/complete` to record `item_progress` attempts for saved-word items
  (or add a dedicated saved-word review selection) so the spaced-repetition interval actually grows
  as the learner re-encounters the word.
- [ ] **Native/Forvo audio** — Story Reader uses browser `SpeechSynthesis` only; real recorded audio
  remains out of scope (shared with the audio TODO in Phase 9).
- [ ] **More stories per language** — English and Russian ship six longer stories each (2 per
  A1/A2/B1). Generate the remaining five languages from the English source via the LibreTranslate
  Stories job, then add a B2 tier.
- [ ] Optionally surface saved words directly in the mistake-review drill, and add a saved-words
  management view (reuse the Bookmarks page pattern).
- [ ] **Generate es/it/sv/fr/de stories** from the English source. Run
  `node --experimental-strip-types scripts/libretranslate/index.ts` → *Stories*, after deleting each
  language's existing short-seed `server/content/stories/<lang>.json`. Requires `LIBRETRANSLATE_URL` /
  `LIBRETRANSLATE_API_KEY` in `server/.env`. Spot-check and hand-fix any unresolved glosses.
- [ ] Optional: vocab-mastery–gated story ordering (the `story_completions` schema is compatible with
  layering this on later).
