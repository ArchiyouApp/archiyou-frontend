# AI disclosure

This repository is the **frozen pre-history** of Archiyou: the 113 commits that were squashed into the `Initial commit` of the public repository. Development continues there, not here.

Archiyou is funded by the [NLnet NGI0 Commons Fund](https://nlnet.nl/project/Archiyou/). NLnet's [policy on generative AI](https://nlnet.nl/foundation/policies/generativeAI/) asks that the provenance of generated code is clear per contribution: which model (with version), how it was used, the prompts and the output or a summary, kept where no login is needed and nothing disappears. This folder is that record for the period in this repository.

How Archiyou used AI in this period: the work was planned by the team and carried out with an agent. The agent wrote code and tests; the author reviewed the code, guided the standards and clarity, and tested the applications in the browser. All parametric CAD scripts are hand-crafted.

## What every commit carries

```
Author: Mark van der Net with <model> <mark@archiyou.com>

<the original commit message, unchanged>

Model: <model, with its API name>
Prompt: "<the prompt that led to this commit>"
Record: documentation/nlnet/ai/records/<record>.md
Output: (this commit)
Review: <what the author checked>
```

## Honesty of this record

The disclosure was added **retroactively**, in one pass over the history, so it is weaker than the per-commit disclosure the public repository has had since 2026-09-14. What that means in practice:

- **The commits are the originals.** Their content, dates, order, subjects and bodies are unchanged. Only the author line and the disclosure block were added, and `Co-Authored-By` trailers were removed in favour of the block.
- **The prompts are verbatim**, from the local Claude Code prompt history. That history starts on 2026-04-23 and has holes (2026-04-23 → 2026-05-07, 2026-05-07 → 2026-05-18, 2026-06-17 → 2026-06-29), so 16 of the 113 commits say `Prompt: not retained` instead of quoting one.
- **The models before 2026-08-15 are reconstructed from memory.** Claude Code logs that the model was switched, not which model was picked. The rule applied: Claude Sonnet 4.6 before July 2026, Claude Opus 4.6 from July 2026, except where a commit trailer or a surviving session transcript named the model (Claude Opus 5, from 2026-07-30 on).
- **Human and generated work are not separated.** In this period the author and the agent worked within the same commits, so commits are marked `mixed` rather than split into separate human and generated commits. NLnet's policy asks for that separation going forward; the public repository does it from 2026-09-14 on.
- **The review lines are general.** They record the working method of the period (code review plus testing in the browser), not a specific per-commit check written at the time.
- **Build output and one committed key were removed** from the history: `apps/editor/dist/`, `packages/gdrr2bp-wasm/target/` and a `.env` file that held an API key.

## Records

| Dates | Topic | Model | Commits | Prompts |
|---|---|---|---|---|
| 2026-03-26 → 2026-03-27 | [Editor foundation: the first web app around the meshup kernel](./records/2026-03-26-editor-foundation.md) | Claude Sonnet 4.6 | 6 | 0 |
| 2026-04-23 → 2026-06-29 | [Editor on archiyou-core-next: scene navigator, parameters, viewer tools](./records/2026-04-23-editor-core-next.md) | Claude Sonnet 4.6 | 27 | 274 |
| 2026-06-29 → 2026-07-03 | [Monorepo refactor, plugin system and the first server API](./records/2026-06-29-monorepo-plugins.md) | Claude Sonnet 4.6, Claude Opus 4.6 | 17 | 71 |
| 2026-07-07 → 2026-07-30 | [Materials, one backend, exporters (DXF, text, DAE) and publishing](./records/2026-07-07-backend-materials-exports.md) | Claude Opus 4.6 | 13 | 281 |
| 2026-07-30 | [Security hardening, Apache-2.0 licensing, CI and type-checking](./records/2026-07-30-hardening.md) | Claude Opus 5 | 16 | 25 |
| 2026-08-02 → 2026-08-05 | [Brep kernel wiring, hidden-line removal and exact SVG/DXF](./records/2026-08-02-kernels-hlr.md) | Claude Opus 4.6, Claude Opus 5 | 15 | 122 |
| 2026-08-06 → 2026-08-25 | [Deployment, modules SDK, wasm packages and publication preparation](./records/2026-08-06-deploy-modules.md) | Claude Opus 4.6, Claude Opus 5 | 19 | 277 |
| 2026-09-17 | [Publishing this history: the retroactive disclosure pass itself](./records/2026-09-17-history-publication.md) | Claude Opus 5 | 1 | 6 |
