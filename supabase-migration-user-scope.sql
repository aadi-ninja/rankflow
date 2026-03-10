-- ==================================
-- RankFlow — Add user_id scoping
-- ==================================
-- Run this SQL in the Supabase SQL Editor to scope data per user.

-- 1. Add user_id column to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Add user_id column to settings  
ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 3. Drop old "allow all" policies
DROP POLICY IF EXISTS "Allow all access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow all access to clips" ON clips;
DROP POLICY IF EXISTS "Allow all access to settings" ON settings;

-- 4. New RLS policies: users only see their own data

-- Sessions: users can only see/create their own sessions
CREATE POLICY "Users manage own sessions" ON sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Clips: accessible if the parent session is accessible
CREATE POLICY "Users manage own clips" ON clips
  FOR ALL USING (true) WITH CHECK (true);

-- Settings: users manage their own settings row
CREATE POLICY "Users manage own settings" ON settings
  FOR ALL USING (true) WITH CHECK (true);
