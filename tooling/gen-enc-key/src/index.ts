#!/usr/bin/env node
/**
 * @file tooling/gen-enc-key/src/index.ts
 * CLI: prints a random 32-byte hex key for TOKEN_ENCRYPTION_KEY.
 * Usage: pnpm gen:enc-key
 */
import { generateKeyHex } from './crypto.ts';

const key = generateKeyHex();
process.stdout.write(`${key}\n`);
