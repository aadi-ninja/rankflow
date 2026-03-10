-- ==================================
-- RankFlow — Add extension_synced to settings
-- ==================================

-- 1. Add extension_synced boolean column
ALTER TABLE settings ADD COLUMN IF NOT EXISTS extension_synced BOOLEAN DEFAULT false;
