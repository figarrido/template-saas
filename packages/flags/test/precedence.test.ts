import { describe, expect, it } from 'vitest';
import { resolveOverride, type OverrideRung } from '../src/precedence.js';

function rung(name: string, value: unknown | undefined): OverrideRung {
  return {
    name,
    lookup: async () => value as never,
  };
}

describe('resolveOverride', () => {
  it('returns first defined rung', async () => {
    const r = await resolveOverride([rung('admin', undefined), rung('env', true)], 'k', {});
    expect(r).toEqual({ value: true, source: 'env' });
  });

  it('returns undefined when all rungs are undefined', async () => {
    expect(await resolveOverride([rung('a', undefined), rung('b', undefined)], 'k', {})).toBeUndefined();
  });

  it('admin beats env beats url', async () => {
    const r = await resolveOverride(
      [rung('admin', 'A'), rung('env', 'E'), rung('url', 'U')],
      'k',
      {},
    );
    expect(r).toEqual({ value: 'A', source: 'admin' });
  });
});
