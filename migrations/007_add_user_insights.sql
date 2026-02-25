-- Migration: Add user_insights table for My Page insight persistence
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  original_title TEXT NOT NULL,
  user_comment TEXT NOT NULL,
  user_emotion TEXT NOT NULL,
  user_feeling_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_insights_user_id_created_at
  ON user_insights(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_insights_article_id
  ON user_insights(article_id);
