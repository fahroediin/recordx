import { MSG, TARGET, RECORDING_STATE, RECORDING_MODE } from '../utils/constants.js';
import { getRecorderState } from '../lib/recorder.js';
import { signInWithGoogle, signOut, getSession } from '../lib/auth.js';
import { uploadRecording } from '../lib/storage.js';
import { createRecording, saveTranscript } from '../lib/database.js';
import { generateFilename, getBlobFromIndexedDB, deleteBlobFromIndexedDB } from '../utils/helpers.js';

// ─── State ───────────────────────────────────────────────────
const recorder = getRecorderState();
let transcriptSegments = [];

// ─── Message Router ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages targeted at the service worker
  if (message.target && message.target !== TARGET.SERVICE_WORKER) return false;

  switch (message.type) {
    // === Recording Control (from Popup) ===
    case MSG.START_RECORDING:
      handleStartRecording(message.data)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // === Auth (from Popup) ===
    case MSG.SIGN_IN:
      signInWithGoogle()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case MSG.SIGN_OUT:
      signOut()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case MSG.STOP_RECORDING:
      handleStopRecording()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case MSG.PAUSE_RECORDING:
      forwardToOffscreen(MSG.PAUSE_RECORDING);
      recorder.transition(RECORDING_STATE.PAUSED);
      broadcastState();
      sendResponse({ success: true });
      return false;

    case MSG.RESUME_RECORDING:
      forwardToOffscreen(MSG.RESUME_RECORDING);
      recorder.transition(RECORDING_STATE.RECORDING);
      broadcastState();
      sendResponse({ success: true });
      return false;

    // === Recording Events (from Offscreen) ===
    case MSG.RECORDING_STARTED:
      recorder.mode = message.data.mode;
      recorder.transition(RECORDING_STATE.RECORDING);
      broadcastState();
      return false;

    case MSG.RECORDING_PAUSED:
      recorder.transition(RECORDING_STATE.PAUSED);
      broadcastState();
      return false;

    case MSG.RECORDING_RESUMED:
      recorder.transition(RECORDING_STATE.RECORDING);
      broadcastState();
      return false;

    case MSG.RECORDING_COMPLETE:
      handleRecordingComplete(message.data);
      return false;

    case MSG.RECORDING_ERROR:
      recorder.transition(RECORDING_STATE.ERROR);
      broadcastState({ error: message.data.error });
      setTimeout(() => {
        recorder.transition(RECORDING_STATE.IDLE);
        broadcastState();
      }, 3000);
      return false;

    // === Transcription (from Offscreen/Popup/Content) ===
    case MSG.TRANSCRIPT_RESULT:
      transcriptSegments.push(message.data);
      // Forward to popup if active
      chrome.runtime.sendMessage({
        type: MSG.TRANSCRIPT_RESULT,
        target: TARGET.POPUP,
        data: message.data,
      }).catch(() => {});
      return false;

    case MSG.TRANSCRIPT_INTERIM:
      // Forward to popup if active
      chrome.runtime.sendMessage({
        type: MSG.TRANSCRIPT_INTERIM,
        target: TARGET.POPUP,
        data: message.data,
      }).catch(() => {});
      return false;

    // === State Query (from Popup) ===
    case MSG.GET_STATE:
      sendResponse({
        success: true,
        data: {
          ...recorder.toJSON(),
          transcript: transcriptSegments.map((s) => s.text).join(' '),
        },
      });
      return false;

    default:
      return false;
  }
});

// ─── Start Recording ─────────────────────────────────────────
async function handleStartRecording({ mode, language }) {
  try {
    recorder.transition(RECORDING_STATE.REQUESTING);
    broadcastState();

    transcriptSegments = [];

    // Ensure offscreen document is created
    await ensureOffscreenDocument();

    // Send start command to offscreen document
    const response = await chrome.runtime.sendMessage({
      type: MSG.START_RECORDING,
      target: TARGET.OFFSCREEN,
      data: { mode, language },
    });

    if (!response?.success) {
      recorder.transition(RECORDING_STATE.ERROR);
      broadcastState({ error: response?.error || 'Failed to start recording' });
      setTimeout(() => {
        recorder.transition(RECORDING_STATE.IDLE);
        broadcastState();
      }, 3000);
      return { success: false, error: response?.error };
    }

    return { success: true };
  } catch (err) {
    recorder.transition(RECORDING_STATE.ERROR);
    broadcastState({ error: err.message });
    setTimeout(() => {
      recorder.transition(RECORDING_STATE.IDLE);
      broadcastState();
    }, 3000);
    return { success: false, error: err.message };
  }
}

