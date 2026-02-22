# LingoFlow

LingoFlow is a React + Express language training app inspired by Duolingo, with adaptive progression and persistent learner data using SQLite.

## Features

- Category-based learning path (`Essentials`, `Conversation`, `Travel`, `Work`, `Health`, `Grammar`)
- Randomized challenge sessions per category
- Full-sentence practice (not only one-word answers)
- Sentence-builder exercises with correction feedback and reveal flow
- Adaptive CEFR-style progression (`A1` → `B2`) based on mastery
- Persistent progress (XP, streak, hearts, category mastery) via `better-sqlite3`
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

## Production Build

```bash
npm run build
npm run start
```

Open `http://localhost:4000`.

## Project Structure

```text
client/
  src/App.jsx        # UI flow: landing, session player, feedback
  src/api.js         # API client
  src/styles.css     # App styles
server/
  src/index.js       # API routes
  src/data.js        # Course content + session generation
  src/db.js          # SQLite schema + progression persistence
  data/              # Runtime DB files
```

## Available Scripts

- `npm run install:all`: install `server` and `client` dependencies
- `npm run dev`: run backend + frontend concurrently
- `npm run build`: build frontend bundle
- `npm run start`: serve backend and built frontend

## API Overview

- `GET /api/languages`
- `GET /api/course?language=<id>`
- `POST /api/session/start`
- `POST /api/session/complete`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/progress?language=<id>`

## Troubleshooting

- `better-sqlite3` is native. Use Node LTS (`20.x` or `22.x`) if install/build fails.
- If native module install fails on Windows:
  - update Node/npm
  - delete `node_modules` in root/client/server and reinstall
- If frontend loads but data is missing, verify backend is running on `:4000`.
