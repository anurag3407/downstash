/**
 * @file packages/protocol/src/types.ts
 * Shared protocol types used by the gateway, web and client.
 */
export type CommandFlag = 'read' | 'write' | 'cacheable' | 'admin' | 'script';
export type CommandFamily =
  | 'strings'
  | 'keyspace'
  | 'hashes'
  | 'lists'
  | 'sets'
  | 'zsets'
  | 'server'
  | 'scripting';
export type RedisValue = string | number | null | RedisValue[];
export type ResultEnvelope = { result: RedisValue } | { error: string };
export type RunMode = 'single' | 'pipeline' | 'multi';
export type TokenKind = 'standard' | 'readonly';

export interface CommandSpec {
  name: string; // uppercase
  arity: number; // Redis convention
  flags: readonly CommandFlag[];
  firstKey: number;
  lastKey: number;
  keyStep: number;
  family: CommandFamily;
  summary: string; // must equal command_registry.summary
  syntax: string;
}
