/**
 * Recordings kept on this computer (IndexedDB). Works without any account.
 * The offscreen document, service worker and pages share this database.
 */
const DB_NAME = 'RecordXDB';
const DB_VERSION = 2;
const STORE = { BLOBS: 'blobs', RECORDINGS: 'recordings', MOMS: 'moms' };

export const LOCAL_PREFIX = 'local_';

export function isLocalId(id) {
  return typeof id === 'string' && id.startsWith(LOCAL_PREFIX);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => upgrade(request.result, request.transaction, e.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function upgrade(db, tx, oldVersion) {
  if (oldVersion < 1) db.createObjectStore(STORE.BLOBS);
  db.createObjectStore(STORE.RECORDINGS, { keyPath: 'id' });
  db.createObjectStore(STORE.MOMS, { keyPath: 'recording_id' });
  if (oldVersion !== 1) return;

  // Version 1 only held blobs waiting for upload. Anything left behind is a
  // recording that never reached the cloud, so list it instead of losing it.
  const blobs = tx.objectStore(STORE.BLOBS);
  const keysRequest = blobs.getAllKeys();
  keysRequest.onsuccess = () => {
    for (const key of keysRequest.result) {
      const blobRequest = blobs.get(key);
      blobRequest.onsuccess = () => {
        const blob = blobRequest.result;
        const id = LOCAL_PREFIX + key;
        const time = Number(String(key).replace('recording_', '')) || Date.now();
        blobs.put(blob, id);
        blobs.delete(key);
        tx.objectStore(STORE.RECORDINGS).put({
          id,
          title: 'Recovered recording',
          mode: 'screen_only',
          duration_ms: 0,
          file_size: blob.size,
          mime_type: blob.type,
          created_at: new Date(time).toISOString(),
          transcript: null,
        });
      };
    }
  };
}

/** Run one transaction and resolve with the result of the request `work` returns. */
async function run(stores, mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = work(tx);
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/** Store the video and its details together, so neither exists without the other. */
export async function saveLocalRecording(meta, blob) {
  const recording = {
    ...meta,
    id: LOCAL_PREFIX + crypto.randomUUID(),
    file_size: blob.size,
    created_at: new Date().toISOString(),
  };
  await run([STORE.BLOBS, STORE.RECORDINGS], 'readwrite', (tx) => {
    tx.objectStore(STORE.BLOBS).put(blob, recording.id);
    tx.objectStore(STORE.RECORDINGS).put(recording);
  });
  return recording;
}

export async function listLocalRecordings(search) {
  const all = await run([STORE.RECORDINGS], 'readonly', (tx) =>
    tx.objectStore(STORE.RECORDINGS).getAll()
  );
  const term = search?.toLowerCase();
  return all
    .filter((r) => !term || (r.title || '').toLowerCase().includes(term))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getLocalRecording(id) {
  return run([STORE.RECORDINGS], 'readonly', (tx) => tx.objectStore(STORE.RECORDINGS).get(id));
}

export function getLocalBlob(id) {
  return run([STORE.BLOBS], 'readonly', (tx) => tx.objectStore(STORE.BLOBS).get(id));
}

export function deleteLocalRecording(id) {
  return run([STORE.BLOBS, STORE.RECORDINGS, STORE.MOMS], 'readwrite', (tx) => {
    tx.objectStore(STORE.BLOBS).delete(id);
    tx.objectStore(STORE.RECORDINGS).delete(id);
    tx.objectStore(STORE.MOMS).delete(id);
  });
}

export function saveLocalMoM(mom) {
  return run([STORE.MOMS], 'readwrite', (tx) => {
    tx.objectStore(STORE.MOMS).put(mom);
  });
}

export function getLocalMoM(recordingId) {
  return run([STORE.MOMS], 'readonly', (tx) => tx.objectStore(STORE.MOMS).get(recordingId));
}
