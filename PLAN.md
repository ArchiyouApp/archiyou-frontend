# Plan: Archiyou Web — Lit SPA Architecture

## TL;DR
Build a lightweight Lit 3.x SPA with Vite, using @vaadin/router for routing, @lit-labs/signals for state, @lit/localize for i18n, oidc-client-ts for OAuth, and Web Awesome for UI components — all mapped to a central design token system. The app centers on a workspace that opens into an editor page with CodeMirror + ThreeJS viewer.

## Stack

| Concern | Library | ~Size |
|---------|---------|-------|
| Components | `lit` 3.x | ~5KB |
| Routing | `@vaadin/router` | ~8KB |
| State | `@lit-labs/signals` | ~2KB |
| i18n | `@lit/localize` (runtime mode) | ~1.4KB |
| Auth | `oidc-client-ts` | ~12KB |
| UI kit | Web Awesome | per-component |
| Code editor | CodeMirror 6 | loaded in editor page |
| 3D viewer | Three.js | loaded in editor page |
| Build | Vite | dev only |

## Project Structure

```
src/
├── index.html
├── app-shell.ts                # top-level: router, layout, auth guard
├── router.ts                   # central route config
├── styles/
│   ├── design-tokens.ts        # CSS custom properties + Web Awesome mapping
│   └── dark-theme.ts           # dark mode token overrides
├── state/
│   └── workspace.ts            # signals-based workspace state
├── services/
│   ├── api.ts                  # fetch wrapper with auth token injection
│   └── auth-service.ts         # oidc-client-ts wrapper (login/logout/token)
├── wasm/
│   ├── loaders.ts              # lazy singleton WASM loaders
│   └── wasm-controller.ts      # Lit reactive controller for WASM
├── i18n/
│   ├── locale-config.ts        # @lit/localize setup
│   └── translations/
│       ├── en.xlf              # English (source locale)
│       └── nl.xlf              # Dutch translation
├── layouts/
│   └── layout-main.ts          # authenticated layout (nav + slot)
├── pages/
│   ├── login.ts                # login / OAuth redirect
│   ├── callback.ts             # OAuth callback handler
│   ├── workspace.ts            # central workspace (post-login landing)
│   └── editor.ts               # editor container: code + viewer
├── components/
│   ├── nav-bar.ts              # top navigation bar
│   ├── code-editor.ts          # CodeMirror 6 wrapper
│   └── viewer-3d.ts            # Three.js viewer (empty shell for now)
```

## Steps

### Phase 1: Project Scaffolding
1. Init Vite project with `lit-ts` template, configure TypeScript strict mode
2. Install core deps: `lit`, `@vaadin/router`, `@lit-labs/signals`, `@lit/localize`, `oidc-client-ts`
3. Install Web Awesome package and configure its theme loader
4. Create `src/styles/design-tokens.ts` — define color, font, spacing, radius tokens as CSS custom properties; map them to Web Awesome's `--sl-*` variables
5. Create `src/styles/dark-theme.ts` — override color tokens for dark mode; use `prefers-color-scheme: dark` media query plus a manual toggle class (e.g. `[data-theme="dark"]` on `<html>`)
6. Create `src/index.html` with `<app-shell>` entry point

### Phase 2: Core Services
7. Create `src/services/auth-service.ts` — singleton wrapping `oidc-client-ts` UserManager with `login()`, `callback()`, `logout()`, `getUser()`, `getToken()`
8. Create `src/services/api.ts` — fetch wrapper with `get/post/put/delete`, auto-injects Bearer token, configurable base URL
9. Create `src/state/workspace.ts` — `workspace` signal holding the workspace model, plus computed signals and mutation functions (`createScript()`, `selectScript()`)
10. Create `src/i18n/locale-config.ts` — configure `@lit/localize` runtime mode with `en` as source locale and `nl` as target locale

