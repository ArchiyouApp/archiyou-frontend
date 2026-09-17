# Publishing this history: the retroactive disclosure pass itself

| | |
|---|---|
| Dates | 2026-09-17 |
| Model | Claude Opus 5 (claude-opus-5), 1M context, Claude Code agent |
| Tool | Claude Code, in plan mode first, then as an agent |
| Human | Mark van der Net: asked for the publication, chose its scope, set the model reconstruction rule and the review wording, and approved each step |
| Branch | `develop` (this repository has no other branch) |
| Session transcript | kept locally; the prompts are reproduced in full below |

## Why this unit exists

The other records in this folder are retroactive: they describe work done between
March and August 2026 and were written afterwards. This record describes the
disclosure pass itself — reading the old history, reconstructing what could be
reconstructed, and rewriting the commits to carry it. That work was done with an
agent too, so it is disclosed the same way, and it is the single commit at the
top of this repository.

## Prompts (verbatim, local time)

```
2026-09-17 14:52  Can you give me an overview of the git history? Did it start with just frontend? When was the monorepo introduced? When the two kernels setup.

2026-09-17 15:11  /plan For NLNet subsidy transparency it might be a good idea to open source the work here around the frontend (as archiyou-frontend), keeping the commits (but using the NLnet AI disclosure commit structure). Would this be feasable?

2026-09-17 20:34  I have disclosure review open. Can you fill in all unknown models before july claude sonnet 4.6? This is probably the most likely. Afterwards Opus 4.6? For all unfilled review fields: "General code review and user tests in browser". For the unknown commits: Use kind: "mixed"

2026-09-17 20:36  yes change to mixed

2026-09-17 20:41  Yes continue
```

Two further decisions were made through the agent's multiple-choice questions rather
than in a typed prompt. The author chose:

- **Scope**: the whole pre-squash monorepo, rather than only the frontend, even though
  the request started from "archiyou-frontend".
- **Disclosure depth**: per commit, drafted by the agent and corrected by the author,
  rather than one record per period.

## Plan (agent output, approved by the author before implementation)

The approved plan, in short:

1. Clone `develop` from the private GitLab repository into a working folder; touch
   neither that repository nor the public one.
2. Draft a review file with one entry per commit, matching the author's prompts from
   the local Claude Code prompt history to the commit each led to, and proposing a
   kind and a model per commit.
3. **The author reviews and corrects that file.** Nothing is rewritten before they
   say it is final.
4. Group the commits into units of work and write a record per unit.
5. Rewrite the history with `git filter-repo`: drop build output and one committed
   key, rewrite the author lines, append the disclosure blocks.
6. Add one top commit with the archive README and the records.
7. Verify (linter, tree comparison, secret scan), push to a private repository first.
8. Publish only on the author's explicit go, and rotate the leaked key.

## Review and decisions by the author

- Asked for the history overview that started this, then asked whether publishing the
  history with NLnet's disclosure structure was feasible.
- Chose to publish the **whole** pre-squash monorepo rather than only the frontend.
- Chose per-commit disclosure over per-period records, accepting the review work.
- Set the model reconstruction rule from memory: Claude Sonnet 4.6 before July 2026,
  Claude Opus 4.6 from July 2026, since Claude Code does not log which model a
  `/model` switch selected.
- Set the wording of the review lines: "General code review and user tests in browser".
- Decided that commits the agent had proposed as hand-written should be `mixed`
  instead, after the agent showed they were burst-neighbours whose prompts had landed
  in the previous commit's window.

## What the agent did, and what was checked

The agent wrote the tooling (`build_review.py`, `rewrite.py`, `build_records.py`,
`lint.py`, `overview.py`), ran the rewrite, and generated these records. Checks that
were run and passed before anything was published:

- The rewritten tip is **byte-identical** to the original tip of the private
  repository and to the `Initial commit` of the public repository: same 852 files,
  same blob hashes.
- All 113 commits are present, in order, with their author and committer dates, their
  committer and their e-mail unchanged.
- The message rules of the public repository's `scripts/ai-commit.mjs` hold for every
  commit: no links, no `Co-Authored-By` trailers, and a complete disclosure block on
  every commit marked `ai` or `mixed`.
- The committed API key appears in no object of the rewritten history, and a
  full-history secret scan was run over the result.

## Commits

| Commit | Date | Author | Subject |
|---|---|---|---|
| the top commit of this repository | 2026-09-17 | Mark van der Net with Claude Opus 5 | Archive the pre-squash history with its NLnet AI disclosure |
