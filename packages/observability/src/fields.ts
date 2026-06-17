// Standard log/span/event field set per docs/architecture/06-observability.md.
// Every Node and Python logger emits these. Adding a new field here means
// updating both sides — the Python mirror in `python/` lives under the
// services/worker-py package and reads the same names.

export type LogContext = {
  service?: string;
  env?: string;
  request_id?: string;
  job_id?: string;
  org_id?: string;
  user_id?: string;
  trace_id?: string;
  span_id?: string;
  release?: string;
};

export const STANDARD_FIELDS = [
  'service',
  'env',
  'request_id',
  'job_id',
  'org_id',
  'user_id',
  'trace_id',
  'span_id',
  'release',
] as const;

export type StandardField = (typeof STANDARD_FIELDS)[number];
