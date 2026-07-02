# Plugin architecture for archiyou-web (guest model)

## Context

archiyou-web is going open source, and the goal is to let people (and LLMs) build advanced,
often AI-generated extensions on top of it. Three subsystems stay shared and authoritative:
the **scripting engine**, the **3D viewer**, and the **parameters-as-input-schema** system.

**Decision (revised): the plugin model is a Figma-style _guest_ model.** archiyou is always
the fixed host application (editor codebox + host-owned viewer + toolbar + param panel);
a plugin is a **guest** that contributes to a bounded set of extension points — it does *not*
replace the app shell. Bespoke, public-facing products are handled by a **separate
embed/publish path**, not by a shell-replacement plugin.

Why guest fits archiyou: the app is *already* a strong host (an editor with a viewer and
panels), exactly Figma's situation. The earlier "AI generates the app shell" thesis fought
that strength and created the hardest problems (a portable viewer, arbitrary layout,
sandboxing a whole shell). The guest model removes all of it: a small, documented,
versionable surface that is far easier to sandbox and for an LLM to target.

Distribution is **runtime URL/module loading** (in the spirit of the existing
`$component('https://…')`). Dev environment is **both** an in-editor open-folder preview
(inner loop) and an `ay` CLI/headless host (outer loop / CI).

The architecture is well-positioned: the core is a stateless Comlink worker exposing
`init()` + `execute(request) → result` (`apps/editor/src/workers/archiyou.core.worker.ts`),
params are TypeBox/JSON-Schema (`packages/core/src/execution/ScriptParam.ts`), the scope is
assembled by a plain `Object.assign` (`Runner.ts:246`), and the viewer is a self-contained
Lit element. The work is mostly drawing a stable boundary and adding a loader + dev tooling.

---

## Mental model

```
┌──────────────── archiyou HOST APP (fixed: shell, codebox, viewer, toolbar) ─────────────┐
│                                                                                          │
│   FIXED EXTENSION POINTS a guest plugin contributes into:                                │
│     • param menu     → UI for the main script's $PARAMS (its input schema)               │
│     • toolbar tools   → panels + buttons added to the existing toolbar                    │
│     • main + component scripts → the plugin's geometry logic ($component)                 │
│     • core modules    → worker-scope globals incl. WASM (TRUSTED only)                    │
│                                                                                          │
│   Shared primitives stay host-owned: engine (worker), viewer (WebGL), param schema.      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
        │ plugins loaded at runtime (URL) or opened as a local folder in the editor
        ▼
   A separate EMBED / PUBLISH path renders a finished plugin (main script + schema + tools)
   in a minimal host (engine + viewer + schema-driven param menu) → public products
   (the configurator reborn as an embedding target, NOT a shell-replacement plugin).
```

A **plugin** is a directory (Figma-style) with a manifest, scripts, UI parts, and optional
worker modules. The host never hands the plugin engine internals — it exposes the extension
points and a typed bridge (`archiyou`), mounts the guest's contributions into its own shell, and
owns execution + rendering.

---

## The fixed extension points (the contract)

1. **Param menu** — a flattened HTML part that treats the **main script's `$PARAMS` as the
   input schema** and behaves like a schema-driven form: **schema in → values object out →
   submit**. `archiyou.onSchema(schema => …)` delivers the schema; the menu renders it,
   collects a values object, and calls `archiyou.submit(values)`; archiyou validates against
   the schema (`ScriptParam.validateValue`) and executes. The menu owns *rendering* +
   *collecting* + *when to submit* (debounced-live or on a button); it never touches run
   mechanics (no per-param `setParam`, no implicit auto-run coupling). May optionally
   author/extend params (emit `ScriptParamData`, re-validated by `Script.fromData()`).
   Replaces the default `<param-menu>` for that plugin.
2. **Toolbar tools** — each a flattened part mounted as a **panel + a button on the existing
   toolbar** (not a plugin-owned toolbar). Reads `result`, calls
   `archiyou.generate(selectors)`/`archiyou.catalog()`, and drives the host viewer via a command API
   (select / frame / highlight). This is the generalization of today's tool panels
   (`packages/ui/src/editor/tools/*-tool.ts` + the declarative `outputs[]` +
   `_executeToolOutputs` merge at `editor.ts:273`).
3. **Main + component scripts** — one **main script** (declares `$PARAMS` = the input
   schema) plus `$component` scripts, riding the existing
   `RunnerComponentImporter`/`linkComponentScripts` path. No new engine concept.
4. **Core modules** — worker-scope globals (incl. WASM), **trusted tier only** (see below).

There is deliberately **no `appShell` contribution** — bespoke chrome is the embed path's job.

---

## Execution modes: `script` vs `session`

A plugin declares one execution model in its manifest (`mode`, default `script`). This gives a
single source of truth *per plugin* instead of trying to be both declarative and mutable at once.

