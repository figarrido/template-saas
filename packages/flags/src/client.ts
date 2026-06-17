import { OpenFeature, type Client, type Provider } from '@openfeature/server-sdk';
import type { EvalContext, OverrideRung } from './precedence.js';
import { resolveOverride } from './precedence.js';

export type FlagsClientConfig = {
  provider: Provider;
  /** Override rungs in precedence order (highest first). */
  overrides?: OverrideRung[];
};

let configured: { client: Client; overrides: OverrideRung[] } | undefined;

/**
 * Install the OpenFeature provider once per process and stash overrides so
 * every flag check walks the same precedence chain.
 */
export async function configureFlags(config: FlagsClientConfig): Promise<Client> {
  await OpenFeature.setProviderAndWait(config.provider);
  const client = OpenFeature.getClient();
  configured = { client, overrides: config.overrides ?? [] };
  return client;
}

export function getClient(): Client {
  if (!configured) throw new Error('configureFlags has not been called');
  return configured.client;
}

export async function getBoolean(
  key: string,
  defaultValue: boolean,
  ctx: EvalContext,
): Promise<boolean> {
  if (!configured) throw new Error('configureFlags has not been called');
  const override = await resolveOverride(configured.overrides, key, ctx);
  if (override !== undefined) return Boolean(override.value);
  return configured.client.getBooleanValue(key, defaultValue, ctx);
}

export async function getString(
  key: string,
  defaultValue: string,
  ctx: EvalContext,
): Promise<string> {
  if (!configured) throw new Error('configureFlags has not been called');
  const override = await resolveOverride(configured.overrides, key, ctx);
  if (override !== undefined) return String(override.value);
  return configured.client.getStringValue(key, defaultValue, ctx);
}
