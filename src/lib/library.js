/**
 * One place for pages to read recordings, whether they are stored on this
 * computer or in the cloud. Local recordings need no account.
 */
import { getSession } from './auth.js';
import * as cloud from './database.js';
import { getRecordingUrl, downloadRecording, deleteRecordingFile } from './storage.js';
import * as local from './local-store.js';

const { isLocalId } = local;

async function attempt(work) {
  try {
    return { data: await work(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Local recordings come first (page 0), followed by cloud recordings page by page. */
export async function listRecordings({ page = 0, limit = 20, search } = {}) {
  const { data: localAll, error } = await attempt(() => local.listLocalRecordings(search));
  const localRecordings = localAll || [];

  let cloudResult = { data: [], count: 0, error: null };
  const { data: auth } = await getSession();
  if (auth?.session) {
    cloudResult = await cloud.getRecordings({ page, limit, search });
  }

  return {
    data: page === 0 ? [...localRecordings, ...cloudResult.data] : cloudResult.data,
    count: localRecordings.length + cloudResult.count,
    error: error || cloudResult.error,
  };
}

export async function getRecording(id) {
  return isLocalId(id) ? attempt(() => local.getLocalRecording(id)) : cloud.getRecordingById(id);
}

export async function getBlob(recording) {
  if (!isLocalId(recording.id)) return downloadRecording(recording.storage_path);
  return attempt(async () => {
    const blob = await local.getLocalBlob(recording.id);
    if (!blob) throw new Error('The video file is no longer on this computer');
    return blob;
  });
}

/** URL for the player. Revoke blob: URLs when done. */
export async function getPlaybackUrl(recording) {
  if (!isLocalId(recording.id)) {
    const { data, error } = await getRecordingUrl(recording.storage_path);
    return { data: data?.signedUrl, error };
  }
  const { data, error } = await getBlob(recording);
  return { data: data && URL.createObjectURL(data), error };
}

/** Save the video through the browser's normal download. */
export async function downloadToDisk(recording) {
  const { data, error } = await getBlob(recording);
  if (error) return { error };

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  const extension = data.type.includes('mp4') ? 'mp4' : 'webm';
  a.download = `${(recording.title || 'recording').replace(/[\\/:*?"<>|]+/g, '-')}.${extension}`;
  a.click();
  // Revoking straight away can cancel the download of a large file
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { error: null };
}

export async function removeRecording(recording) {
  if (isLocalId(recording.id)) return attempt(() => local.deleteLocalRecording(recording.id));
  const { error } = await deleteRecordingFile(recording.storage_path);
  if (error) return { error };
  return cloud.deleteRecording(recording.id);
}

export async function getTranscript(id) {
  if (!isLocalId(id)) return cloud.getTranscript(id);
  return attempt(async () => (await local.getLocalRecording(id))?.transcript || null);
}

export async function getMoM(id) {
  return isLocalId(id) ? attempt(() => local.getLocalMoM(id)) : cloud.getMoM(id);
}

export async function saveMoM(mom) {
  return isLocalId(mom.recording_id) ? attempt(() => local.saveLocalMoM(mom)) : cloud.saveMoM(mom);
}
