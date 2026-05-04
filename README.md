# LingoFlow

A focused language learning app built with React + Express. Adaptive CEFR progression, persistent learner data, and a variety of exercise types across five languages.

## Features

### Learning

- 15 course categories: Essentials, Conversation, Travel, Work, Health, Family & Friends, Food & Cooking, Grammar, Hobbies & Leisure, Sports & Fitness, News & Media, Money & Finance, Science & Technology, Culture & History, Nature & Animals
- CEFR-based adaptive progression (A1 → B2) — category levels unlock based on mastery
- 5 languages: English, Spanish, Russian, Italian, Swedish
- Daily challenge sessions — one fresh cross-category session per day
- Post-session mistake review — optional mini-session drilled from session errors
- Session autosave and resume — in-progress sessions survive page refresh or tab close
- Per-language course switching — independent progress tracked per language

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
```

---

## Available Scripts

```bash
npm run install:all     # Install all workspace dependencies
npm run dev             # Start server (:4000) + client (:5173) concurrently
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
| `POST` | `/api/community/contribute` | Submit a community exercise |
| `GET` | `/api/community/contributions` | List contributions (own or all) |
| `PATCH` | `/api/community/contributions/:id` | Update moderation status |

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
