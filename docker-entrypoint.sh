#!/bin/sh
# Runs once per container start, before the server comes up. `migrate
# deploy` (as opposed to `migrate dev`) only applies migrations that are
# already committed to packages/db/prisma/migrations — it never generates
# new ones or prompts for anything, which is what makes it safe to run
# unattended on every deploy.
set -e

echo "[decal] Applying database migrations..."
pnpm --filter @decal/db exec prisma migrate deploy

echo "[decal] Starting server..."
exec pnpm --filter @decal/web start
