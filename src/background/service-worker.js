import { MSG, TARGET, RECORDING_STATE } from '../utils/constants.js';
import { getRecorderState } from '../lib/recorder.js';
import { signInWithGoogle, signOut, getSession } from '../lib/auth.js';
import { uploadRecording } from '../lib/storage.js';
import { createRecording, saveTranscript } from '../lib/database.js';
import { getLocalBlob, deleteLocalRecording } from '../lib/local-store.js';
import { generateFilename } from '../utils/helpers.js';

// ─── State ───────────────────────────────────────────────────
// Chrome stops an idle service worker after about 30 seconds, also while the
// offscreen document is still recording. The state is kept in session storage
// and restored before any message is handled.
const STATE_KEY = 'recorder';
const recorder = getRecorderState();
let transcriptSegments = [];
const ready = restoreState();

async function restoreState() {
  const { [STATE_KEY]: saved } = await chrome.storage.session.get(STATE_KEY);
  if (!saved) return;

  const active = [
    RECORDING_STATE.REQUESTING,
    RECORDING_STATE.RECORDING,
    RECORDING_STATE.PAUSED,
    RECORDING_STATE.STOPPING,
  ].includes(saved.recorder.state);

  // Without the offscreen document there is no recording left to control
  if (active && (await hasOffscreenDocument())) {
    recorder.hydrate(saved.recorder);
    transcriptSegments = saved.transcriptSegments;
  }
}

function saveState() {
  return chrome.storage.session.set({
    [STATE_KEY]: { recorder: recorder.serialize(), transcriptSegments },
  });
}

function setState(state, extra) {
  recorder.transition(state);
  saveState();
  broadcastState(extra);
}

/** Show the outcome in the popup, then get ready for the next recording */
function finish(state, extra) {
  setState(state, extra);
  recorder.transition(RECORDING_STATE.IDLE);
  saveState();
}

// ─── Message Router ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== TARGET.SERVICE_WORKER) return false;

  ready
    .then(() => handleMessage(message))
    .then((response) => sendResponse(response ?? { success: true }))
    .catch((err) => {
      console.error('[SW]', message.type, err);
      sendResponse({ success: false, error: err.message });
    });
  return true; // Keep message channel open for async response
});

async function handleMessage({ type, data }) {
  switch (type) {
    // === Recording Control (from Popup) ===
    case MSG.START_RECORDING:
      return handleStartRecording(data);

    case MSG.STOP_RECORDING:
      return handleStopRecording();

    // The offscreen document confirms with RECORDING_PAUSED / RECORDING_RESUMED
    case MSG.PAUSE_RECORDING:
    case MSG.RESUME_RECORDING:
      return sendToOffscreen(type);

    // === Auth (from Popup) ===
    case MSG.SIGN_IN:
      return signInWithGoogle();

    case MSG.SIGN_OUT:
      return signOut();

    // === Recording Events (from Offscreen) ===
    case MSG.RECORDING_STARTED:
      recorder.mode = data.mode;
      return setState(RECORDING_STATE.RECORDING);

    case MSG.RECORDING_PAUSED:
      return setState(RECORDING_STATE.PAUSED);

    case MSG.RECORDING_RESUMED:
      return setState(RECORDING_STATE.RECORDING);

    case MSG.RECORDING_COMPLETE:
      return handleRecordingComplete(data);

    case MSG.RECORDING_ERROR:
      return finish(RECORDING_STATE.ERROR, { error: data.error });

    // === Transcription (from Offscreen) ===
    case MSG.TRANSCRIPT_RESULT:
      transcriptSegments.push(data);
      saveState();
      return sendToPopup(type, data);

    case MSG.TRANSCRIPT_INTERIM:
      return sendToPopup(type, data);

    // === State Query (from Popup) ===
    case MSG.GET_STATE:
      return {
        success: true,
        data: {
          ...recorder.toJSON(),
          transcript: transcriptSegments.map((s) => s.text).join(' '),
        },
      };

    default:
      return undefined;
  }
}

