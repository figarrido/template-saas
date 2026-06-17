import type {
  EvaluationContext,
  JsonValue,
  Logger,
  Provider,
  ResolutionDetails,
} from '@openfeature/server-sdk';
import { OpenFeatureEventEmitter, StandardResolutionReasons } from '@openfeature/server-sdk';
import { PostHog } from 'posthog-node';
import type { EvalContext } from '../precedence.js';

export type PostHogProviderConfig = {
  projectApiKey: string;
  host?: string;
};

/**
 * OpenFeature provider backed by PostHog feature flags. Reference adapter
 * per docs/architecture/10-feature-flags.md. The flag value PostHog returns
 * is what `resolveBooleanEvaluation`/etc. delivers — overrides (env, URL,
 * admin DB) live above this layer in the precedence chain.
 */
export class PostHogFlagsProvider implements Provider {
  readonly metadata = { name: 'PostHogFlags' };
  readonly runsOn = 'server' as const;
  readonly events = new OpenFeatureEventEmitter();
  hooks = [];

  private readonly client: PostHog;

  constructor(config: PostHogProviderConfig) {
    this.client = new PostHog(config.projectApiKey, {
      host: config.host ?? 'https://us.i.posthog.com',
    });
  }

  initialize(_context?: EvaluationContext): Promise<void> {
    return Promise.resolve();
  }

  async onClose(): Promise<void> {
    await this.client.shutdown();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvalContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    const v = await this.client.isFeatureEnabled(flagKey, distinctId(context), {
      groups: context.organizationId ? { organization: context.organizationId } : undefined,
    });
    if (typeof v === 'boolean') return { value: v, reason: StandardResolutionReasons.TARGETING_MATCH };
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvalContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    const v = await this.client.getFeatureFlag(flagKey, distinctId(context), {
      groups: context.organizationId ? { organization: context.organizationId } : undefined,
    });
    if (typeof v === 'string') return { value: v, reason: StandardResolutionReasons.TARGETING_MATCH };
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvalContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    const v = await this.client.getFeatureFlag(flagKey, distinctId(context));
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (!Number.isNaN(n)) return { value: n, reason: StandardResolutionReasons.TARGETING_MATCH };
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    const v = await this.client.getFeatureFlagPayload(flagKey, distinctId(context as EvalContext));
    if (v !== undefined && v !== null) {
      return { value: v as T, reason: StandardResolutionReasons.TARGETING_MATCH };
    }
    return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
  }
}

function distinctId(ctx: EvalContext): string {
  return ctx.userId ?? `anon:${ctx.organizationId ?? 'no-org'}`;
}
