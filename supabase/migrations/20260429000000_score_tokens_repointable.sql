-- Padelaso: per-user re-pointable score tokens
-- Replaces match_score_tokens (per-match, immutable target) with score_tokens
-- (per-user, mutable current_match_id). The Shortcut URL never changes; the
-- server resolves which match the token currently controls. Drop+recreate is
-- safe because the prior table was less than a week old with a single user.

drop table if exists public.match_score_tokens;

create table public.score_tokens (
  token text primary key,
  created_by uuid not null unique references auth.users(id) on delete cascade,
  current_match_id uuid references public.matches(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz default now() not null,
  rotated_at timestamptz
);

create index idx_score_tokens_current_match_id on public.score_tokens(current_match_id);
create index idx_score_tokens_expires_at on public.score_tokens(expires_at);

alter table public.score_tokens enable row level security;

-- The owner can see their token row (to render the SetupView state)
create policy "Owner can view own token"
  on public.score_tokens for select
  to authenticated
  using (created_by = auth.uid());

-- The owner can mint a token for themselves; current_match_id (if set)
-- must be a match they created
create policy "Owner can insert own token"
  on public.score_tokens for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      current_match_id is null
      or current_match_id in (
        select id from public.matches where created_by = auth.uid()
      )
    )
  );

-- The owner can repoint, rotate, and clear current_match_id
create policy "Owner can update own token"
  on public.score_tokens for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (
      current_match_id is null
      or current_match_id in (
        select id from public.matches where created_by = auth.uid()
      )
    )
  );

-- The owner can revoke (delete) their token
create policy "Owner can delete own token"
  on public.score_tokens for delete
  to authenticated
  using (created_by = auth.uid());
