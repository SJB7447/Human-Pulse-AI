create table if not exists user_composed_articles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_article_id text not null,
  source_title text not null,
  source_url text,
  user_opinion text not null,
  extra_request text not null default '',
  requested_references text[] not null default ARRAY[]::text[],
  generated_title text not null,
  generated_summary text not null,
  generated_content text not null,
  reference_links text[] not null default ARRAY[]::text[],
  status varchar(16) not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_composed_articles_user_created
  on user_composed_articles(user_id, created_at desc);
