# Third-party software

Archiyou itself is Apache-2.0 (see `LICENSE`). This file records the third-party
components that ship *inside* the repository or the built bundle, because those
carry their own terms. Ordinary npm dependencies are not listed here — their
licenses live in their own packages and are resolved by `pnpm install`.

## Bundled WebAssembly binaries

These are committed binaries (or base64 strings), so they are redistributed by
this repository and by anything built from it.

### OpenCascade — `packages/core/src/modeler/brep/wasm/`

`archiyou-opencascade.wasm` (~11 MB) is a custom build of
[opencascade.js](https://github.com/donalffons/opencascade.js), which wraps
[Open CASCADE Technology](https://dev.opencascade.org/). OCCT is distributed
under the **LGPL-2.1 with an additional exception**.

> ⚠️ **Unresolved before wide redistribution.** LGPL-2.1 obliges us to let
> recipients relink against a modified version of the library and to make the
> corresponding source available. The build scripts are included under
> `build-scripts/`, but the exact upstream OCCT revision and build configuration
> are not currently pinned in this repository, and no OCCT source is vendored.
> If you redistribute Archiyou builds, confirm this satisfies you. Tracked as an
> open issue.
>
> Note this binary is only reachable through the `brep` kernel (`getOc()`); the
> default kernel is `mesh`, which uses meshup instead.

### meshup — `packages/meshup/` (git submodule)

Apache-2.0. Its own `LICENSE`, `NOTICE` and `THIRD-PARTY-NOTICES.txt` apply and
are authoritative. Summarised: the Rust geometry kernel is a fork of
[csgrs](https://github.com/timschmidt/csgrs) by Timothy Schmidt, itself derived
from [csg.js](https://github.com/evanw/csg.js) by Evan Wallace, under the **MIT
License**. The compiled WASM is embedded as base64 in
`src/meshup-js-binary.ts`, so the MIT-licensed work is present in any bundle
that includes meshup.

The submodule also vendors several Rust crates under `rust/` (geo-buf,
hershey-fonts, hypercurve, hyperlattice, hyperlimit, hyperreal, hypersolve),
each with its own LICENSE file in-tree. Consult the submodule for those terms.

### gdrr2bp — `packages/gdrr2bp-wasm/`

A Rust port/adaptation of the GDRR two-dimensional bin-packing algorithm. See
`packages/gdrr2bp-wasm/README.md` and `Cargo.toml` for provenance. The compiled
module is committed as base64 in `ts/gdrr2bp-wasm-binary.ts`.

### COLLADA writer — `packages/collada-wasm/`

Archiyou-authored Rust, Apache-2.0. See `packages/collada-wasm/ts/wasm/LICENSE`
for the wasm-bindgen generated glue.

## Fonts

Hershey vector fonts (via meshup's `hershey-fonts`) are in the public domain.
The webfonts used by the editor UI (Plus Jakarta Sans, Outfit, JetBrains Mono)
are loaded from Google Fonts at runtime and are **not** redistributed here; all
three are SIL Open Font License 1.1.

## Runtime CDN dependencies

The editor fetches these at runtime rather than bundling them. They are not
redistributed by this repository, but they are third-party code executing in the
page, and the Content-Security-Policy in `apps/server/Caddyfile` has to allow
them:

| Source | Used for | License |
| --- | --- | --- |
| `cdn.jsdelivr.net/npm/lucide-static` | UI icons (`apps/editor/src/icons.ts`) | ISC |
| `www.gstatic.com/draco/...` | Draco mesh decoder (`packages/ui/src/viewer/model-viewer.ts`) | Apache-2.0 |
| `fonts.googleapis.com` / `fonts.gstatic.com` | webfonts (`apps/editor/index.html`) | OFL-1.1 |

Vendoring these would make the app self-contained and let the CSP tighten to
`'self'`.

## Material carbon data

`packages/core/src/materials/materials.json` includes environmental-impact
figures derived from [ÖKOBAUDAT](https://www.oekobaudat.de/), published by the
German BBSR. Check ÖKOBAUDAT's own terms before relying on or redistributing
these values commercially.
