-- ═══════════════════════════════════════════════════════════════
-- RecordX - Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up your tables
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Recordings Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recordings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Recording',
  mode TEXT NOT NULL DEFAULT 'screen_only',
  duration_ms BIGINT NOT NULL DEFAULT 0,
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'video/webm',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster user-based queries
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at DESC);

-- ─── Transcripts Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recording_id UUID NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'id-ID',
  segments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_recording_id ON transcripts(recording_id);

-- ─── MoM Documents Table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS mom_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  recording_id UUID NOT NULL UNIQUE REFERENCES recordings(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mom_documents_recording_id ON mom_documents(recording_id);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Users can only access their own data
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mom_documents ENABLE ROW LEVEL SECURITY;

-- ─── Recordings Policies ─────────────────────────────────────
CREATE POLICY "Users can view own recordings"
  ON recordings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recordings"
  ON recordings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recordings"
  ON recordings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recordings"
  ON recordings FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Transcripts Policies ────────────────────────────────────
CREATE POLICY "Users can view own transcripts"
  ON transcripts FOR SELECT
  USING (
    recording_id IN (
      SELECT id FROM recordings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own transcripts"
  ON transcripts FOR INSERT
  WITH CHECK (
    recording_id IN (
      SELECT id FROM recordings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own transcripts"
  ON transcripts FOR UPDATE
  USING (
    recording_id IN (
      SELECT id FROM recordings WHERE user_id = auth.uid()
    )
  );

-- ─── MoM Documents Policies ─────────────────────────────────
CREATE POLICY "Users can view own MoM documents"
  ON mom_documents FOR SELECT
  USING (
    recording_id IN (
      SELECT id FROM recordings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own MoM documents"
  ON mom_documents FOR INSERT
  WITH CHECK (
    recording_id IN (
      SELECT id FROM recordings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own MoM documents"
  ON mom_documents FOR UPDATE
  USING (
    recording_id IN (
      SELECT id FROM recordings WHERE user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- STORAGE BUCKET
-- Run this after creating the 'recordings' bucket in the dashboard
-- ═══════════════════════════════════════════════════════════════

-- Storage policies (apply after creating 'recordings' bucket)
-- Users can upload to their own folder
CREATE POLICY "Users can upload own recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own recordings
CREATE POLICY "Users can view own recording files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own recordings
CREATE POLICY "Users can delete own recording files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
