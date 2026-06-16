-- Postgres extensions required by every later migration.
--
-- pgmq + pg_cron live under their own schemas; moddatetime + pgcrypto sit in
-- `extensions` per Supabase convention. See docs/architecture/05-jobs.md and
-- docs/architecture/02-data.md § Schema conventions.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists moddatetime with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;

-- UUID v7 polyfill.
--
-- Postgres 17 ships native uuidv7() but Supabase's hosted PG version may lag.
-- The plan (docs/architecture/02-data.md § Schema conventions) picks the
-- well-known PL/pgSQL implementation so PKs are monotonic and b-tree friendly
-- from day one. Drop this function and re-point PKs once native v7 is
-- available everywhere.
create or replace function public.uuid_generate_v7() returns uuid
language plpgsql
volatile
as $$
declare
  unix_ts_ms bytea;
  uuid_bytes bytea;
begin
  unix_ts_ms := substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes := unix_ts_ms || gen_random_bytes(10);
  -- Set version (7) in the 7th byte: 0111xxxx
  uuid_bytes := set_byte(uuid_bytes, 6, (b'01110000'::bit(8) | get_byte(uuid_bytes, 6)::bit(8))::int);
  -- Set IETF variant in the 9th byte: 10xxxxxx
  uuid_bytes := set_byte(uuid_bytes, 8, (b'10000000'::bit(8) | (get_byte(uuid_bytes, 8) & x'3F'::int)::bit(8))::int);
  return encode(uuid_bytes, 'hex')::uuid;
end
$$;

comment on function public.uuid_generate_v7 is
  'UUID v7 polyfill. Replace with native uuidv7() once Supabase ships PG with native support.';
