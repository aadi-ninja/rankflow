-- ==================================
-- RankFlow — Supabase Database Schema
-- ==================================
-- Run this SQL in the Supabase SQL Editor to create the required tables.

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clips table
CREATE TABLE IF NOT EXISTS clips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  title TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('YouTube', 'TikTok', 'Instagram')),
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast session lookups
CREATE INDEX IF NOT EXISTS idx_clips_session_id ON clips(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access (since we're using the anon key)
CREATE POLICY "Allow all access to sessions" ON sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to clips" ON clips
  FOR ALL USING (true) WITH CHECK (true);

-- Settings table (stores API keys etc.)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  youtube_api_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to settings" ON settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default row
INSERT INTO settings (id) VALUES ('default') ON CONFLICT DO NOTHING;
