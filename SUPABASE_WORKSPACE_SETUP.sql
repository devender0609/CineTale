-- CineTale v1.9.14 signed-in cloud workspace setup / repair
-- Run once in the Supabase SQL Editor for the SAME project used by CineTale Auth.
-- Safe to run again: table, grants and RLS policies are idempotent.

create table if not exists public.cinetale_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- PostgREST requires table privileges in addition to RLS policies.
-- Grant only authenticated app users; RLS below still limits every row to auth.uid().
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.cinetale_workspaces to authenticated;
revoke all on table public.cinetale_workspaces from anon;

alter table public.cinetale_workspaces enable row level security;

drop policy if exists "Users can read own CineTale workspace" on public.cinetale_workspaces;
create policy "Users can read own CineTale workspace"
on public.cinetale_workspaces for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own CineTale workspace" on public.cinetale_workspaces;
create policy "Users can create own CineTale workspace"
on public.cinetale_workspaces for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own CineTale workspace" on public.cinetale_workspaces;
create policy "Users can update own CineTale workspace"
on public.cinetale_workspaces for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own CineTale workspace" on public.cinetale_workspaces;
create policy "Users can delete own CineTale workspace"
on public.cinetale_workspaces for delete
to authenticated
using (auth.uid() = user_id);
