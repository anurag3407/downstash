# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Script registry (P4-T1).** `tests/capture/capture-scripts.ts` extracts every
  `@upstash/ratelimit` script from the installed bundle, resolves `${…}`
  interpolation and verifies each SHA-1 against the SDK's own map. Nine scripts
  are ported to PL/pgSQL in
  `supabase/migrations/20261007001100_scripts_ratelimit.sql`.
- **Compatibility suites (P4-T2, P4-T3).** `@upstash/redis` (20 cases) and
  `@upstash/ratelimit` (13 cases), including both response encodings.
- **Differential suite (P4-T4).** 301 corpus steps across 7 families, run
  against SRH (real Redis 7) and the gateway.
- **Failover suite (P5-T2).** `tests/compat/failover.test.ts`, 9 cases.
- **Keep-alive cron handler (P3-T6).** `apps/gateway/src/scheduled.ts` pings the
  database over PostgREST every 6 hours, so a free Supabase project never pauses.
- **Docker-free local stack.** A PostgREST shim plus `wrangler dev`, booted by
  `tests/helpers/stack.ts`, so the live suites run without Docker.
- **Documentation.** The full `docs/` tree: architecture, conventions, engine,
  gateway, client, web, design, operations and ADRs 0001–0013.
- `packages/client/README.md`, `packages/protocol/README.md`, root `README.md`,
  `LICENSE`, `CHANGELOG.md`.

### Fixed

- **The gateway returned an array for single commands.** `POST /` replied
  `[{"result":"PONG"}]` instead of `{"result":"PONG"}` because
  `downstash.run` always returns an envelope array and the route did not unwrap
  it (plan §9.6).
- **`@downstash/client` corrupted replies.** `Downstash.execute` base64-decoded
  every string, although the transport never sends `Upstash-Encoding`. `PING`
  came back as three bytes of mojibake, and any value that was not valid base64
  slipped through unchanged.
- **`ZRANGE` ignored lowercase options.** The engine compared `BYSCORE`, `REV`,
  `WITHSCORES` and `LIMIT` case-sensitively, so the lowercase literals
  `@upstash/redis` sends silently dropped `WITHSCORES`.
- **`ZRANGE key min max BYSCORE REV` always returned `[]`.** The port swapped the
  min/max bounds for the REV order; REV only reverses output.
- **`SCAN` failed whenever it ran out of keys.** The cursor was built with
  `v_keys #>> '[-1]'` — a `text[]` path, not an array index — so Postgres raised
  "upper bound cannot be less than lower bound" on every paginated scan.

### Changed

- `@downstash/protocol` is a devDependency of `@downstash/client` (it is bundled
  by tsup, and it is private, so it cannot be a runtime dependency of a
  published package).

## [1.0.0] - 2026-10-07

### Added

- Core schema, engine core, and the RPC surface.
- All eight command families: strings, keyspace, hashes, lists, sets, sorted sets,
  server, scripting.
- `@downstash/protocol`, `@downstash/gateway`, `@downstash/client`.
- Ops functions: TTL sweeper, stats, retention, pg_cron jobs.

[Unreleased]: https://github.com/downstash/downstash/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/downstash/downstash/releases/tag/v1.0.0
