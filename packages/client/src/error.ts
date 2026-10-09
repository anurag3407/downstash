/**
 * @file packages/client/src/error.ts
 * Error type surfaced by the client, carrying command + source context.
 */
export class DownstashError extends Error {
  readonly command: string | undefined; // uppercase command name, if known
  readonly source: 'gateway' | 'rpc';
  readonly status: number | undefined;

  constructor(
    message: string,
    opts: {
      command?: string | undefined;
      source: 'gateway' | 'rpc';
      status?: number | undefined;
      cause?: unknown;
    }
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'DownstashError';
    this.command = opts.command;
    this.source = opts.source;
    this.status = opts.status;
  }
}
