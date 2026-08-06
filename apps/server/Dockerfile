# 
FROM node:22-bookworm-slim

# Toolchain for native modules (better-sqlite3) + certs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /server

# NOTE: the entire monorepo is mounted in docker-compose.yml, so the server runs from the checkout, not from the copy baked into the image. This allows code updates without rebuilding the image. The only writable path is data/, which is a named volume (see docker-compose.yml).
#COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile

RUN mkdir -p /server/data && chown -R node:node /server/data

ENV NODE_ENV=production
EXPOSE 4100

# Drop root. The worker executes user-authored scripts with no sandbox (see
# config.execution), so running that as uid 0 makes an already-serious hole
# worse. Everything the process writes lives under data/, owned above.
USER node

# Default command = API (index.ts runs DB migrations on boot). The worker service
# overrides this with `pnpm worker`.
CMD ["pnpm", "start"]
