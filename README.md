# Archiyou

**Parametric design in the browser.** Write a script, get a model — plus
drawings, cut lists, bills of material and exports. Publish a script as a
*configurator* and other people can adjust its parameters and download the
result without writing any code.

Archiyou is a scripted CAD environment: a JavaScript-flavoured modelling API on
top of two geometry kernels (a Rust/WASM mesh kernel and an OpenCascade B-rep
kernel), a Lit-based editor, and a small backend that stores scripts and serves
published configurators.

> **Status:** actively developed, pre-1.0. Expect sharp edges and breaking
> changes. Read [SECURITY.md](SECURITY.md) before self-hosting — in particular,
> script execution is not sandboxed, which is why server-side execution ships
> disabled.

## Quickstart

Requires **Node 22+** and **pnpm 10.32+** (`corepack enable` picks the right
pnpm). The mesh kernel is a git submodule, so clone recursively:

```bash
git clone --recursive https://github.com/ArchiyouApp/archiyou.git
cd archiyou
pnpm install
pnpm dev            # editor on :5173, server on :4100
```

Already cloned without `--recursive`? Run `git submodule update --init --recursive`.

No configuration is needed for development: the server creates its SQLite
database on first run, seeds a `test` / `test1234` account, and logs
password-reset and verification emails to the console instead of sending them.

You do **not** need a Rust toolchain to build — all WASM artifacts are committed.
Rust is only required to rebuild a kernel (`pnpm build:wasm`).

## Layout

```
apps/
  editor/            Vite + Lit editor SPA (the app you see)
  server/            Fastify API + BullMQ execution worker; SQLite via Drizzle
packages/
  core/              the CAD engine: modelling API, doc/drawing output, exporters
  meshup/            Rust/WASM mesh kernel (git submodule, Apache-2.0)
  ui/                shared Lit components (viewer, param widgets, editor tools)
  types/             request/response DTOs shared by editor and server
  collada-wasm/      COLLADA (.dae) writer, Rust/WASM
  gdrr2bp-wasm/      2D bin packing / nesting, Rust/WASM
plugins/             runtime-loaded editor plugins (see plugins/README.md)
tools/               offline maintenance scripts (not part of the workspace)
```

`packages/core` and `packages/meshup` are consumed **as TypeScript source**, not
as built artifacts — Vite and `tsx` compile them on the fly. That is why the
server has no build step.

## Common commands

```bash
pnpm dev                        # editor + server together
pnpm dev:editor                 # editor only
pnpm dev:server                 # server only

pnpm --filter @archiyou/editor build     # production build -> apps/editor/dist
pnpm --filter @archiyou/server test      # server unit tests
pnpm test:core                           # CAD engine test suite
pnpm --filter @archiyou/ui test          # shared-component logic tests
```

The editor's API base URL is baked in **at build time** — see
`apps/editor/.env.example`.

### A note on typechecking

**`apps/server`, `apps/editor` and `packages/ui` are fully typechecked and gated
in CI** (`pnpm --filter <pkg> typecheck:own`). `packages/core` is not yet clean,
so it stays advisory.

Getting there needed two things, worth knowing if you tackle `packages/core`:

1. `tsconfig` **`paths`** pointing `@archiyou/core/*` at core's source. `tsc`
   cannot follow core's `"./src/*": "./src/*"` exports map, and unresolved
   imports are typed as `any` — so the entire server↔core boundary was silently
   unchecked. Fixing resolution turned 36 "cannot find module" errors into 238
   real ones. Do **not** "fix" this by changing the exports map to `./src/*.ts`:
   that breaks the Vite build, because consumers also import with `.js` suffixes.
2. `"lib": ["ES2022", "DOM"]`, since shared browser/Node code in core and meshup
   references `window`/`document`/`WebAssembly` behind feature detection.

Between them those two changes exposed a handful of genuine defects that had been
invisible, all now fixed:

- a JWT payload union never extended when email-verification tokens were added
- hydrated `ScriptParam` instances assigned where plain `ScriptParamData` was
  expected, leaking internal fields into published payloads
- TypeBox unions built as `Type.Union(CONSTS.map(c => Type.Literal(c)))`. `.map()`
  widens a const array to an array rather than a tuple, and `Static<>` over a
  non-tuple union resolves to `never` — so the runtime schema was fine while every
  field typed by it (licences, fulfillment delivery, material group) was unusable
  in typed code
