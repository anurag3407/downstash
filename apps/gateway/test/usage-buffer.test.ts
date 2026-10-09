import { describe, expect, it } from 'vitest';
import { UsageBuffer } from '../src/core/usage-buffer.ts';

describe('UsageBuffer', () => {
  it('accumulates l1 hits and bytes', () => {
    const b = new UsageBuffer();
    b.addL1Hit('db');
    b.addL1Hit('db');
    b.addBytesOut('db', 100);
    b.addBytesOut('db', 50);
    expect(b.take('db')).toEqual({ l1Hits: 2, bytesOut: 150 });
  });
  it('take clears the buffer', () => {
    const b = new UsageBuffer();
    b.addL1Hit('db');
    b.take('db');
    expect(b.take('db')).toEqual({ l1Hits: 0, bytesOut: 0 });
  });
  it('keeps databases separate', () => {
    const b = new UsageBuffer();
    b.addL1Hit('db1');
    b.addBytesOut('db2', 10);
    expect(b.take('db1')).toEqual({ l1Hits: 1, bytesOut: 0 });
    expect(b.take('db2')).toEqual({ l1Hits: 0, bytesOut: 10 });
  });
  it('take on unknown db returns zeros', () => {
    const b = new UsageBuffer();
    expect(b.take('nope')).toEqual({ l1Hits: 0, bytesOut: 0 });
  });
});
