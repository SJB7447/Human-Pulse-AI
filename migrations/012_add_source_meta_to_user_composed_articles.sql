alter table if exists public.user_composed_articles
  add column if not exists source_emotion text not null default 'spectrum',
  add column if not exists source_category text not null default 'General';
