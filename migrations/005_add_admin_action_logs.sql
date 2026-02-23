-- Migration: Add admin_action_logs table for admin operation auditing
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT,
  actor_role VARCHAR(32) NOT NULL DEFAULT 'admin',
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL DEFAULT 'article',
  target_id VARCHAR NOT NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at
  ON admin_action_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target
  ON admin_action_logs(target_type, target_id);
