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

# Copy the whole workspace (node_modules/dist/data/target excluded via
# .dockerignore), then install with the frozen lockfile so the workspace graph
# resolves. Owned by the unprivileged `node` user that ships with the base image
# so the runtime does not need write access as root.
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile

# Runtime data dir (SQLite + the execution result cache). Created up front and
# owned by `node`, because the container no longer runs as root and the volume
# mount inherits this ownership.
RUN mkdir -p /repo/apps/server/data && chown -R node:node /repo/apps/server/data

WORKDIR /repo/apps/server

ENV NODE_ENV=production
EXPOSE 4100

# Drop root. The worker executes user-authored scripts with no sandbox (see
# config.execution), so running that as uid 0 makes an already-serious hole
# worse. Everything the process writes lives under data/, owned above.
USER node

# Default command = API (index.ts runs DB migrations on boot). The worker service
# overrides this with `pnpm worker`.
CMD ["pnpm", "start"]
