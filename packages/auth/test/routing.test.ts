import { describe, expect, it } from 'vitest';
import { destinationForOrganizations } from '../src/flows/routing.js';

describe('destinationForOrganizations', () => {
  it('routes a User with zero organizations to the first-org onboarding stub', () => {
    expect(destinationForOrganizations([])).toEqual({
      kind: 'onboarding',
      path: '/onboarding/first-org',
    });
  });

  it("routes a User with exactly one organization to that org's dashboard", () => {
    expect(destinationForOrganizations([{ slug: 'acme' }])).toEqual({
      kind: 'dashboard',
      path: '/acme/dashboard',
      orgSlug: 'acme',
    });
  });

  it('routes a User with multiple organizations to the picker', () => {
    expect(
      destinationForOrganizations([{ slug: 'acme' }, { slug: 'beta' }]),
    ).toEqual({ kind: 'picker', path: '/orgs' });
  });
});
