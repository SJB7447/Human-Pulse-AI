-- Migration: Add workflow columns to reports table for admin moderation flow
-- Run this in your Supabase SQL Editor

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'reported',
  ADD COLUMN IF NOT EXISTS sanction_type VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
  ON reports(status, created_at DESC);
