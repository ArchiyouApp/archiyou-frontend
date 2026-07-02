# shape-picker — example plugin

The smallest real archiyou **guest plugin** (`script` mode): a dropdown that picks a
primitive shape — **cube / sphere / cylinder** — plus a size, and runs the main script to
generate it. It is implementation slice 1 of the plugin architecture in
[`WIP_PLUGINS.md`](../../WIP_PLUGINS.md).

## Structure

```
shape-picker/
  manifest.json          # id, engine ^1, mode "script", mainScript, paramMenu
  scripts/main.ts        # declares $PARAMS (SHAPE options + SIZE number) → the input schema
  ui/param-menu.html     # the custom dropdown, driven over the `archiyou` bridge
  README.md
```

- **`scripts/main.ts`** is the geometry logic. Its `$PARAMS` **is** the input schema; the
  `SHAPE` param is an `options` type, and the code branches to `box()` / `sphere()` /
  `cylinder()` (all script-scope globals).
- **`ui/param-menu.html`** is a self-contained flattened part. It receives the schema via
  `archiyou.onSchema(...)`, builds the `<select>` from `SHAPE`'s `schema.enum`, and calls
  `archiyou.submit({ SHAPE, SIZE })` on change. archiyou validates the values against the
  schema and executes.

## What runs today vs. what needs the loader

- **Runs today (no new infra):** paste the string in `scripts/main.ts`'s `code` into the
  editor codebox. Because `SHAPE` is an `options` param, the **existing** archiyou param menu
  already renders it as a dropdown; changing it re-runs the script and the viewer shows the
  cube / sphere / cylinder. This proves the "menu that runs a script" end to end on the
  current engine.
- **Needs the plugin loader (roadmap steps 3–5):** mounting `ui/param-menu.html` as the
  plugin's *own* menu requires the `PluginManager` + `archiyou` bridge (the sandboxed
  `srcdoc` iframe + `postMessage`). Until then, `param-menu.html` opened standalone renders
  against a small built-in stub bridge (interactions log to the console) so it stays
  reviewable and testable in isolation.

## Notes

- `mode: "script"` → functional `params → run → outputs`; the menu is a schema-driven form.
- No `coreModules`, so this is a **sandbox-tier** plugin (safe, AI-generatable).
