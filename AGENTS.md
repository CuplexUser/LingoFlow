# Repository Guidelines

## Project Structure & Module Organization
- `client/`: React + Vite frontend.
- `client/src/App.jsx`: Main UI flow (settings, category landing page, session player).
- `client/src/api.js`: Frontend API wrapper for backend routes.
- `client/src/styles.css`: Global styles.
- `server/`: Express API + SQLite persistence.
- `server/src/index.js`: HTTP routes (`/api/course`, `/api/session/start`, `/api/session/complete`, etc.).
- `server/src/data.js`: Language/course content and session generation logic.
- `server/src/db.js`: `better-sqlite3` schema and progression persistence.
- `server/data/`: Runtime database files (`lingoflow.db`).

## Build, Test, and Development Commands
- `npm install` (root): installs root tooling.
- `npm run install:all` (root): installs `server` and `client` dependencies.
- `npm run dev` (root): starts backend (`:4000`) and frontend (`:5173`) concurrently.
- `npm run build` (root): builds frontend into `client/dist`.
- `npm run start` (root): runs backend and serves built frontend/static assets.
- `node --check server/src/index.js`: quick syntax check for backend files.

## Coding Style & Naming Conventions
- Use 2-space indentation and semicolons in JS/JSX.
- Prefer descriptive camelCase for variables/functions (`startCategory`, `getCourseOverview`).
- Use PascalCase for React components (`SessionPlayer`).
- Keep API payload keys stable and explicit (`difficultyLevel`, `revealedAnswers`).
- Favor small, focused functions over large inline blocks.

## Testing Guidelines
- No formal test suite is configured yet.
- For now, validate changes with:
  - backend syntax checks via `node --check`
  - manual flow checks in `npm run dev` (start session, wrong-answer feedback, completion persistence).
- When adding tests, place:
  - backend tests under `server/src/__tests__/`
  - frontend tests under `client/src/__tests__/`

## Commit & Pull Request Guidelines
- Use clear, scoped commit messages (Conventional Commits recommended), e.g.:
  - `feat(session): add reveal-answer penalties`
  - `fix(ui): block progression on incorrect answers`
- PRs should include:
  - concise summary of behavior changes
  - API/schema changes (if any)
  - manual verification steps
  - screenshots/GIFs for UI updates

## Security & Configuration Tips
- Use Node LTS (20.x or 22.x recommended) for native module compatibility.
- Do not commit `server/data/` database files.
- Keep secrets/config in environment variables if introduced later.
