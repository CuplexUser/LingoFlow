# LingoFlow

LingoFlow is a React + Express language training app inspired by Duolingo, with adaptive progression and persistent learner data using SQLite.

## Features

- Category-based learning path (`Essentials`, `Conversation`, `Travel`, `Work`, `Health`, `Family & Friends`, `Food & Cooking`, `Grammar`)
- Randomized challenge sessions per category
- Full-sentence practice (not only one-word answers)
- Sentence-builder exercises with correction feedback and reveal flow
- Expanded exercise types: cloze deletion, listen-and-build sentence, guided dialogue completion
- Adaptive CEFR-style progression (`A1` → `B2`) based on mastery
- Persistent progress (XP, streak, category mastery, daily XP, per-item progress) via `better-sqlite3`
- Multi-user account support with auth (`register`, `verify-email`, `login`, `google`, `me`) and user-scoped persistence
- Dedicated login/register UI with token-based session persistence and sign-out
- Language options: `Spanish`, `Russian`, `English`

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
- `LOG_LEVEL` (server): `debug` | `info` | `warn` | `error` (default: `info`).

Create `server/.env` (copy from `server/.env.example`) to set server-side variables in local development.

## Production Build

```bash
npm run build
npm run start
```

Open `http://localhost:4000`.

## Project Structure

```text
client/
  src/App.jsx        # App shell + orchestration
  src/components/    # Learn/Setup/Stats/SessionPlayer components
                  # + AuthPage (login/register/google sign-in)
  src/__tests__/     # Frontend tests (Vitest + Testing Library)
  src/test/          # Test setup
  src/api.js         # API client
  src/constants.js   # Shared UI constants
  src/utils/         # Utilities (theme/path helpers)
  src/styles.css     # App styles
server/
  src/index.js       # API routes
  src/data.js        # Course content + session generation
  src/db.js          # SQLite schema, auth users, user-scoped persistence
  src/__tests__/     # Backend tests
  data/              # Runtime DB files
```

## Available Scripts

- `npm run install:all`: install `server` and `client` dependencies
- `npm run dev`: run backend + frontend concurrently
- `npm run build`: build frontend bundle
- `npm run start`: serve backend and built frontend
- `npm run test:server`: run backend unit + integration tests
- `npm run test --prefix client`: run frontend tests

## Completed Reliability Improvements

- Server-authoritative session completion and scoring (prevents trivial score tampering)
- Active session validation with expiry/completion checks
- Validation for unknown question IDs and invalid completion attempts
- Normalized answer checking and accepted-answer variant support
- Level-aware distractor selection and spaced-priority item selection
- Daily XP aggregation (`todayXp`) and per-item retention tracking

## Testing

- Backend test suite location: `server/src/__tests__/`
- Frontend test suite location: `client/src/__tests__/`
- Current coverage focus:
  - frontend session retry/reveal/resume behavior
  - frontend setup save/reset behavior
  - frontend stats rendering from API fixtures
  - session start/complete happy path
  - invalid/unknown completion payload rejection
  - answer normalization and sentence evaluation
  - XP penalty behavior
  - session generation exercise coverage
  - progression persistence updates (including daily XP)

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/resend-verification`
- `POST /api/auth/verify-email`
- `GET /api/auth/me`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/languages`
- `GET /api/course?language=<id>`
- `POST /api/session/start`
- `POST /api/session/complete`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/progress?language=<id>`

Notes:
- Protected learner endpoints (`/api/course`, `/api/session/*`, `/api/settings`, `/api/progress`, `/api/stats`) require a bearer token.
- Email/password users must verify email before login is allowed.
- Auth and request flow logs are emitted as JSON with `requestId` for correlation.

## Troubleshooting

- `better-sqlite3` is native. Use Node LTS (`20.x` or `22.x`) if install/build fails.
- If native module install fails on Windows:
  - update Node/npm
  - delete `node_modules` in root/client/server and reinstall
- If frontend loads but data is missing, verify backend is running on `:4000`.