- **`script` (default):** the functional model — `params → run → outputs`, fresh scope, re-run.
  Truth = the script. Drives the param-menu auto-run loop, caching, embed, AI generation.
- **`session`:** no authored script; the plugin streams imperative commands
  (`archiyou.exec('rect(100,100)')`) into a **persistent scope** and reads results back — Figma-like,
  stateful, incremental. Truth = an **append-only command log**; the scene is `replay(log)`.

**Why `session` keeps the functional guarantees.** Because the log is the artifact (not a
hidden mutable blob): **undo** = truncate the log, **persistence** = save the log,
**caching/reproducibility** = hash the log. The only rule: commands must be fully captured in
the log (no un-recorded randomness/external state) — the standard feature-tree discipline.

**It's one engine, not a fork.** Session mode reuses the existing Runner eval (`Runner.ts:869`):
*skip the per-run reset, keep the scope alive across `archiyou.exec` calls, record each command
snippet.* So `script` = whole file / fresh scope / re-run; `session` = incremental snippets /
persistent scope / append-only log — they converge at the bottom (both eval scope-constrained
code). Implementation = an execution flag + a persisted session scope + a command recorder.

**Trust:** session commands eval in the *same constrained scope* as scripts, so session mode is
**as sandbox-safe as script mode and equally AI-generatable** — it does *not* force the trusted
tier (only `coreModules` do). Host UX differs by mode: `script` → param menu + auto-run;
`session` → an interactive command surface (a present param menu feeds the command generator
rather than triggering re-runs).

---

## Shared primitives & the SDK surface (`@archiyou/sdk`)

A thin package re-exporting a curated, versioned API — the only surface a plugin touches
(today apps reach into deep `@archiyou/core/src/...` paths).

- **Execution** — promote `apps/editor/src/services/execution-service.ts`
  (`runScript`, `warmupWorker`) + the Comlink loader unchanged. Stable boundary.
- **Viewer** — **stays host-owned; NOT made portable.** Instead of the risky decoupling of
  `model-viewer.ts`, expose a small **viewer command API** (`select(path)`, `frame()`,
  `highlight()`, plus selection/handle events) that tools drive over the bridge. Far less
  work than making the viewer mountable in arbitrary shells.
- **Params** — `ScriptParam`'s JSON Schema is already the portable input schema. The
  param-menu contract is deliberately minimal: **`onSchema` (schema in) + `submit(values)`
  (values out)**; archiyou centralizes validation (`ScriptParam.validateValue`) + execution,
  so a menu is just a form and never touches run mechanics. Keep a **`ParamWidgetRegistry`**
  (refactor the type-switch in `packages/ui/src/params/param-menu.ts` into a registry) so both
  the default menu and custom ones can register widgets; add `paramSuggest` (Figma-style
  host-rendered input + dynamic suggestions).
- **Outputs** — `getOutputCatalog(result)` (from `result.meta.metrics/tables/pipelines`) +
  `generateOutputs(selectors)` (promoted from `_executeToolOutputs`).
- **Host context / `archiyou` bridge** — the guest's only interface: `onSchema`,
  `submit(values)`, `onResult`, `selection`, `generate`, `catalog`, viewer commands; in
  `session` mode also `archiyou.exec(cmd)`, `archiyou.query(sel)`,
  `archiyou.session.reset()/undo()`; and two persistence stores — `archiyou.userStorage`
  (per-user KV; Figma `clientStorage`) and `archiyou.scriptData` (state stashed in `ScriptData`
  metadata so it travels with the project; Figma `setPluginData`).

---

## Plugin directory & manifest

Figma's `manifest.json` + `code` + `ui.html`, mapped to archiyou (scripts + parts + modules).
A plugin is a directory served at a base URL; every path in the manifest is **relative to that
base**.

### Directory layout

```
shelving/
  manifest.json              # the only required file; describes everything below
  scripts/                   # geometry logic (archiyou script language)
    main.ts                  #   entry script — declares $PARAMS (the input schema)
    bracket.ts               #   $component part, referenced as $component('bracket')
    joinery.ts
  ui/                        # flattened HTML parts (self-contained, sandboxed)
    param-menu.html          #   → the param-menu slot
    tools/
      bom.html               #   → a toolbar tool
      cutlist.html
  modules/                   # OPTIONAL, TRUSTED — worker-scope globals (incl. WASM)
    nurbs.js
    nurbs.wasm
    nurbs.d.ts               #   types for codebox autocomplete
  assets/                    # OPTIONAL — icons/images referenced by manifest or parts
    icon.svg
  README.md
```

Conventions: only `manifest.json` + `mainScript` are required. Component scripts are referenced
inside the plugin by **file stem** (`$component('bracket')`) and get namespaced under the
plugin `id` on publish (`shelving/bracket`). A single-file plugin may inline the manifest as
`<script type="application/json" id="archiyou-manifest">…</script>` inside its one part.

### `manifest.json` — full spec

