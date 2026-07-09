# Combined Archiyou server image — runs both the API (src/index.ts) and the
# execution worker (src/execution/worker.ts); the compose file picks the command.
#
# Built from the monorepo ROOT context (see docker-compose*.yml → build.context: ../..)
# because the server depends on the @archiyou/core workspace package (imported as
# source and transpiled on the fly by tsx — no separate build step).
FROM node:22-bookworm-slim

# Toolchain for native modules (better-sqlite3) + certs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /repo

# Copy the whole workspace (node_modules/dist/data excluded via .dockerignore),
# then install with the frozen lockfile so the workspace graph resolves.
COPY . .
RUN pnpm install --frozen-lockfile

WORKDIR /repo/apps/server

ENV NODE_ENV=production
EXPOSE 4000

# Default command = API (index.ts runs DB migrations on boot). The worker service
# overrides this with `pnpm worker`.
CMD ["pnpm", "start"]
