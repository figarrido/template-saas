import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { createLogger } from '../src/logger.js';
import { getContext, withContext } from '../src/context.js';

function captureLines(): { lines: string[]; stream: Writable } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString('utf8').trim());
      cb();
    },
  });
  return { lines, stream };
}

function loggerWith(lines: string[], stream: Writable) {
  return pino(
    {
      base: { service: 'test', env: 'test' },
      redact: { paths: ['password', 'token', 'secret', 'authorization', 'cookie'], censor: '[REDACTED]' },
      mixin: () => ({ ...getContext() }),
    },
    stream,
  );
}

describe('logger', () => {
  it('emits standard fields from base config', () => {
    const log = createLogger({ service: 'svc-x', env: 'production' });
    expect(log.bindings()).toMatchObject({ service: 'svc-x', env: 'production' });
  });

  it('redacts sensitive keys', () => {
    const { lines, stream } = captureLines();
    const log = loggerWith(lines, stream);
    log.info({ password: 'p4ss', token: 'tkn', meta: 'safe' }, 'login');
    expect(lines[0]).toContain('[REDACTED]');
    expect(lines[0]).not.toContain('p4ss');
    expect(lines[0]).not.toContain('tkn');
    expect(lines[0]).toContain('safe');
  });

  it('attaches AsyncLocalStorage context via mixin', async () => {
    const { lines, stream } = captureLines();
    const log = loggerWith(lines, stream);
    await withContext(
      { request_id: 'r-1', org_id: 'org-1', user_id: 'u-1' },
      () =>
        new Promise<void>((resolve) => {
          log.info('inside');
          setImmediate(resolve);
        }),
    );
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.request_id).toBe('r-1');
    expect(parsed.org_id).toBe('org-1');
    expect(parsed.user_id).toBe('u-1');
  });
});
