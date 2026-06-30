-- Tempo AI Coach durable rate limiting for Supabase.
--
-- Run this once in Supabase Dashboard -> SQL Editor before setting
-- SUPABASE_URL and SUPABASE_SECRET_KEY in Netlify.
--
-- The Netlify Function calls public.tempo_check_rate_limit through Supabase's
-- REST RPC endpoint using a server-side secret key. The table lives in a
-- private schema and stores only hashed client keys plus short-lived counters.

begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.tempo_rate_limits (
  key text not null,
  bucket text not null,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  primary key (key, bucket)
);

create index if not exists tempo_rate_limits_reset_at_idx
  on private.tempo_rate_limits (reset_at);

alter table private.tempo_rate_limits enable row level security;

revoke all on table private.tempo_rate_limits from public;
revoke all on table private.tempo_rate_limits from anon;
revoke all on table private.tempo_rate_limits from authenticated;

grant usage on schema private to service_role;
grant select, insert, update, delete on table private.tempo_rate_limits to service_role;

create or replace function public.tempo_check_rate_limit(
  p_key text,
  p_window_bucket text,
  p_window_reset_at timestamptz,
  p_daily_bucket text,
  p_daily_reset_at timestamptz,
  p_window_limit integer,
  p_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_limit integer := greatest(1, least(50, coalesce(p_window_limit, 5)));
  v_daily_limit integer := greatest(1, least(500, coalesce(p_daily_limit, 20)));
  v_window_count integer;
  v_daily_count integer;
  v_window_retry_ms bigint;
  v_daily_retry_ms bigint;
begin
  delete from private.tempo_rate_limits
   where reset_at <= v_now;

  insert into private.tempo_rate_limits as rl (key, bucket, count, reset_at)
  values (p_key, 'w:' || p_window_bucket, 1, p_window_reset_at)
  on conflict (key, bucket) do update
    set count = rl.count + 1,
        reset_at = greatest(rl.reset_at, excluded.reset_at)
  returning count into v_window_count;

  insert into private.tempo_rate_limits as rl (key, bucket, count, reset_at)
  values (p_key, 'd:' || p_daily_bucket, 1, p_daily_reset_at)
  on conflict (key, bucket) do update
    set count = rl.count + 1,
        reset_at = greatest(rl.reset_at, excluded.reset_at)
  returning count into v_daily_count;

  v_window_retry_ms := greatest(1000, ceil(extract(epoch from (p_window_reset_at - v_now)) * 1000)::bigint);
  v_daily_retry_ms := greatest(1000, ceil(extract(epoch from (p_daily_reset_at - v_now)) * 1000)::bigint);

  if v_daily_count > v_daily_limit then
    return jsonb_build_object('ok', false, 'reason', 'daily', 'retryAfterMs', v_daily_retry_ms);
  end if;

  if v_window_count > v_window_limit then
    return jsonb_build_object('ok', false, 'reason', 'window', 'retryAfterMs', v_window_retry_ms);
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'retryAfterMs', 0);
end;
$$;

revoke all on function public.tempo_check_rate_limit(
  text, text, timestamptz, text, timestamptz, integer, integer
) from public;
revoke all on function public.tempo_check_rate_limit(
  text, text, timestamptz, text, timestamptz, integer, integer
) from anon;
revoke all on function public.tempo_check_rate_limit(
  text, text, timestamptz, text, timestamptz, integer, integer
) from authenticated;

grant execute on function public.tempo_check_rate_limit(
  text, text, timestamptz, text, timestamptz, integer, integer
) to service_role;

commit;
