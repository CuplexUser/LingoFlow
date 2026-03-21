# Repository Guidelines

## Project Structure & Module Organization
- `client/`: React + Vite frontend.
- `client/src/App.tsx`: Main app-shell composition and authenticated app flow.
- `client/src/api.ts`: Frontend API wrapper plus session payload normalization.
- `client/src/hooks/`: App-shell hooks (`useAppNavigation`, `useAuthenticatedAppData`, `useCourseSessionState`, `useThemeMode`).
- `client/src/components/session/`: Session rendering helpers, panels, and session hooks.
- `client/src/types/`: Shared client TypeScript domain models for course, session, and contribution flows.
- `client/src/styles.css`: Global styles.
- `server/`: Express API + SQLite persistence.
- `server/src/index.ts`: HTTP routes (`/api/course`, `/api/session/start`, `/api/session/complete`, etc.).
- `server/src/data.ts`: Language/course content and session generation logic.
- `server/src/db.ts`: `better-sqlite3` schema and progression persistence.
- `server/data/`: Runtime database files (`lingoflow.db`).

## Build, Test, and Development Commands
- `npm install` (root): installs root tooling.
- `npm run install:all` (root): installs `server` and `client` dependencies.
- `npm run dev` (root): starts backend (`:4000`) and frontend (`:5173`) concurrently.
- `npm run build` (root): builds frontend into `client/dist`.
- `npm run start` (root): runs backend and serves built frontend/static assets.
- `npm run test --prefix client`: runs the frontend Vitest suite.
- `npm run test --prefix server`: runs the backend test suite.
- `npx tsc --noEmit -p client/tsconfig.json`: checks the client TypeScript surface.
- `node --check server/src/index.js`: quick syntax check for backend files.

## Coding Style & Naming Conventions
- Use 2-space indentation and semicolons in JS/TS/JSX/TSX.
- Prefer descriptive camelCase for variables/functions (`startCategory`, `getCourseOverview`).
- Use PascalCase for React components (`SessionPlayer`).
- Keep API payload keys stable and explicit (`difficultyLevel`, `revealedAnswers`).
- Favor small, focused functions over large inline blocks.
- Prefer TypeScript-first client changes over adding new JS compatibility layers.

## Testing Guidelines
- Frontend tests are configured with Vitest under `client/src/__tests__/`.
- Backend tests are configured under `server/src/__tests__/`.
- Validate changes with:
  - `npm run test --prefix client`
  - `npm run test --prefix server`
  - `npx tsc --noEmit -p client/tsconfig.json`
  - manual flow checks in `npm run dev` when UI/session behavior changes
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
