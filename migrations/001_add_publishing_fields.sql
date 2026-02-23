-- Migration: Add missing columns for Admin features
-- Run this in your Supabase SQL Editor

ALTER TABLE news_items
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS author_id UUID,
ADD COLUMN IF NOT EXISTS author_name TEXT;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'news_items';
