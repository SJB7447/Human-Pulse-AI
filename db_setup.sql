-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Create news_items table
CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT,
  source TEXT NOT NULL,
  image TEXT,
  category TEXT,
  emotion TEXT NOT NULL CHECK (emotion IN ('joy', 'anger', 'sadness', 'fear', 'calm')),
  intensity INTEGER NOT NULL DEFAULT 50,
  views INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  platforms TEXT[] DEFAULT ARRAY['interactive'],
  is_published BOOLEAN DEFAULT true,
  author_id UUID,
  author_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id VARCHAR NOT NULL, -- Intentionally varchar to match schema definition, could be UUID if strictly enforcing FK
  reason TEXT NOT NULL,
  details TEXT,
  risk_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optional: Create an index on news_items emotion for faster filtering
CREATE INDEX IF NOT EXISTS idx_news_items_emotion ON news_items(emotion);
CREATE INDEX IF NOT EXISTS idx_news_items_created_at ON news_items(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policy: News Items are public read-only
CREATE POLICY "Public Read News" 
ON news_items FOR SELECT 
USING (true);

-- Policy: Reports can be created by anyone (anon)
CREATE POLICY "Public Create Reports" 
ON reports FOR INSERT 
WITH CHECK (true);

-- Policy: Reports are readable only by service role (implicitly denied for anon)
-- (No SELECT policy for reports means only service_role can read)

-- Policy: Users can read their own data (if auth is implemented later)
CREATE POLICY "Users Read Own Data" 
ON users FOR SELECT 
USING (auth.uid() = id);

-- Service Role (Server) has full access by default, no extra policy needed.

