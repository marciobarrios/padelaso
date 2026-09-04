-- Stable Apple Shortcut tokens (deployed migration).
--
-- Tokens remain valid until their owner explicitly rotates or revokes them.
-- Keep expires_at at a far-future sentinel for a backwards-compatible rollout:
-- an older web deployment can continue reading the column while the new code no
-- longer treats it as part of authorization.

alter table public.score_tokens
  alter column expires_at set default '9999-12-31 23:59:59+00'::timestamptz;

-- Preserve every existing token value, including previously expired ones. Only
-- tokens that had already expired become dormant; still-active matches keep
-- working during the rollout.
update public.score_tokens
set
  expires_at = '9999-12-31 23:59:59+00'::timestamptz,
  current_match_id = case
    when expires_at <= now() then null
    else current_match_id
  end;

drop index if exists public.idx_score_tokens_expires_at;

comment on column public.score_tokens.expires_at is
  'Legacy rollout column. Stable tokens do not expire; rows use a far-future sentinel.';

alter table public.score_tokens
  add column if not exists last_used_at timestamptz,
  add column if not exists rate_window_started_at timestamptz,
  add column if not exists rate_request_count integer not null default 0;

-- Validate, rate-limit, and record use in one row-locked operation so the
-- limit remains consistent across Vercel serverless instances.
create or replace function public.authorize_score_token(
  p_token text,
  p_rate_limit integer default 120,
  p_window_seconds integer default 60
) returns table (
  created_by uuid,
  current_match_id uuid,
  rate_limited boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_current_match_id uuid;
  v_window_started_at timestamptz;
  v_request_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_token is null or p_token = '' then
    return;
  end if;

  select
    st.created_by,
    st.current_match_id,
    st.rate_window_started_at,
    st.rate_request_count
  into
    v_created_by,
    v_current_match_id,
    v_window_started_at,
    v_request_count
  from public.score_tokens as st
  where st.token = p_token
  for update;

  if not found then
    return;
  end if;

  -- A stable token without a current match is intentionally dormant. These
  -- checks do not count as use and cannot mutate a previous match.
  if v_current_match_id is null then
    return query select v_created_by, v_current_match_id, false;
    return;
  end if;

  if v_window_started_at is null
    or v_window_started_at <= v_now - make_interval(secs => greatest(p_window_seconds, 1))
  then
    v_window_started_at := v_now;
    v_request_count := 1;
  else
    v_request_count := v_request_count + 1;
  end if;

  rate_limited := v_request_count > greatest(p_rate_limit, 1);

  update public.score_tokens
  set
    rate_window_started_at = v_window_started_at,
    rate_request_count = v_request_count,
    last_used_at = case when rate_limited then last_used_at else v_now end
  where token = p_token;

  return query select v_created_by, v_current_match_id, rate_limited;
end;
$$;

revoke all on function public.authorize_score_token(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.authorize_score_token(text, integer, integer)
  to service_role;
