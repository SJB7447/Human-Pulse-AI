create table if not exists public.notification_prefs (
  user_id text primary key,
  breaking boolean not null default true,
  emotion boolean not null default false,
  keyword boolean not null default false,
  digest boolean not null default false,
  reporter_comment boolean not null default true,
  reporter_reply boolean not null default true,
  reporter_share_spike boolean not null default true,
  reporter_view_milestone boolean not null default true,
  reporter_article_published boolean not null default true,
  reporter_edit_requested boolean not null default true,
  reporter_weekly_summary boolean not null default true,
  admin_report boolean not null default true,
  admin_new_reporter boolean not null default true,
  admin_signup_spike boolean not null default true,
  admin_push_fail boolean not null default true,
  admin_edge_error boolean not null default true,
  admin_daily_stats boolean not null default true,
  admin_keyword_abuse boolean not null default true,
  quiet_hours_start varchar(5) not null default '22:00',
  quiet_hours_end varchar(5) not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs
  add column if not exists reporter_comment boolean not null default true,
  add column if not exists reporter_reply boolean not null default true,
  add column if not exists reporter_share_spike boolean not null default true,
  add column if not exists reporter_view_milestone boolean not null default true,
  add column if not exists reporter_article_published boolean not null default true,
  add column if not exists reporter_edit_requested boolean not null default true,
  add column if not exists reporter_weekly_summary boolean not null default true,
  add column if not exists admin_report boolean not null default true,
  add column if not exists admin_new_reporter boolean not null default true,
  add column if not exists admin_signup_spike boolean not null default true,
  add column if not exists admin_push_fail boolean not null default true,
  add column if not exists admin_edge_error boolean not null default true,
  add column if not exists admin_daily_stats boolean not null default true,
  add column if not exists admin_keyword_abuse boolean not null default true,
  add column if not exists quiet_hours_start varchar(5) not null default '22:00',
  add column if not exists quiet_hours_end varchar(5) not null default '07:00';

create table if not exists public.article_stats (
  article_id text primary key,
  reporter_id text not null,
  view_count integer not null default 0,
  share_count integer not null default 0,
  comment_count integer not null default 0,
  last_milestone integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_article_stats_reporter_updated
  on public.article_stats(reporter_id, updated_at desc);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  article_id text not null,
  reporter_id text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_reports_article_created
  on public.content_reports(article_id, created_at desc);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null,
  title text not null,
  body text not null default '',
  url text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_logs_user_created
  on public.notification_logs(user_id, created_at desc);

alter table public.push_subscriptions
  add column if not exists is_active boolean not null default true;

alter table public.notification_prefs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_prefs'
      and policyname = 'notification_prefs_select_own'
  ) then
    create policy notification_prefs_select_own
      on public.notification_prefs
      for select
      using (auth.uid()::text = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_prefs'
      and policyname = 'notification_prefs_insert_own'
  ) then
    create policy notification_prefs_insert_own
      on public.notification_prefs
      for insert
      with check (auth.uid()::text = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_prefs'
      and policyname = 'notification_prefs_update_own'
  ) then
    create policy notification_prefs_update_own
      on public.notification_prefs
      for update
      using (auth.uid()::text = user_id)
      with check (auth.uid()::text = user_id);
  end if;
end
$$;
