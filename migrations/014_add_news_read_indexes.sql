-- Reduce sort/filter cost for the hottest published-news queries.
-- Keep these indexes smaller with a partial predicate so they build faster
-- and match the current API access pattern more closely.

create index if not exists idx_news_items_published_created_at
  on public.news_items(created_at desc)
  where is_published = true;

create index if not exists idx_news_items_emotion_published_created_at
  on public.news_items(emotion, created_at desc)
  where is_published = true;