// ─── Start Recording ─────────────────────────────────────────
async function handleStartRecording({ mode, language }) {
  if (recorder.state !== RECORDING_STATE.IDLE) {
    return { success: false, error: 'A recording is already running' };
  }

  transcriptSegments = [];
  setState(RECORDING_STATE.REQUESTING);

  let response;
  try {
    await ensureOffscreenDocument();
    response = await sendToOffscreen(MSG.START_RECORDING, { mode, language });
  } catch (err) {
    response = { success: false, error: err.message };
  }

  if (!response?.success) {
    const error = response?.error || 'Failed to start recording';
    finish(RECORDING_STATE.ERROR, { error });
    return { success: false, error };
  }
  return { success: true };
}

// ─── Stop Recording ──────────────────────────────────────────
async function handleStopRecording() {
  const isActive =
    recorder.state === RECORDING_STATE.RECORDING || recorder.state === RECORDING_STATE.PAUSED;
  if (!isActive) return { success: false, error: 'No active recording' };

  setState(RECORDING_STATE.STOPPING);
  // RECORDING_COMPLETE may close the offscreen document before it answers here
  const response = await sendToOffscreen(MSG.STOP_RECORDING).catch(() => null);
  if (response?.success === false) {
    finish(RECORDING_STATE.ERROR, { error: response.error });
    return response;
  }
  return { success: true };
}

// ─── Handle Recording Complete ───────────────────────────────
// The recording is already stored on this computer when this runs.
async function handleRecordingComplete(recording) {
  setState(RECORDING_STATE.PROCESSING);
  await closeOffscreenDocument();

  let saved = { recording, savedTo: 'local' };
  const { data } = await getSession();
  if (data?.session?.user) {
    setState(RECORDING_STATE.UPLOADING);
    try {
      await uploadToCloud(recording, data.session.user.id);
      saved = { recording: null, savedTo: 'cloud' };
    } catch (err) {
      console.error('[SW] Upload error:', err);
      saved.warning = `Upload failed: ${err.message}`;
    }
  }

  finish(RECORDING_STATE.DONE, {
    ...saved,
    duration: recording.duration_ms,
    fileSize: recording.file_size,
  });
}

async function uploadToCloud(recording, userId) {
  const blob = await getLocalBlob(recording.id);
  const upload = await uploadRecording(blob, userId, generateFilename(recording.mode));
  if (upload.error) throw upload.error;

  const { data: row, error } = await createRecording({
    title: recording.title,
    mode: recording.mode,
    duration_ms: recording.duration_ms,
    file_size: recording.file_size,
    storage_path: upload.data.path,
    mime_type: recording.mime_type,
    user_id: userId,
  });
  if (error) throw error;

  if (recording.transcript) {
    const { error: transcriptError } = await saveTranscript({
      recording_id: row.id,
      ...recording.transcript,
    });
    if (transcriptError) throw transcriptError;
  }

  // Only once everything is in the cloud
  await deleteLocalRecording(recording.id);
}

// ─── Offscreen Document Management ──────────────────────────
async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
    reasons: ['DISPLAY_MEDIA', 'USER_MEDIA'],
    justification: 'Screen and audio recording with MediaRecorder API',
  });
}

async function closeOffscreenDocument() {
  try {
    if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();
  } catch (err) {
    console.log('[SW] Error closing offscreen document:', err.message);
  }
}

// ─── Messaging ───────────────────────────────────────────────
function sendToOffscreen(type, data = null) {
  return chrome.runtime.sendMessage({ type, target: TARGET.OFFSCREEN, data });
}

function sendToPopup(type, data) {
  chrome.runtime.sendMessage({ type, target: TARGET.POPUP, data }).catch(() => {
    // Popup might not be open — that's fine
  });
}

function broadcastState(extra = {}) {
  sendToPopup(MSG.STATE_UPDATE, { ...recorder.toJSON(), ...extra });
}

// ─── Extension Icon Click ────────────────────────────────────
chrome.action.onClicked.addListener(() => {
  chrome.windows.getAll({ populate: true }, (windows) => {
    // Check if the RecordX popup window is already open
    const existingWindow = windows.find(
      (w) => w.tabs?.some((t) => t.url?.includes('src/popup/popup.html'))
    );

    if (existingWindow) {
      chrome.windows.update(existingWindow.id, { focused: true });
    } else {
      chrome.windows.create({
        url: chrome.runtime.getURL('src/popup/popup.html'),
        type: 'popup',
        width: 400,
        height: 620,
        focused: true,
      });
    }
  });
});

// ─── Service Worker Startup ──────────────────────────────────
console.log('[RecordX] Service Worker initialized');