```jsonc
{
  // ── Identity ──────────────────────────────────────────────
  "id": "shelving",                    // required · kebab-case · unique (namespaced author/id on publish)
  "name": "Shelving System",           // required · human-readable
  "version": "0.1.0",                  // required · semver
  "description": "Parametric shelving.",
  "author": "archiyou",
  "license": "MIT",
  "icon": "assets/icon.svg",           // relative path or host icon name

  // ── Compatibility ─────────────────────────────────────────
  "engine": "^1",                      // required · SDK/host API semver range (hard gate)
  "mode": "script",                    // optional · "script" (default) | "session"  (see Execution modes)

  // ── Scripts (geometry logic) — script mode ────────────────
  "mainScript": "scripts/main.ts",     // required in script mode · declares $PARAMS = the input schema
                                       //   (omitted in session mode — the plugin streams archiyou.exec commands)
  "scripts": [                         // optional · $component parts (linked via linkComponentScripts)
    "scripts/bracket.ts",
    "scripts/joinery.ts"
  ],

  // ── UI contributions (flattened HTML parts) ───────────────
  "paramMenu": "ui/param-menu.html",   // optional · replaces the default param menu for this plugin
  "tools": [                           // optional · each adds a toolbar button + panel
    {
      "id": "bom",                     // required · unique within plugin
      "name": "Bill of Materials",     // required · button/panel label
      "icon": "table",                 // optional · host icon name or assets/ path
      "ui": "ui/tools/bom.html",       // required · the flattened part
      "outputs": ["default/tables/*/xlsx"], // optional · declarative lean pre-fetch (merge pattern)
      "placement": "right",            // optional · left | right | bottom  (default right)
      "exclusive": false               // optional · takes the full panel region when open
    }
  ],

  // ── Worker-scope modules (TRUSTED ONLY) ───────────────────
  "coreModules": [                     // optional · presence ⇒ plugin requires the trusted tier
    {
      "name": "nurbs",                 // required · script-scope global (namespace-guarded)
      "url": "modules/nurbs.js",       // required · ES module; self-resolves its .wasm via import.meta.url
      "types": "modules/nurbs.d.ts",   // optional · fed into codebox completions
      "capabilities": ["modeler", "metrics"] // required · granted slice of ScopeModuleContext
    }
  ],

  // ── Permissions ───────────────────────────────────────────
  "permissions": {
    "networkAccess": { "allowedDomains": ["api.suppliers.example"] }, // enforced via iframe CSP connect-src
    "capabilities": ["download", "storage"] // download | storage | network
  }
}
```

### Field reference

| Field | Req | Type | Meaning |
|---|---|---|---|
| `id` / `name` / `version` | ✔ | string | identity; `version` is semver, `id` kebab-case |
| `engine` | ✔ | semver range | host-API compatibility gate (`^1`) |
| `mode` | – | `"script"｜"session"` | execution model (default `script`); see Execution modes |
| `mainScript` | ✔* | path | entry script; its `$PARAMS` **is** the input schema (*required in `script` mode) |
| `scripts[]` | – | path[] | `$component` parts, referenced by file stem |
| `paramMenu` | – | path | flattened part for the param-menu slot |
| `tools[]` | – | `{id,name,ui,icon?,outputs?,placement?,exclusive?}` | toolbar button + panel |
| `coreModules[]` | – | `{name,url,types?,capabilities}` | worker-scope globals; **forces trusted tier** |
| `permissions` | – | `{networkAccess?,capabilities?}` | Figma-style; enforced at the sandbox bridge |

### Conventions & derivation

- **Path resolution:** all manifest paths are relative to the plugin base URL; module `.wasm`
  resolves relative to its own `.js` via `import.meta.url`.
- **Trust tier is derived, not declared:** any `coreModules` entry ⇒ the plugin needs the
  **trusted tier**; a plugin with only scripts + parts is **sandbox-tier** (safe, AI-generatable).
- **Typed authoring mirror:** `definePlugin({...})` is the TS form of the same manifest (1:1
  fields), used for typed authoring, tests, and the build-time trusted path; `manifest.json` is
  the runtime-loadable form. `ay build` can emit one from the other.

### Loader (`PluginManager`)

Fetch manifest → validate against the JSON Schema (+ `engine` semver gate) → link `scripts` on
the Runner → mount `paramMenu` + `tools` into the host slots → (trusted only) register
`coreModules`. A registry index (`{id, url, version, hash}`) plays the role the script Library
plays for `$component`; lockable by hash for reproducibility.

---

## Flattened HTML parts & the `archiyou` bridge

Figma's `__html__` model as the UI unit for the two guest slots (param menu, tools): each part
is **one self-contained HTML file** (inline CSS + JS), mounted as
`<iframe sandbox="allow-scripts" srcdoc=…>` and driven over `postMessage`. Single file, no
build, no module graph — readable, diffable, auditable before it runs (a real win for
AI-generated parts). This *is* the sandbox tier.

