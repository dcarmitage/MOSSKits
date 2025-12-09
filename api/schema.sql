-- Settings table for API keys and configuration
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  audio_key TEXT NOT NULL,
  duration_seconds INTEGER,
  speaker_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'failed')),
  processing_phase TEXT CHECK (processing_phase IN ('transcribing', 'extracting', 'compiling', NULL)),
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Transcript segments for speaker-labeled parts
CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL
);

-- Memories (compiled from recordings)
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Key moments from recordings
CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  context TEXT,
  significance TEXT
);

-- Entities extracted from recordings
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('person', 'place', 'thing', 'pattern', 'era', 'phrase')),
  portrait TEXT,
  confidence TEXT DEFAULT 'emerging' CHECK (confidence IN ('emerging', 'developing', 'established')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Entity mentions in recordings
CREATE TABLE IF NOT EXISTS mentions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  context TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Entity connections
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  related_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  evidence TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Images associated with recordings
CREATE TABLE IF NOT EXISTS recording_images (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at);
CREATE INDEX IF NOT EXISTS idx_transcripts_recording_id ON transcripts(recording_id);
CREATE INDEX IF NOT EXISTS idx_segments_transcript_id ON transcript_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_memories_recording_id ON memories(recording_id);
CREATE INDEX IF NOT EXISTS idx_moments_memory_id ON moments(memory_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_mentions_entity_id ON mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_mentions_recording_id ON mentions(recording_id);
CREATE INDEX IF NOT EXISTS idx_connections_entity_id ON connections(entity_id);
