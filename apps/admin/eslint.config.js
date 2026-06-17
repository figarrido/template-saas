import next from '@template/config/eslint/next';

// apps/admin legitimately uses getServiceClient (Drizzle + service role
// per docs/architecture/02-data.md). Do NOT apply the banServiceClient
// rule here — the ban scopes to apps/web/** only.
export default [...next];