**`archiyou` bridge** (optional sugar over raw `parent.postMessage`):
```js
archiyou.onSchema(schema => renderForm(schema))     // main script's $PARAMS = the input schema
const result = await archiyou.submit(values)         // values object → archiyou validates + executes
archiyou.onResult(result => …)                        // pushed to every part on each run
archiyou.generate(selectors) → Promise<ScriptOutputData[]>
archiyou.catalog() / archiyou.download(out) / archiyou.viewer.select(path) / archiyou.storage.get/set
// session mode: archiyou.exec(cmd) / archiyou.query(sel) / archiyou.session.reset()/undo()
```

Two host-owned boundaries keep this clean:
- **The viewer is a host region** — parts never render WebGL; they *drive* it over the bridge.
- **No `@archiyou/ui` inside the iframe** — the host injects base **design tokens** (and a tiny
  optional web-component helper) into every `srcdoc` so plain parts look native without
  coupling to the component graph. Granularity = one file per *panel*, not per row.

Comms ride the existing structured-clone-safe contract; `permissions.networkAccess` is enforced
via the iframe CSP `connect-src`.

---

## Core modules & bundled libraries (incl. WASM) — runner-scope extensions

The most privileged contribution: a plugin adds a **module to the runner scope** — a new global
namespace for scripts (e.g. `nurbs.surface(...)`), same shape as `modeler`/`docs`. It runs
**inside the trusted worker with full privilege**, so it is **trusted-tier only**.

**The seam already exists:** `Runner._addModulesToScopeState` (`Runner.ts:246`) builds `state`
via `Object.assign(state, { console, modeler, docs, calc, … })`. The worker already runs
Rust/OCCT WASM (`meshup`, `gdrr2bp-wasm`, `?url` assets at `Runner.load()`), so plugin WASM is
the *existing kernel-loading pattern opened to plugins*.

**Contract — a `load`/`setup` lifecycle split** (so async WASM init stays out of the synchronous
script-facing API, mirroring `Runner.load()` vs `execute()`):
```ts
defineScopeModule({
  name: 'nurbs', version: '0.1.0', engine: '^1', capabilities: ['modeler'],
  async load(host) { this.lib = await initWasm(new URL('./nurbs.wasm', import.meta.url)) }, // once
  setup(ctx)       { return { surface: (pts) => ctx.modeler.fromMesh(this.lib.fit(pts)) } }, // per run
  dispose()        { this.lib?.free() },
})
```
- **Hook:** `runner.registerScopeModule(mod)` → `state[mod.name] = mod.setup(ctx)` per fresh
  scope. Worker API `await registerCoreModule(url)` → `import(url)` → `await mod.load(host)`
  before the first `execute()`. Pass the **URL, not a function** (Comlink clone limit).
- **`ScopeModuleContext`** = curated capability surface (`modeler`, `docs`, `calc/metrics`,
  `console`, `units`, read-only `params`, `registerOutput`) — modules reach the engine *through
  ctx*, never by importing core internals. `import.meta.url` self-resolves WASM assets.
- **Integration seam:** the module *computes*, then bridges results into `ctx.modeler` /
  `ctx.registerOutput` (mesh → scene → GLB). The viewer stays host-owned.

**Where WASM lives decides trust:**

| Case | Runs in | Privilege | AI-generated? |
|---|---|---|---|
| Core-module WASM | trusted worker, beside the kernel | full; talks to `ctx.modeler` | ❌ trusted only |
| UI-part WASM | the part's sandboxed iframe | isolated, no engine/host access | ✅ safe any tier |

**Trust/packaging:** trusted tier only, hash-pinned (JS + `.wasm`, SRI-style), CORS to fetch;
CSP `wasm-unsafe-eval` granted only on the controlled worker; capabilities declared; additive
memory + single worker thread (parallelism → nested worker, advanced); optional registry cache
by hash. **Decision rule:** reusable domain geometry → `$component` scripts (safe, any tier,
AI-friendly); a native primitive/solver (incl. WASM) → core module (trusted, reviewed, pinned).

*Hardened future option:* untrusted core modules in a nested worker / QuickJS-in-WASM with a
capability membrane + serialized modeler bridge — sacrifices sync ergonomics, so a v2.

---

## Trust tiers (summary)

| Contribution | Runs in | Isolation | AI-generated? |
|---|---|---|---|
| Flattened part (param menu, tools) | sandboxed iframe | hard (postMessage + CSP) | ✅ |
| `$component` main/component scripts | worker scope | constrained to injected API | ✅ |
| Core module (worker global, WASM) | worker scope | none — full privilege | ❌ trusted only |
| Viewer / shell | host | host-owned, never plugin code | n/a |

---

## Developer experience — archiyou editor *as* the plugin IDE (+ CLI)

**Existing today:** the script language (`modeler`/`$PARAMS`/`$component`), worker execution,
the viewer, headless `@archiyou/core` (the publish server runs it), the vitest
`test:runner`/`test:docs` harness. **Proposed plugin layer:** manifest, `archiyou` bridge, the
in-editor plugin mode, the `ay` CLI, registries.

