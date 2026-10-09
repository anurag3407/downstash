/**
 * @file apps/gateway/src/middleware/cors.ts
 * CORS per §9.5. `*` allows all; a comma list echoes a listed Origin.
 */

/** Resolve the `Access-Control-Allow-Origin` value for a request, or null. */
export function resolveCorsOrigin(allowedOrigins: string, requestOrigin: string | null): string | null {
  if (allowedOrigins === '*') return '*';
  if (!requestOrigin) return null;
  const list = allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(requestOrigin) ? requestOrigin : null;
}

const DEFAULT_ALLOW_HEADERS =
  'Authorization, Content-Type, Upstash-Encoding, Upstash-Sync-Token, Upstash-Response-Format';

/** Build a 204 preflight response. */
export function preflightResponse(allowedOrigins: string, req: Request): Response {
  const origin = resolveCorsOrigin(allowedOrigins, req.headers.get('Origin'));
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') ?? DEFAULT_ALLOW_HEADERS,
    'Access-Control-Max-Age': '86400'
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return new Response(null, { status: 204, headers: h });
}
