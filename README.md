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

The remaining backlog, since raw error counts are misleading:

- **`packages/core` reports 260 errors against its own config** (which sets
  `strict: false`). Running `tsc` from `apps/editor` instead reports ~2000,
  because the editor's config applies `strict` + `noUnusedLocals` to core's
  sources. Same code, different lens — the 260 is the real number.
- Most are mechanical: ~74 are BREP types (`Vector`, `Point`, `Edge`,
  `PointLike`, `AnyShape`) used without being imported, a leftover from when they
  were ambient globals. `src/annotator/AnnotatorDimensionLine.ts` alone accounts
  for 57.
- Excluding `src/modeler/brep` (the OpenCascade wrapper) from the program does
  *not* help — 260 → 236. It is pulled in transitively by imports regardless of
  `include`/`exclude`, so detaching it means changing code, not config.

Suggested order for whoever takes this on: core's mechanical missing imports
first (they are the bulk and are low-risk), then the genuine type mismatches, and
only then consider turning `strict` on for core — that is what takes 260 to
~1900. Tracked as an open issue; good first contributions welcome.

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
