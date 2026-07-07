# materials-generator

Standalone AI generator for the archiyou materials database and textures. Runs
entirely on **Google Gemini** — one `GEMINI_API_KEY` for both data and images.

- **Data**: Gemini (`gemini-2.5-pro` by default) authors physical properties in
  canonical SI units, each with a source citation, constrained to a response
  schema → `packages/core/src/materials/materials.json`.
- **Textures**: Gemini **Nano Banana** (`gemini-2.5-flash-image`) generates
  tileable section / sides / thinSides images → `packages/core/src/materials/textures/`.
- **Cross-check**: a manual (non-CI) audit that compares stored values against
  public references via Gemini + Google Search grounding and prints a diff report.

This is a **build-time authoring tool**. The generated `materials.json` + images
ship as static data in `@archiyou/core`; the app never runs the generator.

## Setup

```bash
cd tools/materials-generator
npm install
cp .env.example .env   # add GEMINI_API_KEY (from https://aistudio.google.com/apikey)
```

The scripts auto-load `.env` (via Node's built-in env-file loader, Node ≥ 20.6).

## Usage

```bash
npm run generate:data        # (re)generate materials.json property data
npm run generate:textures    # generate texture images + patch viz.textures
npm run materials:crosscheck # manual audit of values vs public sources
# audit a subset:
npm run materials:crosscheck -- steel douglas concrete
```

`generate:data` preserves any existing `viz.textures` blocks, and
`generate:textures` preserves the property data — so the two can be run
independently and in any order.

### Resuming after a failed run (`ONLY_UPDATE`)

`generate:data` regenerates every material by default. If a run is cut short by a
transient API error (e.g. `503 "high demand"`), only the materials generated so
far are written to `materials.json`. Re-run with `ONLY_UPDATE=true` to fill in
just the missing/incomplete ones (already-complete materials are skipped, so no
quota is spent re-generating them):

```bash
ONLY_UPDATE=true npm run generate:data   # or set ONLY_UPDATE=true in .env
```

A material counts as "complete" when it has the schema-required fields
(`name`, `group`, `description`, `density`, `viz.pbr`). If nothing is missing the
script exits without rewriting the file.

## Review before committing

Generated numbers must be human-reviewed. The deterministic range gate lives in
the core test suite (`packages/core/tests/unit/materials/`), and `crosscheck.ts`
gives a live second opinion. Only commit values you've sanity-checked.