- four `import type` statements with a stray `../` prefix, so the types were
  silently `any` (type-only imports are erased by Vite, so the build never
  complained)
- `SmartSceneNodeData`, a type that exists nowhere, imported in three files — a
  leftover from the SmartShapes refactor. The correct `SceneNodeData` also fixed
  eleven implicit-`any` callbacks for free.

`scripts/typecheck-own.mjs <pkg>` compiles dependencies for real (so every
cross-package call is checked) but only *fails* on diagnostics in that package's
own directory. Retire it per package as core is cleaned up, then gate on `tsc`
directly.

### packages/core

Not clean yet, so it gets a **ratchet** instead of a zero-error gate
(`pnpm --filter @archiyou/core typecheck:budget`): the count may go down but
never up. Waiting for zero would have meant no gate at all. Lower the budget in
`packages/core/package.json` as you improve it; at 0, switch it to
`typecheck:own` like the others.

It is at **197**, down from 260. The ambient-globals cluster is fixed (see the
annotator commit). What is left, and why it needs judgement rather than a sweep:

- **72 in `src/modeler/brep/`** — the OpenCascade kernel. Worth knowing before
  investing: that kernel's own test suite currently fails, **16 of 19 files, 25
  tests failing vs 10 passing**. It is reachable only through the non-default
  `brep` kernel (`getOc()`). Decide whether to repair or retire it before
  polishing its types.
- **~50 in test files**, several of which call getters as functions
  (`l.type()` where `type` is a getter) — i.e. the tests have drifted from the
  API, which is consistent with them failing at runtime.
- **~75 in live mesh-path source**, mostly genuine mismatches: methods called on
  the base `Shape` that only exist on specific subtypes (`intersection`,
  `overlapPerc`, `subtract`, `center`). Each needs a decision about whether the
  type or the call is wrong — casting them away would hide real bugs.

One upstream fix is worth doing in **meshup**, not here: `ShapeCollection.name()`
is declared `name(value?: string): this | string`, so every chained
`.name('x')` yields `string | ShapeCollection` and the next call fails. Splitting
it into overloads (`name(): string` / `name(value: string): this`) removes 7 core
errors on its own — measured. The same combined getter/setter shape likely
affects its siblings.

Note the counts depend entirely on the lens: core reports 197 against its own
config (`strict: false`), but ~1900 when compiled by the editor's strict one.
Turning `strict` on for core is the last step, not the first.

## Configuration

| File | Purpose |
| --- | --- |
| `.env.example` | every server variable, with security notes |
| `apps/editor/.env.example` | the single editor build-time variable |

## Deploying

The repo-root `docker-compose.yml` is a complete single-host deployment: Caddy
(automatic HTTPS) in front of the API, Redis, and the built editor served as
static files. The BullMQ execution worker is defined there too but commented
out — uncomment the `worker` service to enable server-side execution. It lives at the root rather than in `apps/server/`
because it deploys the whole monorepo — it builds from the root context and
mounts `apps/editor/dist` and `plugins/`. (`apps/server/docker-compose.yml` is
the *development* stack: server + Redis only.)

```bash
# 1. build the editor for a same-origin deployment
SERVER_API_BASE_URL=/api pnpm --filter @archiyou/editor build

# 2. install dependencies IN THE CHECKOUT — the api container runs from the
#    mounted repo and has no node_modules of its own (see below)
pnpm install --frozen-lockfile

# 3. configure the deployment
cp .env.example .env
#    set SERVER_JWT_SECRET (openssl rand -base64 48), FRONTEND_URL, REDIS_PASW

# 4. point the hostnames in Caddyfile at your domain, then:
pnpm docker:prod          # == docker compose up -d
```

### What runs from where

| Runs from | Mounted into | Rebuild needed? |
| --- | --- | --- |
| `apps/editor/dist` | caddy `/srv/app` | no — rebuild the SPA, reload |
| `plugins/` | caddy `/srv/plugins` | no |
| `Caddyfile` | caddy `/etc/caddy` | no — `docker compose restart caddy` |
| the whole checkout | api `/archiyou` | no |