**Inner loop — open the plugin folder in the archiyou editor.** *File → Open plugin folder* →
the editor loads the manifest, shows the **main script in the codebox**, mounts the plugin's
**param menu + tools** into the host slots, and runs it live against the real worker with the
host-owned viewer. Edit the main script → re-run + schema reflows; edit a part → that iframe
re-mounts. The author develops the plugin *inside the finished app it will live in* — something
**Figma cannot do** (Figma has no in-app code editor). This is the standout DX of the design.

**In-editor preview: loading & live reload.** Opening a folder in the browser uses one of:
- **`showDirectoryPicker()`** (File System Access API) → a persistent `FileSystemDirectoryHandle`
  (traversable, re-readable, stashable in IndexedDB). Best DX, but **Chromium-only** and needs a
  secure context + user gesture.
- **`<input webkitdirectory>` / folder drag-drop** → a one-time snapshot `FileList`; cross-browser
  but no write-back and must re-pick to refresh. The no-API fallback.

Live update — the browser has **no native file-watch** for handles, so three routes (ascending):
1. *Poll* the handle (`File.lastModified` diff, ~0.5–1s) — fine for a handful of files.
2. *`FileSystemObserver`* — real change events on FS Access handles, where available (Chromium).
3. ***`ay dev` + WebSocket HMR*** — the CLI OS-watches the folder (chokidar) and *pushes* changes to
   the editor, Vite-style: cross-browser, push-based, instant. **Primary path** — and the same
   `ay dev` server used for CI, so the inner/outer loops converge; `showDirectoryPicker` + poll is
   the no-CLI Chromium fallback.

Reload is **granular** and the engine worker stays warm, so it feels instant:

| File changed | Reload action |
|---|---|
| a UI part (`param-menu.html`, `tool.html`) | re-mount just that `srcdoc` iframe |
| the main / component script | re-run → schema reflows, viewer updates |
| a core module (trusted) | `dispose()` → re-`import()` → re-register |
| `manifest.json` | re-read → re-wire the slots |

**Outer loop — `ay` CLI + headless tests (for CI/automation).**
- Import two packages: **`@archiyou/sdk`** (types + test doubles; the only dep a UI-only plugin
  needs) and **`@archiyou/core`** (only when a test executes against the real Runner). Ship an
  ambient script-scope `.d.ts` so `.ts` scripts type-check/autocomplete outside the app.
- **Three test strategies, one per decoupled contribution type:**
  1. *Scripts* — headless real engine (the `test:runner` harness): `new Runner()` →
     `linkComponentScripts` → `execute({script, params, outputs})`; assert on `outputs`,
     `state.managedParams`, `meta.metrics`; snapshot GLB/SVG.
  2. *Core modules* — unit against a **mock `ScopeModuleContext`** (WASM via `import.meta.url`,
     supported in Node); or integration on a real Runner.
  3. *UI parts* — `@archiyou/sdk/testing` `createMockHost()` plays the `archiyou` host side;
     mount the part in jsdom/Playwright, assert on `submit(values)`/`generate` calls. No app,
     no worker.
- **`ay dev`** serves a folder into a stripped headless host for automation; **`ay validate`**
  checks the manifest schema + `engine` gate; **`ay build`** bundles parts/modules and emits
  content hashes for the registry pin. CI = `pnpm typecheck && pnpm test && ay validate && ay build`
  — no browser app required.

---

## Embed / publish path (separate track — bespoke products)

Distinct from the plugin *authoring* system: a finished plugin's **main script + param schema +
tools** are rendered in a **minimal embed host** (engine + viewer + the schema-driven param
menu) with its own chrome. The **configurator app is reborn as this embedding target**
(`apps/configurator/*`), reusing the SDK primitives — *not* a shell-replacement plugin. This
gives public-facing products without adding shell-composition complexity to the plugin model.

---

## Editor plugin mode, "App" preview & plugin publishing (refinement)

Fleshes out roadmap steps 4 & 7. Today a plugin runs on a *separate* `/plugin` route
(isolated from editor state). The goal: open a plugin **really in the editor** — all menus,
the main script in the codebox, the plugin's own param menu + tools — clearly flagged; make
the left-bar preview button show the **app**; and design how to publish a whole plugin
directory (not just one script).

Decisions: **isolated plugin session** · **scripts-only editing** · **design publishing now,
build editor first**.

### Part A — In-editor plugin mode (BUILD)

Reuses the real editor shell (`apps/editor/src/pages/editor.ts`) but scopes it to the plugin.

- **State** — new `apps/editor/src/state/plugin-mode.ts`: `pluginMode` signal
  `{ plugin: LoadedPlugin; dirHandle? } | null`; `pluginScripts` (main + `$component` scripts as
  `Script[]`, **isolated — never added to the `scripts` collection or localStorage**);
  `pluginActiveScriptId` (which one is in the codebox, default main); `enterPluginMode()` /
  `exitPluginMode()`. Because the personal `editorScript`/`scripts` signals are untouched,
  exit just clears `pluginMode` and the user's work reappears.
