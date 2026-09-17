# Archiyou Frontend+

> [!NOTE]
> **Archived history — not maintained.**
> This repository holds the 113 commits Archiyou was built from between 2026-03-26 and
> 2026-08-25, which were squashed into the `Initial commit` of the public repository.
> Its tip is byte-identical to that commit. Development continues at
> [ArchiyouApp/archiyou](https://github.com/ArchiyouApp/archiyou); issues and pull
> requests belong there.
>
> Every commit here carries its AI disclosure, added retroactively in a single pass.
> See [documentation/nlnet/ai](./documentation/nlnet/ai/README.md) for how that was
> reconstructed, and for where it is weaker than disclosure written at the time.
> Build output (`apps/editor/dist/`, `packages/gdrr2bp-wasm/target/`) and one committed
> `.env` file were removed from the history; everything else is unchanged.
>
> The rest of this README is the one that stood at the last commit, in August 2026.

Source code of first closed sourced, then open source Archiyou frontend that evolved into full stack repo by combining it with [archiyou-server](https://github.com/ArchiyouApp/archiyou-server), [the original (brep) core](https://github.com/ArchiyouApp/archiyou-core) and [the new mesh core](https://github.com/ArchiyouApp/meshup). 

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Bundled WebAssembly binaries carry their own licenses. The significant one is
Open CASCADE Technology 7.6 (LGPL-2.1 with the Open CASCADE exception), which the
optional `brep` kernel loads; the default `mesh` kernel does not use it.
[ATTRIBUTION.md](ATTRIBUTION.md) records every third-party component, and for
OpenCascade also the exact source revision, how to rebuild and substitute the
binary, and a written offer for the corresponding source — read it before
redistributing.
