alter table if exists public.user_composed_articles
  add column if not exists submission_status varchar(16) not null default 'pending',
  add column if not exists moderation_memo text not null default '',
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_user_composed_articles_submission_status
  on public.user_composed_articles(submission_status, created_at desc);