- **Entry** — Plugins ▸ Add plugin: `loadPluginFromDirectory` → `enterPluginMode(...)` and
  **stay on `/editor`** (change today's `_addPluginFromFolder` which navigates to `/plugin`).
- **Execution** — reuse `PluginManager`; extend it to hold the working set (main + components)
  and pass the components as `componentScripts` (+ `linkComponentScripts`) on each run so
  multi-script plugins resolve `$component`. Codebox edits update the active working-set script
  and trigger `PluginManager.run(lastParams)`.
- **Render branch** in `editor.ts` when `pluginMode` is set (the panels at `editor.ts:63-79`):
  the left panel swaps `<param-menu>` → the plugin's `<plugin-part-frame .src=paramMenuHtml>`
  (submit → `PluginManager.run`), the codebox binds to the active plugin script's code (with a
  small plugin-script switcher), plugin `tools[]` mount (reuse `page-plugin`'s toggle+panel),
  and `<model-viewer>` stays (PluginManager writes its signals). A **banner** flags
  `Plugin: <name>` with an **Exit** button.
- **Scripts-only editing** — the codebox edits a plugin script's archiyou `code`; live re-run.
  Writing edits back to the on-disk `.js` is an **explicit, opt-in "Save to plugin"** action
  (via the `dirHandle`, requesting read-write on demand). HTML parts + manifest are read-only
  in this build.

Reuse: `PluginManager`, `plugin-part-frame`, `plugin-loader`, `model-viewer`, the existing
Plugins menu + `plugin-session`.

### Part B — "App" preview button (BUILD)

The left-bar **Configurator** button (`main-menu.ts` `_openConfigurator` → `<page-configurator>`
dialog) becomes **context-aware**: in `pluginMode` it reads **"App"** and opens a dialog
previewing the plugin app (its custom param menu + tools + viewer); otherwise it stays
"Configurator" (single script). Preview = a reusable `<plugin-app>` component (extract the
plugin-rendering half of `page-plugin.ts`) mounted from the already-loaded `pluginMode.plugin`.
Simple, because the runtime already exists.

### Part C — Publishing a plugin app (DESIGN / study)

The unit of publish is a **plugin app definition** — the whole directory serialized:
```ts
interface PluginAppDefinition {
  manifest: PluginManifest;          // id, version, author, …
  files:   Record<string, string>;   // relative path → text (scripts .js, ui/*.html, manifest.json)
  assets?: Record<string, string>;   // relative path → base64 (icons/images)
}
```
- **Client** — `apps/editor/src/services/publish-app-service.ts`: read every file of the loaded
  plugin (from `dirHandle` or URL) into the definition and POST it (reuse the `services/api.ts`
  HTTP client + `auth-service` JWT).
- **API** — new `POST /admin/publish-app` (JWT) on `apps/publish` (`ApiServer.ts`): store under
  `{LIBRARY_PATH}/__apps__/{author}/{id}/{version}/`, writing each file **verbatim** (scripts
  `.js`, parts `.html`, `manifest.json`). Mirrors the existing `{author}/{name}/{version}`
  Library layout (`Library.ts`), namespaced `__apps__`, immutable per version — fills the
  `/admin/publish` TODO stub for the multi-file case.
- **Serving** — `GET /apps/:author/:id/:version/*` serves those files, so a published app is
  loadable by the **same `loadPluginFromUrl('/apps/author/id/version')`**. Publish = store files;
  run = load by URL — no new runtime.
- **Public app** — the reborn **embed host** (`apps/configurator/*`) `loadPluginFromUrl`s the
  published app and renders its custom UI + viewer client-side (worker execution, like the
  editor). The in-editor "App" preview (Part B) is its twin.
- **Trigger** — in `pluginMode` the `publish` menu-action publishes the *app* (whole dir); in
  normal mode it stays single-script "Publish as configurator" (context-aware, like the button).
- *Optional later:* server-side execution + cache of a published app's main script (via
  `ExecutionManager` + the per-script cache) — not needed for v1 (apps run client-side).

### Build order & representative files

1. **Plugin mode** — `apps/editor/src/state/plugin-mode.ts` (new), `apps/editor/src/pages/editor.ts`
   (render branch + enter/exit + save-to-plugin), `apps/editor/src/plugins/PluginManager.ts`
   (working set + `componentScripts`), a `Plugin: <name>` banner element.
2. **App button** — `packages/ui/src/editor/main-menu.ts` (App vs Configurator), new
   `apps/editor/src/pages/plugin-app.ts` (extracted from `page-plugin.ts`).