The `apps/server/Dockerfile` image contains **no application code and no
`node_modules`** — just Node, pnpm and a build toolchain. Everything it runs
comes from the bind-mounted checkout, so a deploy is
`git pull && docker compose restart api`, and `docker compose build` is
needed only when the base image itself changes.

Two things follow from that, and both bite silently if missed:

- **`pnpm install` must have been run in the checkout**, or the containers have
  no dependencies at all. The entrypoint checks for `node_modules/.pnpm` and
  exits with an explicit message rather than a deep pnpm/tsx stack.
- **`better-sqlite3` is native**, compiled by that host install and loaded
  inside `node:22-bookworm-slim`. If the host's Node major or libc differs,
  rebuild it in the image instead:
  `docker compose run --rm --entrypoint pnpm api install --frozen-lockfile`

The mount is the repo **root**, not `apps/server`: `apps/server` is a workspace
package whose `node_modules` are symlinks into `../../node_modules/.pnpm`, and
pnpm needs the root `package.json`, `pnpm-workspace.yaml` and lockfile. The
containers' `WORKDIR` is `/archiyou/apps/server`, which is what makes `pnpm
start` / `pnpm worker` resolve (from the workspace root they fail with
`ERR_PNPM_NO_SCRIPT_OR_SERVER` and `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`) and
what makes `SERVER_DATABASE_FILE=./data/archiyou.db` land in `apps/server/data`.
That directory is written by uid 1000 (`USER node`): `chown -R 1000:1000
apps/server/data` on the host if the checkout is owned by someone else.

Both `env_file:` and `${REDIS_PASW}` interpolation resolve relative to the
compose file, so the `.env` belongs at the **repo root**. A missing one is quiet,
not loud: `${REDIS_PASW}` becomes an empty string and Redis starts with
`--requirepass ""`.

The compose project is pinned to `name: archiyou`, so the `redis_data` volume
keeps the same name regardless of what the checkout directory is called. Don't
remove the pin — a rename orphans the queue's persisted state.

**The SQLite database is a plain host directory now, not a Docker volume**: it
lives at `apps/server/data/` in the checkout, via the code mount. Back that
directory up (see below) and never `git clean -x` it. The `server_data` volume
is still declared in `docker-compose.yml` but nothing mounts it — the
volume-based restore recipe further down applies only to deployments that
predate the bind mount.

One host serves the editor and proxies `/api/*` to the server, so there is no
cross-origin traffic and CORS never applies. Database migrations run
automatically on boot.

Work through the checklist at the end of [SECURITY.md](SECURITY.md) before
exposing an instance to the internet.

### Backups

`pnpm admin:backup` uploads one timestamped `tar.gz` to any S3-compatible bucket
(AWS, Hetzner, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO).

**What is in it** is the `backupTargets` list in `apps/server/src/config.ts` —
the SQLite database and the thumbnail SVGs today. That list is the authoritative
answer, and **anything not on it is treated as regenerable and will be lost on
host failure**. When a new kind of durable asset appears, add a line there; the
script needs no other change. `SERVER_BACKUP_EXTRA_PATHS=name:path,…` adds one
without touching code. Deliberately excluded: `data/cache` (regenerable execution
results) and the SQLite `-wal`/`-shm` sidecars.

The database is snapshotted with SQLite's online backup API, so this is safe to
run against a live server and needs **no manual WAL checkpoint** — the archived
file is fully checkpointed and self-contained. Every snapshot is opened and
`PRAGMA integrity_check`ed before it is uploaded, and the archive's
`MANIFEST.json` records what it contained, which migration the database matches,
and the row counts.

Configure the `SERVER_BACKUP_*` block in the root `.env` (see
[`.env.example`](.env.example)), then **verify before scheduling**:

```bash
# from the repo root
# what would be included, and where it would go
docker compose exec api pnpm admin:backup --list
# validates credentials, endpoint and checksum settings — writes nothing
docker compose exec api pnpm admin:backup --dry
# the real thing
docker compose exec api pnpm admin:backup
```

Then schedule it from the **host** crontab (`crontab -e` as the user who owns the
deploy):

```cron
MAILTO=you@example.com
17 3 * * * cd /opt/archiyou && /usr/bin/docker compose exec -T api pnpm admin:backup >> /var/log/archiyou-backup.log 2>&1
```

Four things reliably go wrong here:

- **`-T` is mandatory.** Cron has no TTY, and `exec` without it fails with
  "the input device is not a TTY".
- **`cd` into the repo root first.** Compose resolves `.env` and relative paths
  from the compose file's directory; cron's working directory is `$HOME`.
- **Use an absolute `/usr/bin/docker`.** Cron's `PATH` is minimal.
- **A target must be visible inside the `api` container.** `exec` runs in the
  already-running container, which has `env_file: .env` and the `server_data`
  volume — so `SERVER_BACKUP_*` and `data/` are already there. A new asset path
  *outside* that volume must also be mounted into the `api` service, or the
  script cannot see it.

If the stack may be down at that hour, use `run --rm -T api pnpm admin:backup`
instead — same env and volume, in a throwaway container.

Exit codes matter, because they are what reaches `MAILTO`:

| Code | Meaning |
|---|---|
| `0` | Uploaded, and any pruning completed. |
| `1` | **Backup failed — no new archive exists.** This is the one that should wake you. |
| `2` | Misconfigured (missing bucket/credentials, unusable targets). Nothing was attempted. |
| `3` | The archive is safe; only pruning failed. Look at it Monday. |

**Retention.** After a *successful* upload, archives older than
`SERVER_BACKUP_KEEP_DAYS` (default 30) are deleted. The pruner only ever touches
keys matching its own exact `archiyou-YYYYMMDD-HHmmss.tar.gz` pattern under its
own prefix, always keeps the newest `SERVER_BACKUP_MIN_KEEP` regardless of age,
never empties the prefix, and never deletes more than
`SERVER_BACKUP_MAX_DELETE` in one run. Instances sharing a bucket must use
different `SERVER_BACKUP_S3_PREFIX` values or they will prune each other.

Note the same credentials upload *and* delete, so a compromised server can erase
its own history. If your provider supports lifecycle rules, the stronger setup is
`SERVER_BACKUP_PRUNE=false` plus a bucket lifecycle rule and a write-only key.

#### Restoring

```bash
# 1. fetch and inspect — this touches nothing
aws s3 --endpoint-url "$ENDPOINT" cp "s3://$BUCKET/$PREFIX/archiyou-20260806-031500.tar.gz" .
tar tzf archiyou-20260806-031500.tar.gz
mkdir restore && tar xzf archiyou-20260806-031500.tar.gz -C restore --strip-components=1

# 2. VERIFY BEFORE TOUCHING PRODUCTION
cat restore/MANIFEST.json     # which targets it holds; `migrations` must match this code
sqlite3 restore/db/archiyou.db "PRAGMA integrity_check;"
sqlite3 restore/db/archiyou.db "select count(*) from users; select count(*) from script_versions;"

# 3. stop the stack so nothing holds the database file (from the repo root)
docker compose down

# 4. write each target back to its declared path inside the volume.
#    The volume is `archiyou_server_data`, not `server_data` — compose prefixes
#    it with the project name (`name: archiyou`). Naming it wrong here does not
#    error; docker just creates an empty volume and the restore silently no-ops.
#    Confirm with: docker volume ls | grep server_data
docker run --rm -v archiyou_server_data:/data -v "$PWD/restore:/restore:ro" alpine sh -c '
  cp /restore/db/archiyou.db /data/archiyou.db &&
  rm -f /data/archiyou.db-wal /data/archiyou.db-shm &&
  rm -rf /data/thumbnails && cp -a /restore/thumbnails /data/thumbnails &&
  chown -R 1000:1000 /data'

# 5. back up
docker compose up -d
```

Step 4's `rm -f *-wal *-shm` is not optional: the restored file is already
checkpointed, and leaving the *previous* database's WAL beside it is how a
restore turns into a second incident. `1000:1000` is the `node` user the
container runs as — a root-owned database file breaks the API on boot.

Run steps 1–2 against a scratch directory once a quarter. An untested restore is
not a backup.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and small focused pull
requests are very welcome; please open an issue before starting anything large.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Bundled WebAssembly binaries carry their own licenses, including an LGPL-family
OpenCascade build. See [ATTRIBUTION.md](ATTRIBUTION.md) before redistributing.
