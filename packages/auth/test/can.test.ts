import { describe, expect, it } from 'vitest';
import { assertCan, can, ForbiddenError, type Membership } from '../src/can.js';

const owner: Membership = { user_id: 'u', organization_id: 'o', role: 'owner' };
const admin: Membership = { user_id: 'u', organization_id: 'o', role: 'admin' };
const member: Membership = { user_id: 'u', organization_id: 'o', role: 'member' };

describe('can()', () => {
  it('grants every action to owner', () => {
    expect(can(owner, 'org:delete')).toBe(true);
    expect(can(owner, 'billing:manage')).toBe(true);
    expect(can(owner, 'flag:override')).toBe(true);
  });

  it('lets admin manage members but not delete org or override flags', () => {
    expect(can(admin, 'member:invite')).toBe(true);
    expect(can(admin, 'org:delete')).toBe(false);
    expect(can(admin, 'flag:override')).toBe(false);
  });

  it('restricts member to read-only org actions', () => {
    expect(can(member, 'org:read')).toBe(true);
    expect(can(member, 'org:update')).toBe(false);
    expect(can(member, 'member:invite')).toBe(false);
    expect(can(member, 'invoice:read')).toBe(false);
  });

  it('rejects null membership', () => {
    expect(can(null, 'org:read')).toBe(false);
    expect(can(undefined, 'org:read')).toBe(false);
  });

  it('assertCan throws ForbiddenError on deny', () => {
    expect(() => assertCan(member, 'org:delete')).toThrow(ForbiddenError);
  });
});
