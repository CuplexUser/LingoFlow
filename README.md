# LingoFlow

LingoFlow is a React + Express language training app inspired by Duolingo, with adaptive progression and persistent learner data using SQLite.

## Features

- Category-based learning path (`Essentials`, `Conversation`, `Travel`, `Work`, `Health`, `Family & Friends`, `Food & Cooking`, `Grammar`)
  plus optional experimental categories (`Hobbies & Leisure`, `Science & Technology`, `Culture & History`, `Environment & Sustainability`)
- Randomized challenge sessions per category
- Full-sentence practice (not only one-word answers)
- Sentence-builder exercises with correction feedback and reveal flow
- Expanded exercise types: flashcards, matching, cloze deletion, listen-and-build sentence, guided dialogue completion, pronunciation checks
- Pronunciation checks accept close matches (>= 90% similarity) instead of strict exact-match
- Adaptive CEFR-style progression (`A1` → `B2`) based on mastery
- Persistent progress (XP, streak, level, category mastery, daily XP, per-item progress) via `better-sqlite3`
- Multi-user account support with auth (`register`, `verify-email`, `login`, `google`, `me`) and user-scoped persistence
- Dedicated login/register UI with token-based session persistence and sign-out
- Setup page danger zone for account deletion (requires password + explicit irreversible-action confirmation)
- Multi-language course support per account with smooth in-app course switching
- Per-language session resume with autosaved session snapshots
- Learn home with a recommended next focus and expandable full catalog
- Practice modes for speaking, listening, and word-matching drills
- Practice sessions award fixed XP (Speak: 10, Listen: 10, Words: 5)
- Stats dashboard with completion, accuracy, weak-spot insights, and per-language rollups
- Theme switcher (auto/light/dark)
- Language options: `English`, `Spanish`, `Russian`, `Italian`, `Swedish`

## Tech Stack

- Frontend: React + Vite (`client/`)
- Backend: Express (`server/`)
- Database: SQLite via `better-sqlite3` (`server/data/lingoflow.db`)

## Quick Start

From the repository root:

```bash
npm install
npm run install:all
npm run dev
```

- Frontend dev URL: `http://localhost:5173`
- Backend API URL: `http://localhost:4000/api`

Optional environment variables:

- `VITE_API_BASE` (client): API base path/URL (default: `/api`).
- `GOOGLE_OAUTH_CLIENT_ID` (server): Google OAuth2 web client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET` (server): Google OAuth2 web client secret.
- `GOOGLE_OAUTH_REDIRECT_URI` (server): callback URL registered in Google console (default: `http://localhost:4000/api/auth/google/callback`).
- `LINGOFLOW_AUTH_SECRET` (server): auth token signing secret for production.
- `PUBLIC_APP_URL` (server): base URL used inside verification emails (e.g. `https://app.example.com`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` (server): SMTP delivery for confirmation emails.
- `CONTRIBUTION_REVIEWER_EMAILS` (server): comma-separated reviewer/admin email list for moderating community contribution submissions.
- `LOG_LEVEL` (server): `debug` | `info` | `warn` | `error` (default: `info`).

Create `server/.env` (copy from `server/.env.example`) to set server-side variables in local development.

Community contribution moderation notes:

- The first registered user is automatically treated as a reviewer/admin.
- Additional moderators can be granted access with `CONTRIBUTION_REVIEWER_EMAILS`.

## Dev Unlock

- In dev builds only, a Setup toggle appears: `Dev only: unlock all lessons (test user)`.
  - This forces all categories to be startable immediately for the signed-in user.
  - The server only honors this flag when `NODE_ENV !== "production"`.

## Production Build

```bash
npm run build
npm run start
```

Open `http://localhost:4000`.

### Server Build (Typecheck + Minified Bundle)

The backend can also be built as a bundled, minified Node.js artifact:

```bash
npm run build --prefix server
npm run start:dist --prefix server
```

## Project Structure

```text
client/
  src/App.tsx        # App shell + orchestration
  src/components/    # Learn/Practice/Setup/Stats/SessionPlayer components
                  # + AuthPage (login/register/google sign-in)
                  # + ContributePage and contribution flows
  src/__tests__/     # Frontend tests (Vitest + Testing Library)
  src/test/          # Test setup
  src/api.ts         # API client
  src/constants.ts   # Shared UI constants
  src/utils/         # Utilities (theme/path helpers)
  src/styles.css     # App styles
server/
  src/index.ts       # Express app setup + route registration
  src/routes/        # Route modules (auth/course/session/user)
  src/auth/          # Auth helpers (tokens/password hashing)
  dist/              # Bundled/minified server build output
  src/data.ts        # Data entrypoint that re-exports data helpers
  src/data/          # Content loading, session generation, constants
  src/db.ts          # SQLite schema, auth users, user-scoped persistence
  content/languages/ # Editable language content JSON files
  src/__tests__/     # Backend tests
  data/              # Runtime DB files
eslint.config.js     # Flat ESLint config for ESLint 10
.husky/pre-commit    # Lint + test checks before commit
```

## Available Scripts

- `npm run install:all`: install `server` and `client` dependencies
- `npm run dev`: run backend + frontend concurrently
- `npm run build`: build frontend bundle
- `npm run start`: serve backend and built frontend
- `npm run build --prefix server`: typecheck + build a minified server bundle to `server/dist/index.js`
- `npm run start:dist --prefix server`: run the bundled server build
- `npm run lint`: run ESLint from the root flat config
- `npm run lint:fix`: apply autofixable ESLint changes
- `npm run format`: format the repo with Prettier
- `npm run format:check`: verify formatting without writing files
- `npm run test:server`: run backend unit + integration tests
- `npm run test:client`: run frontend tests
- `npm run verify`: run the root verification script
- `npm run prepare`: install Husky hooks

## Completed Reliability Improvements

- Server-authoritative session completion and scoring (prevents trivial score tampering)
- Active session validation with expiry/completion checks
- Validation for unknown question IDs and invalid completion attempts
- Normalized answer checking and accepted-answer variant support
- Level-aware distractor selection and spaced-priority item selection
- Matching exercise generation now excludes roleplay/dialogue prompts from distractor pairs
- Daily XP aggregation (`todayXp`) and per-item retention tracking

## Testing

- Backend test suite location: `server/src/__tests__/`
- Frontend test suite location: `client/src/__tests__/`
- Root lint config: `eslint.config.js`
- Pre-commit hook: `.husky/pre-commit`
- Current coverage focus:
  - frontend session retry/reveal/resume behavior
  - frontend setup save/reset behavior
  - frontend stats rendering from API fixtures
  - session start/complete happy path
  - invalid/unknown completion payload rejection
  - answer normalization and sentence evaluation
  - XP penalty behavior
  - session generation exercise coverage
  - progression persistence updates (including daily XP and level-ups)

## Linting And Formatting

- The repo uses ESLint 10 with a flat config in `eslint.config.js`.
- React lint rules currently run through `@eslint/compat` because `eslint-plugin-react` has not fully published native ESLint 10 peer support yet.
- Use `npm run lint` from the repo root for the project-local toolchain.
- If you prefer direct invocation, `npx eslint .` uses the local version instead of a global install.
- Prettier settings live in the root `package.json`.
- Husky runs lint plus the server and client test suites on pre-commit.

## API Overview

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`
- `POST /api/auth/delete-account`
- `GET /api/auth/me`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/languages`
- `POST /api/visitors/login`
- `GET /api/course?language=<id>`
- `GET /api/content/metrics?language=<id>`
- `POST /api/session/start`
- `POST /api/session/daily`
- `POST /api/session/complete`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/progress?language=<id>`
- `GET /api/progress-overview`
- `GET /api/stats?language=<id>`
- `GET /api/visitors/stats`
- `POST /api/community/contribute`
- `GET /api/community/contributions`
- `PATCH /api/community/contributions/:id`

Notes:
- Protected learner endpoints (`/api/course`, `/api/content/metrics`, `/api/session/*`, `/api/settings`, `/api/progress`, `/api/stats`, `/api/visitors/stats`, `/api/community/*`) require a bearer token.
- Email/password users must verify email before login is allowed.
- In-app account deletion is currently available for local (password) accounts only; it requires both password confirmation and an explicit irreversible-action confirmation flag.
- Auth and request flow logs are emitted as JSON with `requestId` for correlation.

## Troubleshooting

- `better-sqlite3` is native. Use Node LTS (`20.x` or `22.x`) if install/build fails.
- If native module install fails on Windows:
  - update Node/npm
  - delete `node_modules` in root/client/server and reinstall
- If frontend loads but data is missing, verify backend is running on `:4000`.
- If `eslint .` behaves differently from `npm run lint`, check whether a global ESLint install is taking precedence and prefer `npx eslint .` or the npm script.
