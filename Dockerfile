# syntax=docker/dockerfile:1
#
# Production image for apps/web — the server piece of Decal (kiosk
# dashboard + /m mobile web routes). Doesn't touch apps/mobile at all;
# the Capacitor native app is built separately, by hand, on a Mac (see
# apps/mobile/README.md) — nothing to containerize there.
#
# Three stages:
#   deps    — resolve the whole pnpm workspace from the lockfile. Every
#             workspace package.json needs to be present for this, even
#             ones this image doesn't run (apps/mobile's Capacitor deps in
#             particular) — pnpm-lock.yaml references all of them, and
#             `--frozen-lockfile` fails if one's missing.
#   build   — copy in the actual source, generate the Prisma client (this
#             is what downloads the query-engine binary for this image's
#             platform), and build @decal/web.
#   runner  — the image that actually ships. It's the full build stage
#             (all node_modules, not just @decal/web's production ones) —
#             heavier than Next.js's "standalone" output, but it means the
#             Prisma CLI is right there to run migrations on startup with
#             no extra wiring. For a single home-server deployment, that
#             tradeoff is worth it.

FROM node:20-bookworm-slim AS base
# Prisma's SQLite query engine needs libssl at both generate-time and
# run-time on Debian-based images — without this you'll hit an
# "unable to open library" error the first time a query actually runs.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM base AS build
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @decal/db generate
# A placeholder, not a real connection — SQLite's client only needs to
# *construct* successfully for `next build`'s page-data-collection step to
# pass, it never opens the file. The real path comes from docker-compose's
# env_file at container startup and overrides this completely.
ENV DATABASE_URL="file:./build-placeholder.db"
RUN pnpm --filter @decal/web build

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
