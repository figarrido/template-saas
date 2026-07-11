export { getUserClient, type UserClient, type UserClientConfig, type CookieAdapter } from './getUserClient.js';
export {
  getServiceClient,
  type ServiceClient,
  type ServiceClientConfig,
  schema,
} from './getServiceClient.js';
export type { Database } from './types/database.types.js';
export type EntitlementKey =
  import('./types/database.types.js').Database['public']['Enums']['entitlement_key'];
