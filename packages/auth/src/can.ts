// Authorization truth table for org-scoped actions.
//
// Derived projects extend this by widening Role / Action and adding rows.
// docs/architecture/03-auth.md: "Central `can(membership, action)` helper".

export type Role = 'owner' | 'manager' | 'member';

export type Action =
  | 'org:read'
  | 'org:update'
  | 'org:delete'
  | 'member:invite'
  | 'member:remove'
  | 'member:change-role'
  | 'billing:read'
  | 'billing:manage'
  | 'invoice:read'
  | 'flag:override';

export type Membership = {
  user_id: string;
  organization_id: string;
  role: Role;
};

const TABLE: Record<Action, ReadonlyArray<Role>> = {
  'org:read': ['owner', 'manager', 'member'],
  'org:update': ['owner', 'manager'],
  'org:delete': ['owner'],
  'member:invite': ['owner', 'manager'],
  'member:remove': ['owner', 'manager'],
  'member:change-role': ['owner'],
  'billing:read': ['owner', 'manager'],
  'billing:manage': ['owner'],
  'invoice:read': ['owner', 'manager'],
  'flag:override': ['owner'],
};

export function can(membership: Membership | null | undefined, action: Action): boolean {
  if (!membership) return false;
  return TABLE[action].includes(membership.role);
}

export function assertCan(membership: Membership | null | undefined, action: Action): void {
  if (!can(membership, action)) {
    throw new ForbiddenError(action);
  }
}

export class ForbiddenError extends Error {
  override readonly name = 'ForbiddenError';
  constructor(public readonly action: Action) {
    super(`Not allowed: ${action}`);
  }
}
