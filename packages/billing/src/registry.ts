import type { BillingProvider } from './provider.js';
import type { EmitterProvider } from './emitter.js';

export type ProviderRoute = {
  /** Match key — e.g. `country=CL`, `org=acme`. Falsy = global default. */
  match?: (ctx: RouteContext) => boolean;
  provider: BillingProvider;
};

export type EmitterRoute = {
  match?: (ctx: RouteContext) => boolean;
  emitter: EmitterProvider;
};

export type RouteContext = {
  organizationId: string;
  country?: string;
  currency?: string;
};

/**
 * Provider router. Derived projects can register multiple billing providers
 * (e.g. Stripe global + Fintoc Chile) and the router picks the first match.
 */
export class BillingRegistry {
  private readonly providers: ProviderRoute[] = [];
  private readonly emitters: EmitterRoute[] = [];

  registerProvider(route: ProviderRoute): void {
    this.providers.push(route);
  }

  registerEmitter(route: EmitterRoute): void {
    this.emitters.push(route);
  }

  resolveProvider(ctx: RouteContext): BillingProvider {
    for (const r of this.providers) {
      if (!r.match || r.match(ctx)) return r.provider;
    }
    throw new Error(`No BillingProvider matched ${JSON.stringify(ctx)}`);
  }

  resolveEmitter(ctx: RouteContext): EmitterProvider | null {
    for (const r of this.emitters) {
      if (!r.match || r.match(ctx)) return r.emitter;
    }
    return null;
  }
}
