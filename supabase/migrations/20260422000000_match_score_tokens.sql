-- Padelaso: per-match ephemeral score tokens
-- Used by external clients (Apple Shortcuts on Apple Watch, etc.) to POST
-- score updates and events without holding a Supabase session cookie.
-- The API routes validate the token with a service-role client, so RLS here
-- only needs to let the match creator manage their own tokens from the UI.

create table public.match_score_tokens (
  token text primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);

create index idx_match_score_tokens_match_id on public.match_score_tokens(match_id);
create index idx_match_score_tokens_expires_at on public.match_score_tokens(expires_at);

alter table public.match_score_tokens enable row level security;

-- The creator can see their active tokens (to display in the scorekeeper UI)
create policy "Creator can view own tokens"
  on public.match_score_tokens for select
  to authenticated
  using (created_by = auth.uid());

-- The creator can mint tokens for matches they created
create policy "Creator can insert tokens for own matches"
  on public.match_score_tokens for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and match_id in (
      select id from public.matches where created_by = auth.uid()
    )
  );

-- The creator can revoke tokens (delete) manually
create policy "Creator can delete own tokens"
  on public.match_score_tokens for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- Enable Realtime publication for live-scoring subscribers
-- ============================================================
-- RLS still applies to Realtime — group members already have SELECT on
-- matches/match_events (see groups migration), so they can subscribe.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'matches'
  ) then
    execute 'alter publication supabase_realtime add table public.matches';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'match_events'
  ) then
    execute 'alter publication supabase_realtime add table public.match_events';
  end if;
end $$;
