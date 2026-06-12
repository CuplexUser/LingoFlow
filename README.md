# LingoFlow

A focused language learning app built with React + Express. Adaptive CEFR progression, persistent learner data, and a variety of exercise types across six languages.

## Features

### Learning

- 15 course categories: Essentials, Conversation, Travel, Work, Health, Family & Friends, Food & Cooking, Grammar, Hobbies & Leisure, Sports & Fitness, News & Media, Money & Finance, Science & Technology, Culture & History, Nature & Animals
- CEFR-based adaptive progression (A1 → B2) — category levels unlock based on mastery
- 7 languages: English, Spanish, Russian, Italian, Swedish, French, German
- Daily challenge sessions — one fresh cross-category session per day
- Post-session mistake review — optional mini-session drilled from session errors
- Session autosave and resume — in-progress sessions survive page refresh or tab close
- Per-language course switching — independent progress tracked per language
- **Story Reader** (Read tab) — comprehensible-input reading mode with a leveled story library (A1–B2). Each level offers several stories; level tabs drive a per-level list that marks finished stories and opens to the first unread one. Tap any word for a bottom lookup drawer (gloss, part of speech, optional grammar note, listen button) backed by the same three-tier word system as exercise tooltips. Glossary words get a solid accent underline, grammar-hint words a dotted underline. Stories run from short A1 pieces to multi-paragraph B1 reads, with sentence-level audio, a Show/Hide English toggle, an inline cultural note, and looked-up/saved counters. "Finish story" records completion and suggests the next unread story; "Save to review" persists unknown words so they resurface in practice sessions via spaced repetition. Reading grants no XP (anti-score-inflation).

### Exercise Types

- **Translation** — auto-rotated through multiple-choice, sentence-builder, cloze, dictation, and dialogue variants
- **Flashcard** — flip-to-reveal with "I knew this" / "Need review" buttons
- **Sentence builder** — drag tokens into order with progressive hints (audio → token pulse)
- **Cloze deletion** — fill the gap from multiple choice options
- **Dictation** — typed transcription of a spoken sentence
- **Matching** — pair prompts to answers
- **Pronunciation** — Web Speech API recognition, accepts ≥ 90% similarity
- **Roleplay** — guided dialogue completion
- **Practice modes** — dedicated speaking, listening, word-matching, and previous-mistakes drill sessions; the mistakes mode pulls the worst-performing items across all categories, ranked by error count then accuracy

### Word Hints & Tooltips

Hover over any word in a reverse-translation exercise (translating to English) or in a cloze sentence to see a tooltip. Three sources are checked in priority order:

