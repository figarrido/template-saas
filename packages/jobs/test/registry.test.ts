import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineJob, DEFAULT_BACKOFF_SECONDS, DEFAULT_MAX_ATTEMPTS } from '../src/defineJob.js';
import { JobRegistry } from '../src/registry.js';
import { makeEnvelope, ENVELOPE_SCHEMA } from '../src/envelope.js';

describe('defineJob + registry', () => {
  it('default retry curve matches docs', () => {
    expect(DEFAULT_BACKOFF_SECONDS).toEqual([30, 120, 600, 3600, 21_600]);
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);
  });

  it('registers by name and queue', () => {
    const job = defineJob({
      name: 'email.send',
      queue: 'emails',
      payload: z.object({ to: z.string().email() }),
      handler: async () => {},
    });
    const r = new JobRegistry();
    r.register(job);
    expect(r.get('email.send')?.name).toBe('email.send');
    expect(r.forQueue('emails')).toHaveLength(1);
  });

  it('rejects duplicate registrations', () => {
    const job = defineJob({ name: 'dup', queue: 'q', payload: z.any(), handler: async () => {} });
    const r = new JobRegistry();
    r.register(job);
    expect(() => r.register(job)).toThrow();
  });
});

describe('envelope', () => {
  it('round-trips through schema', () => {
    const e = makeEnvelope({ name: 'x', payload: { a: 1 }, trace: { traceparent: 'tp' } });
    const parsed = ENVELOPE_SCHEMA.parse(e);
    expect(parsed.name).toBe('x');
    expect(parsed.attempt).toBe(0);
    expect(parsed.traceparent).toEqual({ traceparent: 'tp' });
  });
});
