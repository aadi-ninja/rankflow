-- ==================================
-- RankFlow — Add thumbnail_url to clips
-- ==================================

-- 1. Add thumbnail_url column to clips table
ALTER TABLE clips ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- 2. No RLS changes needed (inherits from existing clips policies)
