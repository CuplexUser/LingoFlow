# Deploying LingoFlow

Pushing to `main` deploys nothing. CI runs the tests, and each part of the app is then
deployed by hand. This page explains what runs where, how each part is deployed, and
what to check before and after a release.

## What runs where

| Part | Where | Deployed by | When it needs a deploy |
|---|---|---|---|
| Web client (`client/`) | Vercel, [lingoflow.cuplex.se](https://lingoflow.cuplex.se) | Vercel CLI, from your machine | `client/` changed |
| API (`server/`, including `server/content/`) | Cloud Run service `lingoflow-api`, `europe-west3` | **Deploy API to Cloud Run** workflow | `server/` changed, content changed, or an API variable or secret changed |
| LibreTranslate (word lookups) | Cloud Run service `libretranslate`, private | **Deploy LibreTranslate to Cloud Run** workflow | `deploy/libretranslate/Dockerfile` changed |
| Database | Neon Postgres | Nothing; the API migrates it at startup | Never deployed directly |
| Android app | Separate private repo | Google Play | Not covered here, but it shares the API |

How the parts connect:

- The browser only talks to Vercel. `vercel.json` rewrites `/api/*` to the Cloud Run URL,
  so the web app and the API look like one site.
- The Android app calls the same API directly, with `X-LingoFlow-Client: android`.
- The API calls LibreTranslate with a Cloud Run ID token, and Neon over `DATABASE_URL`.

## The pipelines

### CI (`.github/workflows/ci.yml`)

CI runs on every push and pull request to `main`. It lints, type-checks the client and
the server, and runs the server and client tests. No deploy waits for it, so check that
it is green before you deploy.

### Web client: Vercel

The Git integration is off, so Vercel deploys only when you run the CLI from the repo
root:

```sh
vercel --prod
```

The CLI uploads your **working tree**, not what's on GitHub. Uncommitted changes go live,
so deploy from a clean, pushed `main`. Vercel then installs the client workspace, builds
it, and serves `client/dist`.

The footer version comes from the `APP_VERSION` project variable. Vercel's build has no
`.git`, so `scripts/write-version.js` can't read the tag. After tagging a release, set
it once per environment (the comma form `production,preview` only sets production):

```sh
vercel env add APP_VERSION --environment production --type config --value vX.Y.Z --force
vercel env add APP_VERSION --environment preview --type config --value vX.Y.Z --force
```

Then deploy, so the new value is built in.

### API: Cloud Run (`.github/workflows/deploy-cloud-run.yml`)

Run it from the Actions tab, or:

```sh
gh workflow run deploy-cloud-run.yml --ref main
gh run watch
```

The workflow checks out the branch it runs on, so **push first**. It builds the repo's
`Dockerfile` with Cloud Build, deploys a new revision, and finishes with a smoke test
against `/api/health`.

The Docker build runs only `build:dist`. It bundles the server without type-checking it,
so CI is the only check that catches a server type error.

At startup the API does three things before it serves requests:

1. **Migrates the database.** Schema setup is idempotent. It runs only when
   `SCHEMA_VERSION` in `server/src/db.ts` differs from the stored version; see
   [database.md](database.md).
2. **Reconciles content fingerprints.** If more than 25 % of a category's items changed
   (`CONTENT_RESET_THRESHOLD` in `server/src/data.ts`), learners' progress in that
   category is reset.
3. **Re-seeds the word cache's content entries** from the language and story files.

Non-secret settings are repository variables. The workflow passes them with
`--set-env-vars`, so changing one takes effect at the next deploy. Secrets live in
Secret Manager and are mapped with `--set-secrets ...:latest`. After you add a secret
version, redeploy so new instances read it.

### LibreTranslate (`.github/workflows/deploy-libretranslate.yml`)

Deploy it only when the image changes: a new LibreTranslate version, or another
language code added to `LANGUAGES` in `deploy/libretranslate/Dockerfile`.

```sh
gh workflow run deploy-libretranslate.yml --ref main
```

It scales to zero and is capped at one instance. A successful deploy means the models
loaded. Its URL stays the same across deploys, so the API needs no redeploy afterward.

## Order of deploys

- **Only the API changed:** deploy the API.
- **Only the web client changed:** deploy Vercel.
- **Both changed:** deploy the **API first**, then Vercel. If the new client reaches the
  old API, it can call endpoints that don't exist yet, or that behave differently. For
  example, the word cache's Rebuild `scope` option would have wiped the whole cache
  against the old API.
- **The API must stay compatible with released Android versions.** Users don't update
  right away, so don't remove or rename fields or endpoints that the app uses.

## Checklist

### Before deploying

- [ ] `npm run test` and `npm run lint` pass.
- [ ] `npm run build` in `server/` passes. CI runs the same type check, but this catches
      it before you push.
- [ ] Everything is committed and pushed to `main`, and `git status` is clean.
- [ ] CI is green for that commit (`gh run list --workflow ci.yml -L 1`).
- [ ] **Schema change?** `SCHEMA_VERSION` in `server/src/db.ts` is bumped. Without the
      bump, an existing database never gets the change. The SQL works on both SQLite and
      Postgres (see CLAUDE.md), and any new table is added to
      `scripts/import-sqlite-to-postgres.ts`.
- [ ] **Content change?** No category changed more than 25 % by accident; that resets
      progress. `npm run lint:content` passes.
- [ ] **New setting?** The repository variable or Secret Manager secret exists, and the
      workflow passes it. Secrets also need `roles/secretmanager.secretAccessor` for the
      runtime service account.
- [ ] **Breaking API change?** It is safe for the Android versions in use.

### Deploying

- [ ] API changed: `gh workflow run deploy-cloud-run.yml --ref main`, and it finished
      green.
- [ ] Web client changed: `vercel --prod` from the clean `main` checkout, after the API.
- [ ] LibreTranslate image changed: `gh workflow run deploy-libretranslate.yml --ref main`.
- [ ] New release tag: `APP_VERSION` set for production and preview, then a Vercel
      deploy.

### After deploying

- [ ] `https://lingoflow.cuplex.se/api/health` returns `{"ok":true}`. This goes through
      the Vercel rewrite, so it checks both halves.
- [ ] The site loads, sign-in works, and the footer shows the expected version.
- [ ] A lesson starts and completes.
- [ ] If the change touched it, check the feature itself. For example: the admin page's
      Word Cache counts, or a Russian exercise's word hints.
- [ ] The Cloud Run logs show no new errors:
      `gcloud run services logs read lingoflow-api --region europe-west3 --limit 50`.

## Rolling back

- **API:** send traffic back to the previous revision. It is still deployed, so this
  takes seconds:

  ```sh
  gcloud run revisions list --service lingoflow-api --region europe-west3
  gcloud run services update-traffic lingoflow-api --region europe-west3 --to-revisions <revision>=100
  ```

  The next workflow deploy sends all traffic to the new revision again. Schema changes
  are additive by convention (new tables and columns only), so older code runs against
  a newer schema.

- **Web client:** `vercel rollback`, or promote an earlier deployment in the Vercel
  dashboard.
