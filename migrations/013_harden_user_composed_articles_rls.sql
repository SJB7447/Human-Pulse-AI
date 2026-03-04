-- Harden RLS posture for public.user_composed_articles (idempotent).
-- Safe to run multiple times in production.

alter table if exists public.user_composed_articles
  enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_composed_articles'
      and policyname = 'uca_select_own'
  ) then
    create policy uca_select_own
      on public.user_composed_articles
      for select
      to authenticated
      using (user_id = auth.uid()::text);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_composed_articles'
      and policyname = 'uca_insert_own'
  ) then
    create policy uca_insert_own
      on public.user_composed_articles
      for insert
      to authenticated
      with check (user_id = auth.uid()::text);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_composed_articles'
      and policyname = 'uca_update_own'
  ) then
    create policy uca_update_own
      on public.user_composed_articles
      for update
      to authenticated
      using (user_id = auth.uid()::text)
      with check (user_id = auth.uid()::text);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_composed_articles'
      and policyname = 'uca_delete_own'
  ) then
    create policy uca_delete_own
      on public.user_composed_articles
      for delete
      to authenticated
      using (user_id = auth.uid()::text);
  end if;
end $$;

-- Optional hardening for stricter environments:
-- alter table public.user_composed_articles force row level security;
