# 🗣️ LingoFlow

A language learning app for seven languages, with a path of short lessons from A1 to B2,
a variety of exercise types, graded stories and daily practice. This repo holds the web
app (React) and the API (Express) that both the web app and the Android app use.

**Try it:** [lingoflow.cuplex.se](https://lingoflow.cuplex.se) · **Android:** the
`Lingoflow-Android` repo, a Capacitor app that talks to the same API.

![TypeScript](https://badgen.net/badge/TypeScript/React%2019%20%2B%20Express%205/3178c6)
![Languages](https://badgen.net/badge/languages/7/4a90e2)
![Tests](https://badgen.net/badge/tests/Vitest%20%2B%20Node%20test%20runner/2ea44f)

## How it fits together

| Part | Where it runs | What it does |
| --- | --- | --- |
| Web client (`client/`) | Vercel | React 19 app. Vercel rewrites `/api/*` to Cloud Run, so the browser stays same-origin. |
| API (`server/`) | Google Cloud Run (`europe-west3`) | Express 5 API: accounts, courses, sessions, progress, stories, text-to-speech and billing. |
| Database | Neon Postgres in production, SQLite locally | The same queries run on both (see [Database](#database)). |
| Android app | Google Play, separate repo | Sends `X-LingoFlow-Client: android`. A1 is free there and A2 to B2 need Premium, bought through Google Play and RevenueCat. The web app has no level cap. |

## Features

### Learning

- **7 languages:** English, Spanish, Russian, Italian, Swedish, French and German, each
  with its own progress.
- **16 categories:** Essentials, Conversation, Travel, Work, Health, Family & Friends,
  Food & Cooking, Grammar, Hobbies & Leisure, Sports & Fitness, News & Media, Money &
  Finance, Science & Technology, Culture & History, Nature & Animals, and Numbers & Math.
- **CEFR levels A1 to B2.** On the web, a category's levels unlock with mastery.
- **Learning path** (`/api/path`, used by the Android app): each level is a row of units,
  one per category with enough content. A unit has two to four lessons depending on how
  many exercises it has, and its last lesson reviews it. A placement check sets where the
  path starts, and checks let a learner test out of one unit, a section of four units or
  the rest of a level.
- **Daily challenge:** one fresh session a day, drawn from several categories.
- **Spaced repetition:** due and weak items come back first; words marked "I knew this"
  stay out until they are due.
- **Mistake review:** an optional short session of the questions just missed.
- **Autosave and resume:** a session in progress survives a refresh or a closed tab.

### Exercise types

- **Translation:** rotates through multiple choice, sentence building, cloze, dictation
  and dialogue variants, in both directions.
- **Flashcard:** turn the card over, then "I knew this" or "Need review".
- **Sentence builder:** put word tiles in order, with hints (audio, then the next tile).
- **Cloze:** fill the gap from a few options.
- **Dictation:** type a sentence you hear.
- **Matching:** pair prompts with answers.
- **Pronunciation:** speech recognition, passing at 90% similarity or more.
- **Roleplay:** complete a guided dialogue.

### Practice

- **Practice modes:** speaking, listening, word matching, and a drill of your
  previous mistakes across all categories, worst first.
- **Speed Match:** match 6 word pairs against a 20-second timer; clearing a run starts
  the next one after a short break, and the game ends when a run runs out of time. Words
  come from flashcards marked "Known" and bookmarks, topped up from the language's
  practice word pool. Each language keeps a personal best.

### Reading

- **Story Reader** (the Read tab): graded stories from short A1 pieces to multi-paragraph
  B1 reads, a few per level. The list marks finished stories and opens at the first
  unread one.
- Tap a word for its meaning, part of speech, an optional grammar note and audio. Words
  from the glossary have a solid underline, and words with a grammar hint a dotted one.
- Each sentence has audio, English can be shown or hidden, and each story has a cultural
  note.
- "Save to review" puts unknown words into spaced repetition. Reading earns no XP.

### Progress and stats

- XP, streak, learner level and category mastery, per user and language.
- Stats page: completion, accuracy, streak, a 6-month activity grid, an XP trend, a
  session chart, category mastery, mistake types and the weakest objectives.
- Achievements, kept on the server (`/api/user/achievements`), so the web and the app
  share them.
- A "streak at risk" warning on days without practice.
- Bookmarks: save any exercise, then listen to your bookmarks at the speed you choose.
- A share card after each session, for X, WhatsApp, Facebook, Telegram or the system
  share sheet.

### Community and admin

- Any signed-in user can submit an exercise. Submissions wait for moderation (pending,
  then approved or rejected), and approved ones can appear in sessions.
- Admins are the first registered user and anyone in `CONTRIBUTION_REVIEWER_EMAILS`.
  They review submissions and see the **content coverage** page: exercise counts per
  language, category and level, with cells colored red (a level under 5), amber (under
  10) or green (all 10 or more).

### Accounts

- Email and password, with email verification and password reset.
- Google sign-in: the OAuth redirect on the web, an ID token from Credential Manager in
  the Android app (`POST /api/auth/google/native`).
- Account deletion.
- Light and dark themes, and a responsive layout.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Chart.js |
| Backend | Express 5, TypeScript run with Node's type stripping, bundled with esbuild |
| Database | PostgreSQL / Neon (`pg`) or SQLite (`better-sqlite3`) |
| Auth | JWT (30-day lifetime), bcrypt, Google OAuth 2 |
| Speech | Gemini text-to-speech, cached in Cloud Storage |
| Billing | RevenueCat (Google Play subscriptions for the Android app) |
| Tests | Vitest and Testing Library (client), Node's test runner (server) |

## Quick start

```bash
npm install
npm run dev
```

- Web app: `http://localhost:5173`
- API: `http://localhost:4000/api`

Locally the API uses SQLite, so no database server is needed. Copy `server/.env.example`
to `server/.env` to set the variables in [Configuration](#configuration).

## Scripts

```bash
npm run dev                # API (:4000) and web app (:5173) together
npm run build              # Production web bundle
npm run start              # Serve the API and the built web app
npm run test               # Server and client tests
npm run test:server:pg     # Server tests against Postgres
npm run verify             # Lint and client tests
npm run lint               # ESLint (lint:fix to fix)
npm run lint:content       # Check the course content files
npm run review:content     # Content review tool
npm run format             # Prettier (format:check to check only)
npm run translate:language # Generate content for a language with LibreTranslate
npm run db:import-sqlite   # Copy a SQLite database into Postgres
```

<details>
<summary><b>Configuration</b></summary>

Set these in `server/.env` locally, and as environment variables or Secret Manager
secrets on Cloud Run.

| Variable | Description |
| --- | --- |
| `LINGOFLOW_AUTH_SECRET` | JWT signing secret. Change it in production. |
| `DATABASE_URL` | Postgres connection string. Without it the API uses SQLite. |
| `LINGOFLOW_DB_DRIVER` | `sqlite` or `postgres`, to override the choice above. |
| `LINGOFLOW_DB_PATH` | Where the SQLite file lives (default: `server/data/lingoflow.db`). |
| `PUBLIC_APP_URL` | The web app's address, used in emails and after Google sign-in. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth web client ID. The Android app's ID tokens are checked against it too. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth web client secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | The callback registered with Google (default: `http://localhost:4000/api/auth/google/callback`). |
| `RESEND_API_KEY` | Sends email through [Resend](https://resend.com). Takes priority over SMTP. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | SMTP, used when `RESEND_API_KEY` is unset. |
| `EMAIL_FROM` | The sender for both Resend and SMTP. |
| `CONTRIBUTION_REVIEWER_EMAILS` | Moderators, separated by commas. |
| `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` | LibreTranslate, for word lookups the content doesn't cover. |
| `GEMINI_API_KEY` | Enables `/api/tts`. Without it the endpoint answers 503. |
| `TTS_CACHE_BUCKET` | Cloud Storage bucket for TTS audio. Without it only a memory cache is used. |
| `TTS_MODEL` | Gemini TTS model (default: `gemini-3.8-flash-lite-tts`). |
| `TTS_VOICES` | Voices per language, such as `ru-RU=Charon` (default: Kore). |
| `TTS_DAILY_GENERATION_LIMIT` | New clips a day per instance (default: 1000; each user also gets at most 150). Cached clips are unlimited. |
| `TTS_DISABLED` | `1` turns `/api/tts` off, and clients use their own speech. |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat secret key (API v1), to read a subscriber's entitlements. Without it Premium purchases never unlock. |
| `REVENUECAT_WEBHOOK_AUTH` | The `Authorization` header value RevenueCat's webhook sends. |
| `REVENUECAT_ENTITLEMENT_ID` | The entitlement that means Premium (default: `premium`). |
| `PREMIUM_ACCOUNT_EMAILS` | Accounts with Premium without a subscription, such as a Play review account. |
| `VISITOR_HASH_SALT` | Salt for the hashed visitor counts on the sign-in page. |
| `LOG_LEVEL` | `debug`, `info`, `warn` or `error` (default: `info`). |
| `PORT` | Listen port (default: 4000; Cloud Run sets it). |

The web client reads `VITE_API_BASE` (default: `/api`).

</details>

## Database

The API runs on SQLite or PostgreSQL, chosen at startup:

| Condition | Driver |
| --- | --- |
| `DATABASE_URL` is set | PostgreSQL (`pg`) |
| `DATABASE_URL` is unset | SQLite (`better-sqlite3`), at `server/data/lingoflow.db` |
| `LINGOFLOW_DB_DRIVER=sqlite\|postgres` | Overrides the above |

SQLite is the local default, and the test suite runs on it. Production uses Neon.

There is one copy of every query. `server/src/db.ts` writes dialect-neutral SQL with `?`
placeholders, and `server/src/db/dialect.ts` translates it for Postgres (identity
columns, timestamp defaults, `?` to `$1..$n`). The schema and its migrations run at
startup through `initSchema()`, and running them again changes nothing. More detail is in
[docs/database.md](docs/database.md).

**Using Neon locally:** put the **pooled** connection string in `server/.env` and start
the server once to create the schema:

```
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require
```

**Importing a SQLite database:**

```bash
npm run db:import-sqlite                       # from server/data/lingoflow.db
npm run db:import-sqlite -- --from ./backup.db # from another file
npm run db:import-sqlite -- --dry-run          # only report row counts
```

The import copies every table in foreign-key order and resets the identity sequences
afterwards, so new rows don't collide with imported ones. It is safe to run again: rows
that already exist are skipped.

`scripts/repair-xp.ts` and `scripts/set-xp.ts` open the SQLite file directly and don't
work against Postgres.

## Deployment

<details>
<summary><b>Web app on Vercel</b></summary>

Vercel hosts only the web client. `vercel.json` installs the client workspace, builds it,
serves `client/dist` and rewrites `/api/*` to the Cloud Run API, so the default
`VITE_API_BASE` works unchanged.

1. Import the repo into a Vercel project. No framework preset is needed.
2. Vercel needs no server variables; they live on Cloud Run. `APP_VERSION` is optional
   (see `scripts/write-version.js`).
3. If the Cloud Run address changes, update the `/api/(.*)` rewrite in `vercel.json`.

A change to the API needs only a Cloud Run deploy; Vercel deploys when the web client
changes.

</details>

<details>
<summary><b>API on Google Cloud Run</b></summary>

The repo's `Dockerfile` builds an API-only image: the esbuild bundle, `server/content/`
and production dependencies, listening on `$PORT`. It always uses Postgres, so the SQLite
binding isn't built.

1. **Project:** enable the Cloud Run, Cloud Build, Artifact Registry and Secret Manager
   APIs. The service runs in `europe-west3` (Frankfurt), next to Neon's
   `aws-eu-central-1`.
2. **Secrets:** create these in Secret Manager and give the Cloud Run runtime service
   account `roles/secretmanager.secretAccessor` on each: `DATABASE_URL` (Neon's pooled
   string), `LINGOFLOW_AUTH_SECRET` (the same as before, or everyone is signed out),
   `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `RESEND_API_KEY`,
   `CONTRIBUTION_REVIEWER_EMAILS`, `GEMINI_API_KEY`, `LIBRETRANSLATE_API_KEY`,
   `REVENUECAT_SECRET_API_KEY` and `REVENUECAT_WEBHOOK_AUTH`.
3. **Deploy:** by hand with `gcloud run deploy lingoflow-api --source . --region
   europe-west3`, or with the **Deploy API to Cloud Run** workflow
   (`.github/workflows/deploy-cloud-run.yml`). The workflow signs in with Workload Identity
   Federation and needs the repository variables `GCP_PROJECT_ID`, `GCP_REGION`,
   `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `PUBLIC_APP_URL`, `EMAIL_FROM`,
   `GOOGLE_OAUTH_REDIRECT_URI`, `TTS_CACHE_BUCKET` and `LIBRETRANSLATE_URL`.
4. **Check:** `curl https://<service-url>/api/health` returns `{"ok":true}`.
5. **Web app:** point the `/api/(.*)` rewrite in `vercel.json` at
   `https://<service-url>/api/$1`, and set `PUBLIC_APP_URL` to the web app's domain.
6. **RevenueCat:** set the webhook to `https://<service-url>/api/billing/revenuecat-webhook`,
   with `REVENUECAT_WEBHOOK_AUTH` as its authorization header.
7. **Text-to-speech:** create a bucket in the same region and let the runtime service
   account use it, then set `TTS_CACHE_BUCKET`:

   ```sh
   gcloud storage buckets create gs://<bucket> --location europe-west3 --uniform-bucket-level-access
   gcloud storage buckets add-iam-policy-binding gs://<bucket> --member serviceAccount:<runtime-service-account> --role roles/storage.objectAdmin
   ```

   A sentence is generated the first time someone plays it (a few seconds), then served
   from the bucket. Clients use their own speech whenever the endpoint fails or is slow.

</details>

<details>
<summary><b>Running on your own server</b></summary>

```bash
npm ci
npm run build   # bundles the web client into server/dist/client
npm run start   # serves everything from http://localhost:4000
```

To build only the API: `npm run build --prefix server`, then
`npm run start:dist --prefix server`.

- Install with `npm ci`, never `npm update`: `server/` and `client/` share the one root
  lockfile, and `npm ci` installs exactly what it lists.
- If CI builds `dist/` for you, the server only needs `npm ci --omit=dev`. Otherwise keep
  the dev dependencies, which include the build tools.
- Never copy `node_modules` between machines. `better-sqlite3` is a native module built
  for one platform and Node version. A Postgres-only server never loads it.

</details>

## Writing content

Course content is JSON under `server/content/`: exercises per language and category in
`languages/<language>/`, practice word pools in `practice_words/`, and stories in
`stories/`. `npm run lint:content` checks it, and
[docs/content-quality-checklist.md](docs/content-quality-checklist.md) covers what good
content looks like.

<details>
<summary><b>Word hints and translations</b></summary>

Words in a cloze sentence or a translation into English show a tooltip. Three sources are
checked in order:

1. **Grammar hints** (dotted underline): words matched by the `'word' = meaning` pattern
   in the exercise's `hints`.
2. **Glossary** (solid underline): words in the exercise's optional `wordGlossary`.
3. **Looked-up translations** (same style): any other word. The client asks the server
   when the exercise loads; the server checks its `word_translations` cache first, then
   asks [LibreTranslate](https://libretranslate.com). Each word is looked up once and
   cached.

At startup the cache is rebuilt from the content itself (`wordGlossary` fields,
`"Vocabulary: X"` flashcards and single-word hints), so known words never need a lookup.
Looked-up translations are cleaned before they're cached: answers that are only
punctuation or the same as the word are dropped, trailing punctuation is removed, and
the text is lowercased.

A glossary on an exercise looks like this:

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

Keys are the lowercased words as they appear in `correctAnswer`; values are short English
glosses. The server checks the field at startup.

To run LibreTranslate yourself with Docker:

```bash
docker run -it -p 5000:5000 libretranslate/libretranslate --api-keys
docker exec <container-id> ltmanage keys add   # in a second terminal
```

</details>

<details>
<summary><b>Generating a language with LibreTranslate</b></summary>

`npm run translate:language` starts a wizard that reads `server/.env` and translates from
English. It writes only new files under `server/content/` and never overwrites one, so
delete a file first to generate it again. It can generate:

- **Course categories:** pick a language and the category files.
- **Practice words:** translates `practice_words/_template.json` into
  `practice_words/<language>.json`, in batches, so about 1,000 words take about 20 calls.
- **Stories:** translates `stories/english.json` sentence by sentence into
  `stories/<language>.json`, then translates back to build a glossary for each word, with
  parts of speech and grammar notes taken from the English glossary.

`scripts/libretranslate/story-localization.json` gives each language its own setting, so
a Spanish story isn't set in London. `terms` swaps place names and currencies (the B1
letter comes from Barcelona, Paris, Berlin, Rome or Stockholm), and `culturalNote`
replaces the note with one about the target culture. Anything missing falls back to the
English story.

The code is in `scripts/libretranslate/`: `terminal-menu.ts` (prompts),
`content-generator.ts` (translation and files) and `index.ts` (the wizard).

</details>

## Project structure

<details>
<summary><b>Folders and main files</b></summary>

```
client/src/
  App.tsx, AppProvider.tsx  # App root; state is shared through the contexts in context/
  api.ts                    # Typed API client
  components/               # Pages (Learn, Practice, Story, Stats, Bookmarks, Admin, ...)
    session/                # Session player: question panels, speech, autosave
    story/                  # Story Reader
  hooks/                    # Navigation, data loading and other hooks
  styles/                   # CSS by area (tokens, shell, session, stats, ...)
  types/                    # Course, session and contribution types
  __tests__/                # Vitest and Testing Library

server/src/
  index.ts                  # Express setup, routes and answer checking
  db.ts                     # Schema, migrations and every query
  db/                       # SQLite and Postgres drivers, SQL dialect translation
  data.ts, data/            # Content loading, session generation, practice pools, stories
  xpRules.ts                # XP formulas, also sent to clients with each session
  routes/
    authRoutes.ts           # Accounts and Google sign-in
    courseRoutes.ts         # Course catalog, stories, word lookups, admin content stats
    pathRoutes.ts           # Learning path, placement and checkpoints
    sessionRoutes.ts        # Sessions, daily challenge, practice, Speed Match
    ttsRoutes.ts            # Text-to-speech
    userRoutes.ts           # Settings, progress, stats, bookmarks, achievements, community, billing
  auth/                     # Tokens and passwords
  __tests__/                # Node test runner integration tests

server/content/
  languages/<language>/     # Exercises, one JSON file per category
  practice_words/           # Practice word pools (_template.json is the English source)
  stories/                  # Story Reader stories per language
```

</details>

## API reference

<details>
<summary><b>Endpoints</b></summary>

### Public

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/verify-email` | Verify an email address |
| `POST` | `/api/auth/resend-verification` | Send the verification email again |
| `POST` | `/api/auth/forgot-password` | Ask for a password reset link |
| `POST` | `/api/auth/reset-password` | Set a new password |
| `GET` | `/api/auth/google/start` | Start Google sign-in (web) |
| `GET` | `/api/auth/google/callback` | Google sign-in callback (web) |
| `POST` | `/api/auth/google/native` | Sign in with a Google ID token (Android) |
| `GET` | `/api/languages` | Available languages |
| `POST` | `/api/visitors/login` | Count a sign-in page visit |
| `POST` | `/api/billing/revenuecat-webhook` | RevenueCat events (checked against `REVENUECAT_WEBHOOK_AUTH`) |

### Signed in (Bearer token)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/auth/me` | The current user |
| `POST` | `/api/auth/delete-account` | Delete the account |
| `GET` / `PUT` | `/api/settings` | Learner settings |
| `GET` | `/api/course?language=<id>` | Course catalog with progress |
| `GET` | `/api/content/metrics?language=<id>` | Content per level |
| `POST` | `/api/session/start` | Start a session; `mode: "mistakes"` with `category: "__mistakes__"` drills past mistakes |
| `POST` | `/api/session/daily` | Start the daily challenge |
| `POST` | `/api/session/complete` | Submit a session's answers |
| `GET` | `/api/path?language=<id>` | The learning path |
| `POST` | `/api/path/start` | Set where the path starts |
| `POST` | `/api/path/lesson` | Start a path lesson |
| `POST` | `/api/path/checkpoint` | Start a check (`scope`: `unit`, `section` or `level`) |
| `POST` | `/api/placement/start`, `/api/placement/complete` | The placement check |
| `GET` | `/api/practice/speed-match?language=<id>` | Speed Match words and personal best |
| `POST` | `/api/practice/speed-match/score` | Save a Speed Match score |
| `GET` | `/api/progress?language=<id>` | Progress in one language |
| `GET` | `/api/progress-overview` | Progress in every language |
| `GET` | `/api/stats?language=<id>` | Stats page data |
| `GET` | `/api/user/achievements` | Earned achievements (`?all=1` for every one, with progress) |
| `GET` / `POST` | `/api/bookmarks` | List or add bookmarks |
| `DELETE` | `/api/bookmarks/:questionId` | Remove a bookmark |
| `GET` | `/api/stories?language=<id>&level=<lvl>&category=<cat>` | Story list |
| `GET` | `/api/stories/recommended`, `/api/stories/stats` | The next story to read, and reading stats |
| `GET` | `/api/stories/:id` | A whole story |
| `POST` | `/api/stories/:id/progress`, `/api/stories/:id/complete` | Save reading progress, or finish a story |
| `GET` / `POST` | `/api/saved-words` | List or save words to review |
| `DELETE` | `/api/saved-words/:word?language=<id>` | Remove a saved word |
| `GET` | `/api/dictionary/batch?lang=<id>&words=<w1,w2>` | Word translations |
| `GET` | `/api/tts` | Speech audio for a sentence |
| `POST` | `/api/billing/sync` | Read the user's subscription from RevenueCat |
| `POST` | `/api/community/contribute` | Submit an exercise |
| `GET` | `/api/community/contributions` | List contributions (your own, or all) |
| `GET` | `/api/community/contributions/pending-count` | Submissions waiting for review |
| `PATCH` | `/api/community/contributions/:id` | Change a submission's status |

### Admins only

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/visitors/stats` | Sign-in page visits |
| `GET` | `/api/admin/content-stats` | Exercise counts by language, category and level |
| `GET` | `/api/admin/word-translations/counts` | Cached word translations per language |
| `POST` | `/api/admin/word-translations/rebuild` | Rebuild the word translation cache |

</details>

## Development notes

- **Unlock everything:** development builds show a Setup switch, "Dev only: unlock all
  lessons". The server honors it only when `NODE_ENV` isn't `production`.
- **Native module:** `better-sqlite3` needs a Node version with a published prebuild (any
  current LTS); otherwise it compiles from source and needs a C++ toolchain. If installing
  fails on Windows, update Node and npm, delete every `node_modules` folder and install
  again.
- **Missing data in the web app:** check that the API is running on `:4000`.
- **Lint differences:** if `eslint .` behaves differently from `npm run lint`, a global
  ESLint is probably being picked up; use `npx eslint .` or the npm script.

## More documentation

- [docs/database.md](docs/database.md): the database layer in detail
- [docs/content-quality-checklist.md](docs/content-quality-checklist.md): writing content
- [docs/TODO.md](docs/TODO.md) and [docs/Completed.md](docs/Completed.md): plans and history
