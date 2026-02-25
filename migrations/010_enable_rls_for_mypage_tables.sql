-- Enable RLS for tables exposed to PostgREST.
-- Server-side service role can still access these tables, while anon/auth
-- access is denied unless explicit policies are added.

alter table if exists public.user_insights enable row level security;
alter table if exists public.article_reviews enable row level security;
alter table if exists public.admin_action_logs enable row level security;
alter table if exists public.user_consents enable row level security;
alter table if exists public.user_composed_articles enable row level security;
