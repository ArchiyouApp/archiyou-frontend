# Agent guide lines

## General coding style

* We prefer Allman style symmetrical braces. Please in this way always
* Please avoid for(..) and while(...) loops if you can also use a .map/reduce() loop.

## WASM libraries

We use Rust libraries compiled to WASM in this Typescript module

In development contexts we have git submodules of those libraries in ./devlibs/
Please always use `pnpm build:wasm` to build the WASM. Don't try your own compilation commands. 

## MESH KERNEL ONLY

Please don't consider the brep path of the Modeler (src/modeler/brep/*) which is still a stub for later brep kernel switching. 

### Avoid these recurring problems ####

- Avoid stray .js files output: If you need to do TS checking please always use --noEmit with tsc