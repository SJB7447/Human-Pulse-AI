-- Bootstrap schema for a fresh Supabase project used by Human Pulse AI.
-- Safe to run on a new project. Review before applying on an existing project.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text,
  google_id text unique
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  content text,
  source text not null,
  image text,
  category text,
  emotion text not null check (emotion in ('vibrance', 'immersion', 'clarity', 'gravity', 'serenity', 'spectrum')),
  intensity integer not null default 50,
  views integer not null default 0,
  saves integer not null default 0,
  platforms text[] not null default array['interactive']::text[],
  is_published boolean not null default true,
  author_id text,
  author_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_items_emotion_published_created
  on public.news_items(emotion, is_published, created_at desc);

create index if not exists idx_news_items_created_at
  on public.news_items(created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  article_id varchar not null,
  reason text not null,
  details text,
  risk_score integer default 0,
  status varchar(32) not null default 'reported',
  sanction_type varchar(32) not null default 'none',
  resolution text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_status_created_at
  on public.reports(status, created_at desc);

create table if not exists public.article_reviews (
  id uuid primary key default gen_random_uuid(),
  article_id varchar not null unique,
  completed boolean not null default false,
  issues text[] not null default array[]::text[],
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_article_reviews_updated_at
  on public.article_reviews(updated_at desc);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  terms_required boolean not null default false,
  privacy_required boolean not null default false,
  marketing_optional boolean not null default false,
  terms_version varchar(64) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_consents_updated_at
  on public.user_consents(updated_at desc);

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  actor_role varchar(32) not null default 'admin',
  action varchar(64) not null,
  target_type varchar(32) not null default 'article',
  target_id varchar not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_action_logs_created_at
  on public.admin_action_logs(created_at desc);

create index if not exists idx_admin_action_logs_target
  on public.admin_action_logs(target_type, target_id);

create table if not exists public.user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  article_id text not null,
  original_title text not null,
  user_comment text not null,
  user_emotion text not null,
  user_feeling_text text not null default '',
  selected_tags text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_insights_user_id_created_at
  on public.user_insights(user_id, created_at desc);

create index if not exists idx_user_insights_article_id
  on public.user_insights(article_id);

create table if not exists public.user_composed_articles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_article_id text not null,
  source_title text not null,
  source_url text,
  source_emotion text not null default 'spectrum',
  source_category text not null default 'General',
  user_opinion text not null,
  extra_request text not null default '',
  requested_references text[] not null default array[]::text[],
  generated_title text not null,
  generated_summary text not null,
  generated_content text not null,
  reference_links text[] not null default array[]::text[],
  status varchar(16) not null default 'draft',
  submission_status varchar(16) not null default 'pending',
  moderation_memo text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_composed_articles_user_created
  on public.user_composed_articles(user_id, created_at desc);

create index if not exists idx_user_composed_articles_submission_status
  on public.user_composed_articles(submission_status, created_at desc);

alter table if exists public.user_insights enable row level security;
alter table if exists public.article_reviews enable row level security;
alter table if exists public.admin_action_logs enable row level security;
alter table if exists public.user_consents enable row level security;
alter table if exists public.user_composed_articles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-media',
  'article-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
