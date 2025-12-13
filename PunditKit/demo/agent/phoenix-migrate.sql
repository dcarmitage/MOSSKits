-- Phoenix Migration: Wipe and rebuild all tables except settings
-- Run with: npx wrangler d1 execute pundit-db --file=./phoenix-migrate.sql --remote

-- Drop all tables in dependency order (settings preserved)
DROP TABLE IF EXISTS artifacts;
DROP TABLE IF EXISTS daily_snapshots;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS trades;
DROP TABLE IF EXISTS evaluations;
DROP TABLE IF EXISTS research_sources;
DROP TABLE IF EXISTS research_paths;
DROP TABLE IF EXISTS markets;
DROP TABLE IF EXISTS events;

-- Now create fresh tables from schema.sql
-- (This file should be run, then schema.sql should be run)