3. **Publishing** (after 1–2) — `apps/editor/src/services/publish-app-service.ts` (new),
   `apps/publish/src/ApiServer.ts` + `Library.ts` (`/admin/publish-app`, `/apps/...`),
   `apps/configurator/*` reborn as the embed host.

### Verification

- Plugins ▸ Add plugin → pick `plugins/shape-picker` → editor enters plugin mode: banner
  "Plugin: Shape Picker", codebox shows the main script, the custom dropdown param menu on the
  left, the Export tool available, viewer renders the shape. Edit the code → live re-run.
  Exit → the personal script reappears unchanged (isolation).
- The left-bar button reads **"App"** and opens a dialog previewing the plugin's custom UI +
  viewer.
- (Publishing, after build) publish `shape-picker` → `GET /apps/archiyou/shape-picker/0.1.0/manifest.json`
  returns the manifest; `loadPluginFromUrl` of that base renders the app in the embed host.

---

## Prior art: Figma — now aligned (guest), remaining deltas

We now adopt Figma's guest model, so the philosophies converge. **Borrowed:** permission
manifest (`networkAccess`/`capabilities`), the `ui.html` sandboxed-iframe UI, host-owned param
input + suggestion API, two-tier persistence (`clientStorage` + `setPluginData`), the plugin
**directory structure**, and import-from-manifest dev. **Remaining differences (our
advantages):**
- *Functional re-run vs mutable document* — `params → run → outputs` is reproducible and
  conflict-free (and far more tractable for AI generation). Even our imperative `session` mode
  stays reproducible: it's an append-only command log (replayable), not a mutable blob.
- *Async worker vs sync god-object* — we avoid the painful async migration Figma had to do.
- *archiyou is the IDE* — open-folder preview edits the main script in-app; Figma authors live
  in VS Code and re-import.
- *The param menu **is** the main script's schema* — tighter than Figma's separate manifest
  `parameters`.
**Don't copy:** the mutable shared scene graph, or forcing the iframe/postMessage split on
trusted code (our core modules run in-worker directly).

---

## Roadmap (guest-first)

1. **Carve `@archiyou/sdk`** — execution service + types + the host context/`archiyou` bridge shape.
   Migrate `apps/editor` to it to prove the surface. No behavior change.
2. **Extension-point slots** — `ParamWidgetRegistry` + a param-menu slot, a toolbar-tool slot,
   and the **viewer command API** (`select/frame/highlight` + events). Refactor
   `param-menu.ts` + the tool panels to consume them, seeded with today's built-ins. Editor
   behavior identical. *(No full viewer portability — the big de-risk vs the old plan.)*
3. **Plugin runtime** — `manifest` schema (incl. `mode`), `PluginManager` (dynamic-import parts,
   link scripts, mount into slots), host-context provider + persistence stores,
   `getOutputCatalog`/`generateOutputs`. First real `script`-mode plugin (the Worked example)
   validates both halves.
   - **Session mode** — the no-reset/persistent-scope Runner variant + command recorder +
     `archiyou.exec`/`query`/`session.*`. Ships once script mode is proven; reuses the same eval.
4. **In-editor plugin IDE** — *Open plugin folder*: codebox loads the main script, parts mount
   into the slots, live re-run + hot reload. **Detailed as "Editor plugin mode & App preview"
   below** (isolated session, scripts-only editing, context-aware App button).
5. **Sandbox + flattened parts + CLI** — `srcdoc` iframe adapter + injected `archiyou` bridge/design
   tokens, `permissions`/CSP enforcement, and the `ay` CLI (`dev`/`validate`/`build`) + headless
   test doubles.
6. **Core modules (trusted)** — `registerScopeModule` + worker `registerCoreModule(url)`, the
   `load`/`setup` lifecycle, `ScopeModuleContext`, namespace guard, `.d.ts` → completions.
7. **Embed/publish path** — rebuild `apps/configurator` as the minimal embed host for a finished
   plugin (schema-driven param menu + viewer). **Publishing designed in the refinement below**:
   a `PluginAppDefinition` bundle → `POST /admin/publish-app` (stored under `__apps__`) →
   served at `/apps/...` → loaded by `loadPluginFromUrl`.
8. **AI authoring** — templates + the generation contract bundle (SDK `.d.ts` + manifest schema)
   + a validate → smoke-run → mount-in-editor pipeline. AI targets the **safe surface only**
   (`$component` scripts + flattened parts) — never core modules.

Representative files: `packages/sdk/*` (new), `packages/ui/src/params/param-menu.ts`,
`packages/ui/src/editor/tools/*-tool.ts`, `packages/ui/src/viewer/model-viewer.ts` (command API
only), `apps/editor/src/services/execution-service.ts`, `apps/editor/src/pages/editor.ts`
(open-folder mode), `apps/configurator/*` (embed host), `packages/core/src/runner/Runner.ts`
(`registerScopeModule`).

---

## Worked example: "Shelving System" plugin (a guest)

A directory with a main script (declares `$PARAMS`), `$component` parts, a custom param menu,
and a BOM tool. Authored by **opening the folder in the editor**:

