# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Email **info@archiyou.com** with `SECURITY` in the subject. Include what you
found, how to reproduce it, and what an attacker could achieve. We will confirm
receipt, keep you posted while we work on it, and credit you in the fix unless
you would rather stay anonymous.

Archiyou is a small project — please allow a reasonable window for a fix before
disclosing publicly.

## Known limitations you should read before self-hosting

These are design characteristics, not undisclosed bugs. Anyone running their own
instance needs to know about them.

### Script execution is not sandboxed

The script Runner compiles user script source with `new AsyncFunction`
(`packages/core/src/runner/Runner.ts`). There is no `vm`, no isolate, and no
separate process.

- **In the browser** this runs inside a Web Worker. That worker cannot reach
  `document` or `localStorage`, which is the boundary the editor relies on.
- **On the server** there is no such boundary. A script executed by the worker
  process gets full Node capability: `fs`, `child_process`, network,
  `process.env`.

Server-side execution is therefore **disabled by default**. `POST
/scripts/published/execute/...` requires authentication *and* the script's author
must appear in `SERVER_EXECUTION_AUTHORS`, which ships empty. Only add authors
whose code you are willing to run on that machine.

If you enable it, keep the hardening in `docker-compose.prod.yml`: the worker runs
as a non-root user with all capabilities dropped, gets `cpus`/`mem_limit`/
`pids_limit`, and is deliberately given a minimal environment that excludes
`SERVER_JWT_SECRET` and the Mailgun key.

`SERVER_EXECUTION_TIMEOUT_MS` bounds a run, but **only partially**: script code
shares the worker's event loop, so a tight synchronous loop (`while(true){}`)
starves the timer and will not be interrupted. The container limits and BullMQ's
stall detection are what contain that case.

Replacing this with a real isolate is tracked as an open issue.

### Third-party scripts in the browser

A published configurator runs another author's script in the viewer's session.
Mitigations in place:

- script-produced SVG is sanitised with DOMPurify before rendering
- dynamic param behaviours are only `new Function`-hydrated for scripts the
  signed-in user owns, never for foreign ones
- the importer parses pasted script data without evaluating it
- the deployed CSP (`apps/server/Caddyfile`) constrains what a script can reach

Note that the CSP must allow `'unsafe-eval'`, because that is how the Runner
works. Session tokens are JWTs held in `localStorage`, so any XSS that does get
through can read one.

### Sessions

Tokens are stateless JWTs with a 7-day lifetime and **no revocation list**. A
leaked token stays valid until it expires; there is no way to invalidate it
server-side. Refresh tokens plus revocation are tracked as an open issue.

### The asset proxy

`GET /proxy?url=` is intentionally unauthenticated so browser scripts can
`$import()` remote assets that CORS would otherwise block. It validates against
SSRF (rejecting loopback, private, link-local, CGNAT and multicast targets,
re-checking every redirect hop), caps the response size, times out, and rate
limits per IP.

Residual gaps, tracked as open issues: the DNS lookup used for validation is not
the one `fetch` ultimately connects with, so a DNS-rebinding race is possible;
the IPv6 blocklist uses prefix string matching rather than proper prefix-length
checks; and the upstream `Content-Type` is echoed, which lets the API origin serve
attacker-supplied content types. Set `SERVER_PROXY_ALLOWLIST` to close this down
if you do not need arbitrary hosts.

## Deployment checklist

- [ ] `SERVER_JWT_SECRET` set to a real random value (`openssl rand -base64 48`).
      The server refuses to boot in production without it.
- [ ] `SERVER_EXECUTION_AUTHORS` left empty unless you truly need server-side
      execution.
- [ ] `REDIS_PASW` set — without it, `docker-compose.prod.yml` starts Redis with
      no password.
- [ ] `SERVER_SEED_TEST_USER` **not** set in production, so the `test` account is
      never created.
- [ ] `FRONTEND_URL` set to your real origin; it drives the CORS allowlist and the
      links in outgoing email.
- [ ] `SERVER_PROXY_ALLOWLIST` considered.
- [ ] Off-box backups configured (`SERVER_BACKUP_S3_*`) and the cron line from
      [README → Backups](README.md#backups) installed. `pnpm admin:backup` takes a
      consistent snapshot with SQLite's online backup API, so no manual WAL
      checkpoint is needed — but do **not** roll your own by copying `archiyou.db`
      while a `-wal` sits next to it: that silently loses every write still in the
      WAL, which is routinely megabytes.
- [ ] Everything durable is actually on the list. `backupTargets` in
      `apps/server/src/config.ts` decides what is archived; anything absent is
      treated as regenerable and will be lost with the host.
- [ ] The restore procedure run once, against a scratch copy. An untested restore
      is not a backup.
- [ ] Backup credentials scoped as tightly as your provider allows. The script
      deletes old archives with the same key it uploads with, so a compromised
      server can erase its own history; prefer `SERVER_BACKUP_PRUNE=false` plus a
      bucket lifecycle rule and a write-only key where that is available.
