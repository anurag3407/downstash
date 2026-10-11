# @downstash/protocol

Isomorphic helpers shared by the gateway, the console and the client. Zero
runtime dependencies, Web APIs only (`crypto.subtle`, `crypto.getRandomValues`,
`TextEncoder`, `TextDecoder`, `btoa`/`atob`) — it runs in a Worker, in Node 22
and in a browser.

Internal package. Consumers bundle it: the gateway through wrangler/esbuild, the
web app through `transpilePackages`, the client through tsup with
`noExternal: ['@downstash/protocol']`.

## Exports

| Module            | What                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| `types.ts`        | `CommandSpec`, `RedisValue`, `ResultEnvelope`, `RunMode`, `TokenKind` |
| `commands.ts`     | `COMMANDS`, `getCommand`, `isWrite`, `isCacheable`, `precheck`        |
| `argv.ts`         | `normalizeCommand`, `normalizePipeline`                               |
| `encoding.ts`     | `utf8ToBase64`, `base64ToUtf8`, `encodeResult`, `encodeEnvelope`      |
| `token.ts`        | `TOKEN_REGEX`, `generateToken`, `sha256Hex`, `tokenKind`, `tokenHint` |
| `tokenize-cli.ts` | `tokenizeCli` (redis-cli quoting rules)                               |
| `format-cli.ts`   | `formatCli` (redis-cli reply formatting)                              |
| `errors.ts`       | `ERRORS`, `formatError`, `ProtocolError`                              |

## `COMMANDS` and the parity rule

`COMMANDS` is the TypeScript mirror of the `downstash.command_registry` table. It
exists for early validation and UI metadata, **not** as a second source of truth —
all semantics live in SQL (ADR
[0005](../../docs/adr/0005-sql-is-the-engine.md)).

`tests/sql/registry-parity.test.ts` deep-compares the two, so adding a command
without registering it fails the suite.

## Generated docs

```bash
pnpm --filter @downstash/protocol gen:docs
```

rewrites `docs/engine/commands.md`. Never hand-edit that file.

## Related

- [`docs/engine/adding-a-command.md`](../../docs/engine/adding-a-command.md) ·
  [`docs/gateway/protocol.md`](../../docs/gateway/protocol.md) ·
  [plan §8](../../plan.md)
