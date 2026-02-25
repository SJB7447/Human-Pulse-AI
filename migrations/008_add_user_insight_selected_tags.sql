-- Migration: Add selected_tags array column to user_insights
-- Run this in your Supabase SQL Editor

ALTER TABLE user_insights
ADD COLUMN IF NOT EXISTS selected_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
