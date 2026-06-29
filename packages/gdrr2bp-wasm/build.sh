#!/usr/bin/env bash
#
# Build the WebAssembly package + TS bindings for gdrr2bp-wasm.
#
# Output goes to ./pkg (bundler target, matching the csgrs setup in this repo):
#   gdrr2bp_wasm.js / _bg.js / _bg.wasm / .d.ts
#
# Requirements: rustup with the wasm32-unknown-unknown target, and wasm-pack.
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-pack
#
# The getrandom wasm backend is selected via .cargo/config.toml.

set -euo pipefail
cd "$(dirname "$0")"

wasm-pack build --target bundler --release --out-dir pkg "$@"

# Keep the generated artifacts tracked (this repo commits its wasm blobs).
rm -f pkg/.gitignore

echo "✅ Built pkg/. Import the wrapper from ./ts/index.ts"