// ─── Stop Recording ──────────────────────────────────────────
async function handleStopRecording() {
  try {
    recorder.transition(RECORDING_STATE.STOPPING);
    broadcastState();

    await chrome.runtime.sendMessage({
      type: MSG.STOP_RECORDING,
      target: TARGET.OFFSCREEN,
    });

    return { success: true };
  } catch (err) {
    console.error('[SW] Stop recording error:', err);
    return { success: false, error: err.message };
  }
}

// ─── Handle Recording Complete ───────────────────────────────
async function handleRecordingComplete(data) {
  const { dbKey, mimeType, duration, mode, fileSize } = data;
  try {
    recorder.transition(RECORDING_STATE.PROCESSING);
    broadcastState();

    // Retrieve blob from IndexedDB (zero-copy binary transfer)
    const blob = await getBlobFromIndexedDB(dbKey);
    if (!blob) {
      throw new Error('Recording data could not be retrieved from internal database');
    }

    // Check if user is authenticated for upload
    const { data: sessionData } = await getSession();
    const session = sessionData?.session;

    if (session?.user) {
      recorder.transition(RECORDING_STATE.UPLOADING);
      broadcastState();

      const filename = generateFilename(mode);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await uploadRecording(
        blob,
        session.user.id,
        filename
      );

      if (uploadError) {
        console.error('[SW] Upload error:', uploadError);
        broadcastState({ error: `Upload failed: ${uploadError.message}` });
      } else {
        // Save metadata to database
        const { data: recordingData, error: dbError } = await createRecording({
          title: `Recording ${new Date().toLocaleString('id-ID')}`,
          mode,
          duration_ms: duration,
          file_size: fileSize,
          storage_path: uploadData.path,
          mime_type: mimeType,
          user_id: session.user.id,
        });

        if (dbError) {
          console.error('[SW] DB error:', dbError);
        }

        // Save transcript if we have one
        if (transcriptSegments.length > 0 && recordingData) {
          const fullTranscript = transcriptSegments.map((s) => s.text).join(' ');
          await saveTranscript({
            recording_id: recordingData.id,
            content: fullTranscript,
            language: transcriptSegments[0]?.language || 'id-ID',
            segments: transcriptSegments,
          });
        }
      }
    } else {
      // Not authenticated — offer download
      console.log('[SW] User not authenticated. Recording available for local download.');
    }

    recorder.transition(RECORDING_STATE.DONE);
    broadcastState({
      duration,
      fileSize,
      mode,
    });

    // Return to idle after a brief display of "done"
    setTimeout(() => {
      recorder.transition(RECORDING_STATE.IDLE);
      broadcastState();
    }, 2000);

    // Clean up offscreen document
    await closeOffscreenDocument();
  } catch (err) {
    console.error('[SW] Recording complete error:', err);
    recorder.transition(RECORDING_STATE.ERROR);
    broadcastState({ error: err.message });
    setTimeout(() => {
      recorder.transition(RECORDING_STATE.IDLE);
      broadcastState();
    }, 3000);
  } finally {
    // Always clean up database entry to save storage
    if (dbKey) {
      await deleteBlobFromIndexedDB(dbKey).catch(() => {});
    }
  }
}

// ─── Offscreen Document Management ──────────────────────────
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({});
  const offscreenDoc = existingContexts.find(
    (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
  );

  if (!offscreenDoc) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Screen and audio recording with MediaRecorder API',
    });
  }
}

async function closeOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenDoc = existingContexts.find(
      (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
    );
    if (offscreenDoc) {
      await chrome.offscreen.closeDocument();
    }
  } catch (err) {
    console.log('[SW] Error closing offscreen document:', err.message);
  }
}

// ─── Forward Message to Offscreen ────────────────────────────
function forwardToOffscreen(type, data = null) {
  chrome.runtime.sendMessage({
    type,
    target: TARGET.OFFSCREEN,
    data,
  });
}

// ─── Broadcast State Update ─────────────────────────────────
function broadcastState(extra = {}) {
  chrome.runtime.sendMessage({
    type: MSG.STATE_UPDATE,
    target: TARGET.POPUP,
    data: {
      ...recorder.toJSON(),
      ...extra,
    },
  }).catch(() => {
    // Popup might not be open — that's fine
  });
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
