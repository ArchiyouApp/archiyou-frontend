# @archiyou/module-sdk

The contract for **Archiyou script modules** — optional units that add a global to the scope an
Archiyou script runs in.

This package is types plus two identity helpers. It has no runtime dependencies and knows nothing
about the engine, so a module repository can compile against it without pulling in
`@archiyou/core`.

```ts
import { defineModule } from '@archiyou/module-sdk';

export default defineModule(() => ({
  setArchiyou(ay) { this._ay = ay; },
  reset() { /* per-run state */ },

  doSomething(x) { return x * 2; },
}));
```

See [`docs/modules.md`](../../docs/modules.md) in the Archiyou repository for the manifest format,
the client/server runtimes, entitlement, and how to develop a module against a local checkout.