### Phase 3: Shell & Routing
11. Create `src/app-shell.ts` — renders `<main id="outlet">`, initializes router in `firstUpdated()`
12. Create `src/router.ts` — route config:
    - `/login` → `login` (public)
    - `/callback` → `callback` (public, OAuth redirect)
    - `/` → `layout-main` (auth-guarded) with children:
      - `/` → `workspace`
      - `/editor/:scriptId?` → `editor`
    - `(.*)` → 404 catch-all
    - Auth guard in `action`: check `auth.getUser()`, redirect to `/login` if absent
13. Create `src/layouts/layout-main.ts` — `<nav-bar>` + `<slot>` for child pages

### Phase 4: Pages & Components
14. Create `src/pages/login.ts` — login button that calls `auth.login()`
15. Create `src/pages/callback.ts` — calls `auth.callback()` on `connectedCallback`, navigates to `/`
16. Create `src/pages/workspace.ts` — reads `workspace` signal; "New Script" button calls `createScript()` and navigates to `/editor/:newId`
17. Create `src/pages/editor.ts` — two-panel layout:
    - Left: `<code-editor>` (CodeMirror 6)
    - Right: `<viewer-3d>` (Three.js)
    - Reads script ID from route params
18. Create `src/components/nav-bar.ts` — app title, user info, logout, dark mode toggle; uses Web Awesome components
19. Create `src/components/code-editor.ts` — wraps CodeMirror 6; `value` property, `change` event; initializes EditorView in `firstUpdated()`
20. Create `src/components/viewer-3d.ts` — empty Three.js shell: Scene + Camera + Renderer, renders empty scene

### Phase 5: WASM Infrastructure
21. Create `src/wasm/loaders.ts` — lazy singleton loader pattern per WASM module
22. Create `src/wasm/wasm-controller.ts` — Lit ReactiveController exposing `loading` and `value`

### Phase 6: i18n Wiring
23. Run `lit-localize extract`, generate `src/i18n/translations/en.xlf` (source) and `src/i18n/translations/nl.xlf` (Dutch target)
24. Add sample Dutch translations for a few UI strings (login button, nav bar, "New Script") to validate the pipeline
25. Wrap user-facing strings in pages/components with `msg()` calls

## Verification
1. `npm run dev` starts without errors; `app-shell` renders
2. Navigating to `/` without auth redirects to `/login`
3. After OAuth flow, `/callback` processes token and lands on `/` (workspace)
4. "New Script" navigates to `/editor/:id`; CodeMirror loads and is editable
5. `viewer-3d` renders an empty Three.js canvas
6. Web Awesome components render with design token colors in both light and dark mode
7. Dark mode toggle switches theme; `prefers-color-scheme: dark` auto-applies
8. `lit-localize extract` succeeds and produces `en.xlf` and `nl.xlf`
9. Switching locale to `nl` shows Dutch translations for test strings
10. WASM controller can be instantiated (tested with a mock loader)
11. `api.get()` attaches Bearer token header

## Decisions
- **Explicit route config** over file-based routing — zero build magic, full visibility
- **@vaadin/router** over @lit-labs/router — mature, supports nested routes and guards
- **@lit-labs/signals** over Redux/MobX — minimal, aligns with TC39 proposal, native Lit integration
- **@lit/localize runtime mode** — allows locale switch without reload
- **oidc-client-ts** over custom auth — handles PKCE, refresh, silent renew
- **Lazy-loaded pages** via dynamic `import()` in route actions — keeps initial bundle small
- **CodeMirror 6 and Three.js loaded only on editor page** — not in main bundle
- **Viewer is empty shell** for now — Scene + Camera + Renderer scaffolded, no geometry

## Further Considerations
1. **Workspace persistence** — should workspace state sync to backend on every change (auto-save) or on explicit save? Recommend: debounced auto-save via `effect()` watching the workspace signal
2. **Editor layout** — fixed split (50/50) or resizable panes? A simple CSS `resize` or a lightweight splitter component from Web Awesome could work
