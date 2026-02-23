-- Migration: Add user_consents table for required terms/privacy consent tracking
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  terms_required BOOLEAN NOT NULL DEFAULT false,
  privacy_required BOOLEAN NOT NULL DEFAULT false,
  marketing_optional BOOLEAN NOT NULL DEFAULT false,
  terms_version VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_updated_at
  ON user_consents(updated_at DESC);