- `scripts/main.ts` declares `WIDTH/HEIGHT/SHELVES/JOINERY` via `$PARAMS.define(...)` (the input
  schema) and composes `$component('shelving/bracket')` in a loop.
- `ui/param-menu.html` gets that schema via `archiyou.onSchema(...)`, renders a
  furniture-configurator form, and calls `archiyou.submit(values)` on change (or *virtual
  params*: a `Style` control expands into the submitted values object).
- `ui/tools/bom.html` calls `archiyou.generate(['default/tables/*/xlsx'])` and offers download.
- Preview: open the folder → main script in the codebox, menu + BOM tool mounted, viewer shows
  the shelf; drag a slider → `submit(values)` → re-run → viewer + BOM update.
- Ship: `ay build` → push the folder to a static URL, hash-pinned in the registry.

---

## Risks / open questions

- **Param-menu ↔ schema authority** — the schema originates in the main script's `$PARAMS`; the
  param-menu part renders/edits *values* by default, and *authoring* new params (emitting
  `ScriptParamData`) is the advanced mode. Keep that split explicit so plugins don't fork the
  source of truth.
- **Viewer command API scope** — must be small and stable (select/frame/highlight/generate);
  resist growing it into a general rendering API (that's the slippery slope back to host mode).
- **Session determinism** — `session` mode is only reproducible if every command is captured in
  the append-only log; forbid un-recorded randomness/external reads, and define the log
  serialization format (it doubles as the plugin's save artifact).
- **Core-module trust** — privileged in-worker code; trusted tier only, hash-pinned, capability-
  gated; `ctx` is a DI boundary, not a security sandbox.
- **Persistence schema** — plugin state in `ScriptData` needs a reserved, namespaced key that
  survives `toData()`/`fromData()` without colliding with core fields.
- **Permission enforcement point** — `networkAccess`/`capabilities` only bite once the iframe
  bridge (step 5) exists; until then treat all plugins as trusted-tier and gate the registry.
- **Embed vs plugin drift** — the embed host must reuse the *same* schema-driven param menu and
  viewer as the editor, or the two paths diverge.

## Implementation slice 1 (branch `sdk`): `shape-picker` example plugin

A minimal, real `script`-mode plugin — a dropdown (cube/sphere/cylinder) + size that generates
the shape. Grounded in the actual engine API (`box/sphere/cylinder` are script globals per
`constants.ts` `MODELER_METHODS_INTO_GLOBAL`; `$PARAMS.define('SHAPE','options',{options:[…]})`;
script = `export default { name, code, params }` module, per
`packages/core/tests/cadscripts/scripts/programmaticparams.js`).

Files (new dir `plugins/shape-picker/`):
- `manifest.json` — per the manifest spec: `id/name/version/engine:^1/mode:"script"`,
  `mainScript: "scripts/main.ts"`, `paramMenu: "ui/param-menu.html"`.
- `scripts/main.ts` — ScriptData module. `units('mm')`; defines `SHAPE` (options) + `SIZE`
  (number); `if ($SHAPE==='cube') box($SIZE,$SIZE,$SIZE)` / `sphere($SIZE/2)` /
  `cylinder($SIZE/2,$SIZE)`, each `.color(...)`.
- `ui/param-menu.html` — flattened part: `archiyou.onSchema(schema=>…)` builds the `<select>`
  from the SHAPE param's `schema.enum` + a range from SIZE's `minimum/maximum/multipleOf`;
  `onchange/oninput` → `archiyou.submit({SHAPE,SIZE})`. Self-contained, guards a missing bridge.
- `README.md` — what runs **today** (paste `scripts/main.ts` code into the editor → the existing
  param menu already renders the dropdown → shapes render) vs what needs the **loader** (mounting
  `param-menu.html` as a bridge-driven part). Maps to this doc.

**Scope note:** this slice ships the plugin *artifacts* (the natural first step); the
`PluginManager`/bridge host wiring (roadmap steps 3–5) comes after. The `main.ts` is verifiable
now via the editor or the headless Runner harness.

## Verification

- After each refactor (steps 1–2) the **editor runs unchanged** (`pnpm dev` in `apps/editor`,
  workspace mode).
- Step 3/4: **open a fixture plugin folder** in the editor; confirm the main script loads into
  the codebox, the custom param menu + tool mount into the host slots, and a slider →
  `runScript` round-trips into the host viewer.
- Headless (step 5): the three test strategies run under vitest with **no browser** — scripts
  and modules against the real Runner, parts against `createMockHost`.
- Step 6: a trusted core module (with WASM) registers, a script uses its global, output reaches
  the viewer.
- Step 7: the embed host renders a published plugin (schema-driven params + viewer) with its own
  chrome.
- Step 8: generate a trivial plugin from a prompt, `ay validate`, smoke-run, mount in the editor
  preview. Existing `test:docs`/`test:runner` stay green.
