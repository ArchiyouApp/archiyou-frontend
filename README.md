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

`tsc --noEmit` does not currently pass across the repo (~2000 errors,
overwhelmingly in `packages/core`, which predates the strict config, plus a
resolution quirk where `tsc` cannot follow `@archiyou/core`'s exports map even
though Vite and `tsx` can). CI therefore gates on **build + tests**, not types.
Individual packages expose a `typecheck` script if you want to look. Cleaning
this up is an open issue and a good first contribution.

## Configuration

| File | Purpose |
| --- | --- |
| `apps/server/.env.example` | every server variable, with security notes |
| `apps/editor/.env.example` | the single editor build-time variable |

## Deploying

`apps/server/` contains a complete single-host deployment: Caddy (automatic
HTTPS) in front of the API, the execution worker, Redis, and the built editor
served as static files.

```bash
# 1. build the editor for a same-origin deployment
SERVER_API_BASE_URL=/api pnpm --filter @archiyou/editor build

# 2. configure the server
cp apps/server/.env.example apps/server/.env
#    set SERVER_JWT_SECRET (openssl rand -base64 48), FRONTEND_URL, REDIS_PASW

# 3. point the hostnames in apps/server/Caddyfile at your domain, then:
pnpm --filter @archiyou/server docker:prod
```

One host serves the editor and proxies `/api/*` to the server, so there is no
cross-origin traffic and CORS never applies. Database migrations run
automatically on boot. Persist the `server_data` volume — it holds the SQLite
database and the execution result cache.

Work through the checklist at the end of [SECURITY.md](SECURITY.md) before
exposing an instance to the internet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and small focused pull
requests are very welcome; please open an issue before starting anything large.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Bundled WebAssembly binaries carry their own licenses, including an LGPL-family
OpenCascade build. See [ATTRIBUTION.md](ATTRIBUTION.md) before redistributing.
