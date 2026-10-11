/**
 * @file tests/helpers/postgrest-shim.ts
 * A minimal PostgREST-compatible RPC server for local test runs.
 *
 * The real Supabase stack exposes `POST /rest/v1/rpc/<fn>` where the JSON body
 * supplies the function's named arguments. Docker (and therefore the full
 * Supabase CLI stack) is not available in every environment, so this shim
 * implements exactly that surface — enough for `downstash_gw_run`,
 * `downstash_gw_ping`, `downstash_exec`, `downstash_pipeline` and
 * `downstash_multi` — directly against a scratch Postgres.
 *
 * It is a test helper only: it has no auth, no schema introspection and no
 * support for anything but rpc/<function-name>.
 */
import { createServer, type Server } from 'node:http';
import postgres from 'postgres';
import type { AddressInfo } from 'node:net';

/**
 * Connection string for the scratch database the migrations were loaded into.
 * `pg-local-reset.sh` creates it as the current OS user, so the default avoids
 * the `postgres` superuser name that a scratch instance does not have.
 */
export const SHIM_DATABASE_URL =
  process.env.SHIM_DATABASE_URL ??
  `postgres://${process.env.USER ?? 'postgres'}@127.0.0.1:55432/downstash_test`;

export const SHIM_PORT = Number(process.env.SHIM_PORT ?? 54321);

/** Build the `select fn($1, $2, ...)` call for a JSON body of named args. */
export function buildCall(
  fn: string,
  body: Record<string, unknown>
): {
  text: string;
  values: unknown[];
} {
  const entries = Object.entries(body);
  if (entries.length === 0) return { text: `select * from ${fn}()`, values: [] };
  const names = entries.map((_, i) => `$${i + 1}`);
  const values = entries.map(([, v]) => v);
  // `select * from fn(...)` keeps the row shape PostgREST returns for a
  // function returning a scalar or a set.
  return {
    text: `select * from ${fn}(${names.join(', ')})`,
    values
  };
}

export interface ShimHandle {
  url: string;
  close(): Promise<void>;
}

/**
 * Start the shim. `fnPrefix` lets tests restrict which functions are callable
 * (default: the `downstash_gw_*` + failover surface).
 */
export async function startShim(opts?: {
  port?: number;
  databaseUrl?: string;
}): Promise<ShimHandle> {
  const port = opts?.port ?? SHIM_PORT;
  const sql = postgres(opts?.databaseUrl ?? SHIM_DATABASE_URL, {
    max: 5,
    onnotice: () => {}
  });

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && url.pathname === '/rest/v1/') {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, shim: true }));
      return;
    }

    const m = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(url.pathname);
    if (!m) {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'Not Found' }));
      return;
    }
    const fn = `${m[1]}`;
    const qualified = fn.startsWith('downstash') ? fn : fn;

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        body =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {};
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ code: '22023', message: 'invalid JSON body' }));
        return;
      }
    }

    try {
      const call = buildCall(qualified, body);
      if (process.env.SHIM_DEBUG) {
        const cmds = (body.p_commands as unknown[] | undefined) ?? [];
        for (const c of cmds) {
          const argv = c as unknown[];
          process.stdout.write(
            `[shim] ${String(argv[0] ?? '?').toUpperCase()} ${String(argv[1] ?? '').slice(0, 60)}\n`
          );
          if (
            String(argv[0] ?? '').toUpperCase() === 'EVAL' &&
            process.env.SHIM_DUMP_BODY
          ) {
            // Write the exact received body (JSON-escaped, one line) so a
            // debugger can hash it byte-for-byte outside Postgres.
            process.stdout.write(`[body] ${JSON.stringify(argv[1])}\n[/body]\n`);
          }
        }
      }
      const rows = await sql.unsafe(call.text, call.values as never);
      // PostgREST unwraps a single column.
      const out =
        rows.length === 1 && Object.keys(rows[0] ?? {}).length === 1
          ? Object.values(rows[0] as Record<string, unknown>)[0]
          : rows;
      res.statusCode = 200;
      res.end(typeof out === 'string' ? out : JSON.stringify(out));
    } catch (err) {
      const e = err as { code?: string; message?: string };
      res.statusCode = e.code === '42501' ? 401 : 400;
      res.end(
        JSON.stringify({ code: e.code ?? 'XX000', message: e.message ?? 'error' })
      );
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const addr = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          void sql.end({ timeout: 5 }).then(resolve);
        });
      })
  };
}
