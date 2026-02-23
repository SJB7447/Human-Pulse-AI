-- Migration to add Google Auth support

-- Add google_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- Make password optional (nullable)
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
