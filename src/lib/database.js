import { getSupabase } from './supabase.js';
import { TABLES } from '../utils/constants.js';

// ═══════════════════════════════════════════════════════════════
// RECORDINGS CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new recording entry in the database
 * @param {object} recording - Recording metadata
 * @param {string} recording.title - Recording title
 * @param {string} recording.mode - Recording mode
 * @param {number} recording.duration_ms - Duration in milliseconds
 * @param {number} recording.file_size - File size in bytes
 * @param {string} recording.storage_path - Supabase storage path
 * @param {string} recording.mime_type - MIME type
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function createRecording(recording) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.RECORDINGS)
    .insert(recording)
    .select()
    .single();

  return { data, error };
}

/**
 * Get all recordings for the current user
 * @param {object} [options] - Query options
 * @param {number} [options.page=0] - Page number (0-indexed)
 * @param {number} [options.limit=20] - Items per page
 * @param {string} [options.search] - Search term
 * @returns {Promise<{data: object[], count: number, error: object|null}>}
 */
export async function getRecordings({ page = 0, limit = 20, search } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { data: [], count: 0, error: new Error('Supabase not configured') };

  let query = supabase
    .from(TABLES.RECORDINGS)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error, count } = await query;

  return { data: data || [], count: count || 0, error };
}

/**
 * Get a single recording by ID
 * @param {string} id - Recording ID
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function getRecordingById(id) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.RECORDINGS)
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

/**
 * Update a recording's metadata
 * @param {string} id - Recording ID
 * @param {object} updates - Fields to update
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function updateRecording(id, updates) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.RECORDINGS)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a recording from the database
 * @param {string} id - Recording ID
 * @returns {Promise<{error: object|null}>}
 */
export async function deleteRecording(id) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase not configured') };

  const { error } = await supabase
    .from(TABLES.RECORDINGS)
    .delete()
    .eq('id', id);

  return { error };
}

// ═══════════════════════════════════════════════════════════════
// TRANSCRIPTS CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Save a transcript for a recording
 * @param {object} transcript
 * @param {string} transcript.recording_id - Associated recording ID
 * @param {string} transcript.content - Full transcript text
 * @param {string} transcript.language - Language code (e.g. 'id-ID')
 * @param {object[]} [transcript.segments] - Timestamped segments
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function saveTranscript(transcript) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.TRANSCRIPTS)
    .upsert(transcript, { onConflict: 'recording_id' })
    .select()
    .single();

  return { data, error };
}

/**
 * Get the transcript for a recording
 * @param {string} recordingId - Recording ID
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function getTranscript(recordingId) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.TRANSCRIPTS)
    .select('*')
    .eq('recording_id', recordingId)
    .single();

  return { data, error };
}

// ═══════════════════════════════════════════════════════════════
// MOM DOCUMENTS CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Save a MoM document
 * @param {object} mom
 * @param {string} mom.recording_id - Associated recording ID
 * @param {string} mom.title - Meeting title
 * @param {object} mom.content - Structured MoM content
 * @param {boolean} [mom.is_ai_generated=false] - Whether generated by AI
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function saveMoM(mom) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.MOM_DOCUMENTS)
    .upsert(mom, { onConflict: 'recording_id' })
    .select()
    .single();

  return { data, error };
}

/**
 * Get MoM document for a recording
 * @param {string} recordingId - Recording ID
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function getMoM(recordingId) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.MOM_DOCUMENTS)
    .select('*')
    .eq('recording_id', recordingId)
    .single();

  return { data, error };
}

/**
 * Get all MoM documents for the current user
 * @returns {Promise<{data: object[], error: object|null}>}
 */
export async function getAllMoMs() {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: new Error('Supabase not configured') };

  const { data, error } = await supabase
    .from(TABLES.MOM_DOCUMENTS)
    .select('*, recordings(title, duration_ms, created_at)')
    .order('created_at', { ascending: false });

  return { data: data || [], error };
}
