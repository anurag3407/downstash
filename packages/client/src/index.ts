/**
 * @file packages/client/src/index.ts
 * Public API of @downstash/client (§10.1).
 */
export { Downstash } from './downstash.ts';
export { DownstashError } from './error.ts';
export { createDownstashRequester } from './requester.ts';
export type {
  Command,
  DownstashConfig,
  DownstashFallbackConfig,
  FailoverEvent,
  RawEnvelopeOrArray
} from './types.ts';
export type {
  Requester,
  UpstashRequest,
  UpstashResponse
} from './requester.ts';
export type { ResultEnvelope, RedisValue } from '@downstash/protocol';