1. **Grammar hints** (dotted underline, dark tooltip) — words matched by the `'word' = meaning` pattern in the exercise `hints` array.
2. **Glossary translations** (solid accent underline, accent tooltip) — words covered by the optional `wordGlossary` field on the exercise.
3. **Auto-fetched translations** (same accent style) — for any word not covered by the above, the client pre-fetches a translation from the server when the exercise loads. The server checks the `word_translations` SQLite cache first (populated at startup from the content files), then calls a self-hosted [LibreTranslate](https://libretranslate.com) instance. Each unique word is looked up at most once and cached permanently.

At server startup, the `word_translations` table is wiped and rebuilt from authoritative content sources: `wordGlossary` fields, `"Vocabulary: X"` flashcard pairs, and single-word hint patterns. This ensures known exercise vocabulary is always translated correctly without any API call.

Set `LIBRETRANSLATE_URL` and `LIBRETRANSLATE_API_KEY` in `server/.env` to enable the API fallback. Self-hosting with Docker:

```bash
# Start a LibreTranslate instance with API key support
docker run -it -p 5000:5000 libretranslate/libretranslate --api-keys
# Generate a key (in a second terminal)
docker exec <container-id> ltmanage keys add
```

Fetched translations are validated before caching: punctuation-only responses and strings identical to the source word are discarded. Translations are normalised — trailing punctuation stripped, ALL-CAPS lowercased, first character lowercased.

The repo also includes an interactive TypeScript utility for generating new language content from English via LibreTranslate:

```bash
npm run translate:language
```

The tool reads `server/.env`, lets you select a supported target language and category files, rate-limits API calls if needed, and writes only new files under `server/content/languages/<language>/`. It never overwrites existing category files.

The wizard first asks **what to generate** — course categories, the **practice word** pool, or **Story Reader stories**. Choosing practice words translates the English word list in `server/content/practice_words/_template.json` into the target language, writing `server/content/practice_words/<language>.json`. Translations are batched (`TRANSLATE_BATCH_SIZE` words per request), so a ~1000-word pool costs roughly 20 API calls rather than one per word.

Choosing **Stories** reads the hand-authored `server/content/stories/english.json`, translates each sentence and title English → target, then runs a reverse target → English pass to build a per-word glossary. Each glossary entry borrows its part-of-speech (and an exact-match grammar note) from the English source glossary, and the file is written in the same compact one-line-per-entry layout as the hand-authored stories. Output goes to `server/content/stories/<language>.json`. As with all jobs it never overwrites an existing file, so delete a language's existing story file first if you want to regenerate it from the longer English source.

To stop MT from carrying English proper nouns straight through (e.g. a Spanish story still set in London), `scripts/libretranslate/story-localization.json` provides per-culture overrides keyed by source story id. `terms` swap culturally-specific words — place names and currency — so each language gets a native setting (the B1 letter becomes Barcelona / Paris / Berlin / Rome / Stockholm), and `culturalNote` replaces the explanatory note with one describing the target culture. The native spelling (e.g. `Roma`) is fed to MT and kept out of the glossary, while the English exonym (`Rome`) is shown as the reference; anything omitted from the map falls back to the English source.

The generator code is split for clarity under `scripts/libretranslate/`: `terminal-menu.ts` (generic interactive prompts), `content-generator.ts` (translation + JSON file IO), and `index.ts` (the wizard that wires them together).

**Content authors** can add curated per-word translations to any exercise via a `wordGlossary` object:

```json
{
  "id": "ru-gr-a1-s02",
  "correctAnswer": "Вчера я занимался два часа.",
  "hints": ["'Вчера' = yesterday; leads the sentence naturally."],
  "wordGlossary": {
    "вчера": "yesterday",
    "я": "I",
    "занимался": "studied / was studying",
    "два": "two",
    "часа": "hours (gen. sg.)"
  }
}
```

Keys are lowercased word forms exactly as they appear in `correctAnswer`; values are short English glosses. The field is optional and validated at server startup.

### Session Experience

- Live XP tally updates per correct answer during a session
- Correct-answer flash (900 ms green banner) before auto-advance
- Keyboard shortcuts: `1`–`4` select a multiple-choice option, `Enter` submits
- Hint system with audio playback for build-sentence exercises
- Reveal answer flow for when the learner is stuck
- Session share card — one-line summary shareable to X, WhatsApp, Facebook, Telegram, or native share sheet

### Progress & Stats

- XP, streak, learner level, and category mastery persisted per user per language
- Stats dashboard: completion %, accuracy %, streak, mastered category count
- 6-month activity grid (GitHub-style heatmap), XP trend chart, session bar chart
- Category mastery rail, error type breakdown donut, weakest objectives list
- Daily streak badge with "streak at risk" warning when no practice has been logged today
- Bookmarks — save any exercise for review; bookmarks page with text-to-speech playback and speed control

### Community Contributions

- Any signed-in user can submit a new exercise for a language/category
- Submissions enter a moderation queue (pending → approved/rejected)
- Approved contributions can appear in sessions

### Admin Panel

Visible only to the first registered user and anyone listed in `CONTRIBUTION_REVIEWER_EMAILS`.

- **Content coverage page** — KPI cards (total exercises, avg per cell, fill status), stacked CEFR bar chart per language, horizontal category fill chart with target line, gap distribution donut, and a color-coded grid table (red = any level < 5, amber = any level < 10, green = all ≥ 10). Individual level counts inside each cell are colored to pinpoint which level is the gap.

### Auth

- Email/password registration with email verification
- Google OAuth2 sign-in
- Forgot password / reset password flow
- Account deletion (password confirmation + explicit irreversible-action flag required; local accounts only)

### UI

- Light / dark theme switcher (persisted)
- Responsive layout

---

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite, TypeScript          |
| Backend  | Express, TypeScript (strip-types)   |
| Database | SQLite via `better-sqlite3`         |
| Auth     | JWT (30-day TTL), bcrypt, Google OAuth2 |
| Charts   | Hand-rolled SVG — no chart library  |
| Tests    | Vitest (client), Node test runner (server) |

---

## Quick Start

```bash
npm install
npm run install:all
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

---

## Environment Variables

Create `server/.env` (copy `server/.env.example`) for local development.

| Variable | Side | Description |
|----------|------|-------------|
| `LINGOFLOW_AUTH_SECRET` | server | JWT signing secret — change in production |
| `GOOGLE_OAUTH_CLIENT_ID` | server | Google OAuth2 web client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | server | Google OAuth2 web client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | server | Callback URL registered in Google console (default: `http://localhost:4000/api/auth/google/callback`) |
| `PUBLIC_APP_URL` | server | Base URL used in verification/reset emails (e.g. `https://app.example.com`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | server | SMTP delivery for transactional emails |
| `CONTRIBUTION_REVIEWER_EMAILS` | server | Comma-separated moderator email list |
| `LOG_LEVEL` | server | `debug` \| `info` \| `warn` \| `error` (default: `info`) |
| `VITE_API_BASE` | client | API base path/URL (default: `/api`) |

**Admin access:** the first registered user (id = 1) is automatically an admin. Additional admins are granted via `CONTRIBUTION_REVIEWER_EMAILS`.

---

## Production Build

```bash
npm run build   # bundles client into server/dist/client
npm run start   # serves everything from http://localhost:4000
```

Or build the server bundle separately:

```bash
npm run build --prefix server    # typecheck + minified bundle → server/dist/index.js
npm run start:dist --prefix server
```

---

## Server deployment

Do **not** run `npm update` on the server — that resolves to newer versions and rewrites the lockfile, which is non-reproducible. Update dependencies locally, commit the lockfiles, then install from them on the server with `npm ci` (a clean, reproducible install that fails if `package.json` and the lockfile disagree).

```bash
git pull
npm ci && npm ci --prefix server && npm ci --prefix client
npm run build          # bundles client into server/dist/client
# then restart the service (pm2 / systemd / etc.)
```

If you build the artifacts in CI and ship `dist/` to the server, the runtime box only needs production server deps and can skip the client install:

```bash
npm ci --omit=dev --prefix server
```

Otherwise keep dev dependencies — the build tools (`vite`, `esbuild`, `tsc`) live under `devDependencies`.

**Native modules:** never copy `node_modules` from another machine. `better-sqlite3` is a native module whose binary is platform- and ABI-specific; `npm ci` fetches the correct prebuilt binary for the server's OS and Node version. The lockfile itself is platform-neutral. The Node version must be one with a published `better-sqlite3` prebuild (any current LTS) — otherwise the install falls back to compiling from source and needs a C/C++ toolchain.

---

## Project Structure

```
client/
  src/
    App.tsx               # App shell — owns all top-level state
    api.ts                # Typed HTTP client
    constants.ts          # Page paths, defaults
    styles.css            # All app styles (no CSS-in-JS)
    components/
      AdminPage.tsx        # Admin wrapper page (coverage + future sections)
      AuthPage.tsx
      BookmarksPage.tsx
      ContentStatsPage.tsx # Content coverage charts and grid
      ContributePage.tsx
      LearnPage.tsx
      PracticePage.tsx
      SessionPlayer.tsx
      SetupPage.tsx
      StatsPage.tsx
      session/             # Session engine, speech, snapshot hooks
    hooks/                 # useAppNavigation, useAuthenticatedAppData, etc.
    types/                 # course.ts, session.ts, contribution.ts
    utils/                 # theme / path helpers
    __tests__/             # Vitest + Testing Library

server/
  src/
    index.ts              # Express setup + route registration + answer evaluation
    db.ts                 # SQLite schema, migrations, all queries
    data.ts               # Content + session logic entrypoint
    data/
      contentLoader.ts    # Loads JSON files from content/languages/
      sessionGenerator.ts # Question set builder (difficulty, spaced repetition)
      constants.ts        # Categories, CEFR levels, XP multipliers
    routes/
      authRoutes.ts
      courseRoutes.ts     # Course catalog + admin content-stats endpoint
      sessionRoutes.ts
      userRoutes.ts
    auth/
      tokenService.ts
      password.ts
    __tests__/            # Node test runner integration tests
  content/
    languages/            # Per-language JSON exercise files
      english/
      spanish/
      russian/
      italian/
      swedish/
      french/
      german/
    practice_words/       # Per-language practice word pools (+ _template.json)
      _template.json      # Canonical English word list (translation source)
      english.json
      spanish.json
      ...
```

---

## Available Scripts

```bash
npm run install:all     # Install all workspace dependencies
npm run dev             # Start server (:4000) + client (:5173) concurrently
npm run translate:language # Interactive LibreTranslate content generator
npm run build           # Production client bundle
npm run start           # Serve backend + built frontend
npm run lint            # ESLint (flat config)
npm run lint:fix        # Auto-fix lint issues
npm run format          # Prettier
npm run format:check    # Verify formatting without writing
npm run test            # Full test suite (server + client)
npm run verify          # Lint + client tests
```

---

## API Reference

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/verify-email` | Verify email token |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `POST` | `/api/auth/forgot-password` | Request password reset link |
| `POST` | `/api/auth/reset-password` | Apply password reset |
| `GET` | `/api/auth/google/start` | Begin Google OAuth2 flow |
| `GET` | `/api/auth/google/callback` | Google OAuth2 callback |
| `GET` | `/api/languages` | List available course languages |
| `POST` | `/api/visitors/login` | Track login page visit (telemetry) |

### Authenticated (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/me` | Current user info |
| `POST` | `/api/auth/delete-account` | Delete account (local auth only) |
| `GET` | `/api/course?language=<id>` | Course catalog with progress |
| `GET` | `/api/content/metrics?language=<id>` | Level coverage metrics |
| `POST` | `/api/session/start` | Start a new session; pass `mode: "mistakes"` and `category: "__mistakes__"` for a cross-category mistake review |
| `POST` | `/api/session/daily` | Start the daily challenge |
| `POST` | `/api/session/complete` | Submit session results |
| `GET` | `/api/settings` | Get learner settings |
| `PUT` | `/api/settings` | Save learner settings |
| `GET` | `/api/progress?language=<id>` | Learner progress for a language |
| `GET` | `/api/progress-overview` | Progress summary across all languages |
| `GET` | `/api/stats?language=<id>` | Stats dashboard data |
| `GET` | `/api/bookmarks?language=<id>` | List bookmarks |
| `POST` | `/api/bookmarks` | Add a bookmark |
| `DELETE` | `/api/bookmarks/:questionId` | Remove a bookmark |
| `GET` | `/api/stories?language=<id>&level=<lvl>&category=<cat>` | List story summaries (filterable) |
| `GET` | `/api/stories/:id` | Fetch a full story (sentences, glossary, cultural note) |
| `POST` | `/api/stories/:id/complete` | Mark a story finished (idempotent, per user) |
| `GET` | `/api/saved-words?language=<id>` | List words saved from the Story Reader |
| `POST` | `/api/saved-words` | Save a word to review (idempotent; enters the SRS queue) |
| `DELETE` | `/api/saved-words/:word?language=<id>` | Remove a saved word |
| `POST` | `/api/community/contribute` | Submit a community exercise |
| `GET` | `/api/community/contributions` | List contributions (own or all) |
| `PATCH` | `/api/community/contributions/:id` | Update moderation status |
| `GET` | `/api/dictionary/batch?lang=<id>&words=<w1,w2>` | Batch word translations (SQLite-cached, LibreTranslate fallback) |

### Admin only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/visitors/stats` | Login page visit aggregate metrics |
| `GET` | `/api/admin/content-stats` | Exercise counts by language × category × CEFR level |

---

## Dev Unlock

In non-production builds a Setup toggle appears: **"Dev only: unlock all lessons"**. This bypasses the normal category unlock progression for the signed-in user. The server only honours this flag when `NODE_ENV !== "production"`.

---

## Troubleshooting

- `better-sqlite3` is a native module. Use Node LTS (20.x or 22.x). If install fails on Windows: update Node/npm, delete all `node_modules` folders, and reinstall.
- If the frontend loads but data is missing, confirm the backend is running on `:4000`.
- If `eslint .` behaves differently from `npm run lint`, a global ESLint install may be taking precedence — prefer `npx eslint .` or the npm script.
