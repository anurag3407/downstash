# AGENTS.md

Downstash is a self-hosted, $0.00/month, Upstash-wire-compatible serverless Redis.
A Cloudflare Worker speaks the Upstash REST protocol; Supabase Postgres is the
storage engine; `@downstash/client` adds direct-RPC failover; a Next.js console
copies the Upstash UX with a Neo-brutalism UI.

- Product intent: [`PRD.md`](./PRD.md)
- How to build it: [`plan.md`](./plan.md) — read the task's section first
- Documentation: [`docs/README.md`](./docs/README.md)

## Reading order

1. `AGENTS.md` (this file)
2. [`docs/README.md`](./docs/README.md)
3. [`docs/codemap.md`](./docs/codemap.md)
4. [`docs/progress.md`](./docs/progress.md)
5. Your task in [`plan.md` §16](./plan.md)

## Golden rules

1. **Never invent APIs.** Read the installed types in `node_modules` or the
   official docs. This has already caught two real bugs here.
2. **Never weaken security** to make a test pass: no disabling RLS, no granting
   `anon` on internal functions, no logging tokens.
3. **Never commit secrets.** Only `*.example` env files are committed.
4. **No paid services.** A paid dependency needs an ADR proposal and a stop.
5. **Wire compatibility beats elegance.** If `@upstash/redis` expects a shape,
   produce that shape.
6. **Design tokens only.** No raw hex, no `rounded-md`, no soft shadows.
7. **Docs are part of the deliverable.** Stale docs means the task is not done.
8. **Small, typed, tested.** TypeScript `strict`, no `any`, a test for every
   behaviour.
9. **Preserve unrelated code and comments.**
10. **When the plan conflicts with the PRD, the plan wins.**

## Command cheat sheet

```bash
pnpm i
pnpm db:reset                       # or ./supabase/scripts/pg-local-reset.sh (no Docker)
pnpm dev                            # gateway :8787, web :3000
pnpm test                           # package unit tests
pnpm test:sql                       # engine suite (needs TEST_DATABASE_URL)
pnpm test:compat                    # @upstash/* + failover
pnpm test:e2e                       # Playwright
pnpm lint
pnpm typecheck
pnpm format:check
pnpm docs:check
pnpm design:check
```

The compat and differential suites boot their own services (a PostgREST shim on
:54321 and `wrangler dev` on :8787). They need one variable:

```bash
export TEST_DATABASE_URL="postgres://$USER@127.0.0.1:55432/downstash_test"
```

## Where things live

| Path                  | Purpose                                                  | Main doc                                                       |
| --------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/gateway`        | Worker: protocol, auth, L1                               | [`docs/gateway`](./docs/gateway)                               |
| `apps/web`            | Console + landing                                        | [`docs/web`](./docs/web)                                       |
| `packages/protocol`   | Isomorphic helpers                                       | [`packages/protocol/README.md`](./packages/protocol/README.md) |
| `packages/client`     | Failover client + Requester                              | [`docs/client`](./docs/client)                                 |
| `supabase/migrations` | **The engine — all command semantics**                   | [`docs/engine`](./docs/engine)                                 |
| `tests`               | SQL / compat / differential                              | [`docs/conventions/testing.md`](./docs/conventions/testing.md) |
| `tooling`             | `check-docs`, `check-design`, `gen-token`, `gen-enc-key` | —                                                              |
| `docs`                | Docs and ADRs                                            | [`docs/README.md`](./docs/README.md)                           |

## Definition of done

- [ ] Deliverables exist at the exact paths the task lists.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` pass.
- [ ] The task's acceptance commands pass, output summarised in
      `docs/progress.md`.
- [ ] New behaviour has tests.
- [ ] `pnpm docs:check` passes; for web tasks, `pnpm design:check` too.
- [ ] The docs in the task's **Docs** list and the update matrix are updated.
- [ ] No secrets committed, no paid dependency added.
- [ ] Commits follow §5.7 and carry the task ID.
- [ ] `docs/codemap.md` and `docs/progress.md` updated.
