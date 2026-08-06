#!/bin/sh
# The image ships no code — the monorepo checkout is bind-mounted at /archiyou
# (see apps/server/Dockerfile). When that mount is missing or the host never ran
# `pnpm install`, the failure surfaces as an opaque pnpm/tsx error several layers
# down. Check the two preconditions up front and say which one broke.
set -e

REPO=/archiyou

if [ ! -f "$REPO/apps/server/package.json" ]; then
  echo "FATAL: $REPO/apps/server/package.json not found." >&2
  echo "  The monorepo checkout is not mounted at $REPO." >&2
  echo "  docker-compose.yml must bind-mount the repo root:  - ./:$REPO" >&2
  exit 1
fi

if [ ! -d "$REPO/node_modules/.pnpm" ]; then
  echo "FATAL: $REPO/node_modules is missing or not a pnpm install." >&2
  echo "  Dependencies come from the mount, so install them in the checkout:" >&2
  echo "    pnpm install --frozen-lockfile        # on the host" >&2
  echo "    docker compose run --rm --entrypoint pnpm api install --frozen-lockfile" >&2
  exit 1
fi

exec "$@"
