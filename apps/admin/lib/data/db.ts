import 'server-only';
import { getServiceClient } from '@template/db';
import { env } from '@template/env/admin';

// Admin app uses the service-role client per docs/architecture/02-data.md.
let _db: ReturnType<typeof getServiceClient> | undefined;
export function getAdminDb() {
  _db ??= getServiceClient({ databaseUrl: env.ADMIN_DATABASE_URL });
  return _db;
}
