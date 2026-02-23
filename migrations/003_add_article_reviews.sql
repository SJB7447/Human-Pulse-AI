-- Migration: Add article_reviews table for admin review persistence
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS article_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id VARCHAR NOT NULL UNIQUE,
  completed BOOLEAN NOT NULL DEFAULT false,
  issues TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_reviews_updated_at
  ON article_reviews(updated_at DESC);
