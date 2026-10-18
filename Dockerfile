# API image for Google Cloud Run. Serves /api only; the web client stays on Vercel,
# which rewrites /api/* here. Build context is the repo root (npm workspaces).

FROM node:22-slim AS build
WORKDIR /app

# Workspace manifests first so the dependency layer is cached across source changes.
# client/package.json is only needed for npm to validate the workspace lockfile.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root --ignore-scripts

COPY tsconfig.base.json ./
COPY server/ server/
RUN npm run build:dist --workspace server

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# --ignore-scripts also skips building better-sqlite3's native binding. That is
# intentional: production always runs on Postgres (DATABASE_URL), and a container
# filesystem is ephemeral, so a SQLite fallback would silently lose data.
RUN npm ci --workspace server --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY server/content server/content

USER node
# Cloud Run sets PORT (8080 by default); index.ts reads it.
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
