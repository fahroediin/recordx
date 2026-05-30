import { getSupabase } from './supabase.js';
import { STORAGE } from '../utils/constants.js';
import { generateFilename } from '../utils/helpers.js';

/**
 * Upload a recording blob to Supabase Storage
 * @param {Blob} blob - Recording blob
 * @param {string} userId - User ID for path prefixing
 * @param {string} [filename] - Optional filename (auto-generated if not provided)
 * @param {Function} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<{data: {path: string, fullPath: string}, error: object|null}>}
 */
export async function uploadRecording(blob, userId, filename, onProgress) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const name = filename || generateFilename();
  const storagePath = `${userId}/${name}`;

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE.RECORDINGS_BUCKET)
      .upload(storagePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: blob.type || 'video/webm',
      });

    if (error) return { data: null, error };

    // Signal progress complete
    if (onProgress) onProgress(100);

    return {
      data: {
        path: storagePath,
        fullPath: data.path || storagePath,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Get a signed/public URL for a recording
 * @param {string} path - Storage path
 * @param {number} [expiresIn=3600] - URL expiry in seconds (default: 1 hour)
 * @returns {Promise<{data: {signedUrl: string}, error: object|null}>}
 */
export async function getRecordingUrl(path, expiresIn = 3600) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase.storage
    .from(STORAGE.RECORDINGS_BUCKET)
    .createSignedUrl(path, expiresIn);

  return { data, error };
}

/**
 * Download a recording as a blob
 * @param {string} path - Storage path
 * @returns {Promise<{data: Blob, error: object|null}>}
 */
export async function downloadRecording(path) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase.storage
    .from(STORAGE.RECORDINGS_BUCKET)
    .download(path);

  return { data, error };
}

/**
 * Delete a recording from storage
 * @param {string} path - Storage path
 * @returns {Promise<{error: object|null}>}
 */
export async function deleteRecordingFile(path) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase not configured') };

  const { error } = await supabase.storage
    .from(STORAGE.RECORDINGS_BUCKET)
    .remove([path]);

  return { error };
}

/**
 * List all recordings for a user in storage
 * @param {string} userId - User ID
 * @returns {Promise<{data: object[], error: object|null}>}
 */
export async function listRecordingFiles(userId) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase not configured') };

  const { data, error } = await supabase.storage
    .from(STORAGE.RECORDINGS_BUCKET)
    .list(userId, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  return { data, error };
}
