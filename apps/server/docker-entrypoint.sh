#!/bin/bash
# bash, not sh: the stamp check below uses `-nt`, which is a bash test operator.
# The image ships no code — the monorepo checkout is bind-mounted at /archiyou
# (see apps/server/Dockerfile), so node_modules comes from the mount too.
#
# Boot sequence:
#   1. verify the mount is actually there (otherwise every later error is opaque)
#   2. install dependencies if they are missing or stale
#   3. exec the real command (pnpm start / pnpm worker)
set -e

REPO=/archiyou
STAMP="$REPO/node_modules/.archiyou-install-stamp"

if [ ! -f "$REPO/apps/server/package.json" ]; then
  echo "FATAL: $REPO/apps/server/package.json not found." >&2
  echo "  The monorepo checkout is not mounted at $REPO." >&2
  echo "  docker-compose.yml must bind-mount the repo root:  - ./:$REPO" >&2
  exit 1
fi

# Reasons to install. Missing store = never installed. Stamp older than the
# lockfile = a `git pull` changed dependencies since the last install, which
# would otherwise surface much later as a missing or wrong-version module.
need_install=''
if [ ! -d "$REPO/node_modules/.pnpm" ]; then
  need_install='node_modules is missing'
elif [ ! -f "$STAMP" ] || [ "$REPO/pnpm-lock.yaml" -nt "$STAMP" ]; then
  need_install='pnpm-lock.yaml changed since the last install'
fi

if [ -n "$need_install" ]; then
  echo "==> Installing dependencies ($need_install)" >&2

  # Needs write access to the mounted checkout. The container runs as uid 1000
  # (USER node); if the checkout is owned by root on the host this fails, and
  # the fix is on the host, not here.
  if ! pnpm install --frozen-lockfile --dir "$REPO"; then
    echo "FATAL: pnpm install failed." >&2
    echo "  If it could not write, the checkout is not owned by uid 1000:" >&2
    echo "    sudo chown -R 1000:1000 <checkout>" >&2
    echo "  Or install once by hand, then restart:" >&2
    echo "    docker compose run --rm --user 0 --entrypoint pnpm api install --frozen-lockfile" >&2
    exit 1
  fi

  touch "$STAMP"
  echo "==> Dependencies ready" >&2
fi

exec "$@"
