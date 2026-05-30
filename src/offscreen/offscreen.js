import {
  MSG,
  TARGET,
  RECORDING_MODE,
  MEDIA_CONSTRAINTS,
  RECORDER_CONFIG,
} from '../utils/constants.js';
import { Transcriber } from '../lib/transcriber.js';
import { saveBlobToIndexedDB } from '../utils/helpers.js';

// ─── State ───────────────────────────────────────────────────
let mediaRecorder = null;
let recordedChunks = [];
let displayStream = null;
let micStream = null;
let audioContext = null;
let combinedStream = null;
let startTime = 0;
let currentMode = null;
let transcriber = null;

// ─── Message Handler ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== TARGET.OFFSCREEN) return false;

  switch (message.type) {
    case MSG.START_RECORDING:
      handleStartRecording(message.data)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep message channel open for async response

    case MSG.STOP_RECORDING:
      handleStopRecording()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case MSG.PAUSE_RECORDING:
      handlePauseRecording();
      sendResponse({ success: true });
      return false;

    case MSG.RESUME_RECORDING:
      handleResumeRecording();
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
});

// ─── Start Recording ─────────────────────────────────────────
async function handleStartRecording({ mode, language }) {
  currentMode = mode;
  recordedChunks = [];

  try {
    // 1. Get display stream (screen capture)
    displayStream = await getDisplayStream(mode);

    // Verify if system audio was requested but the user forgot to check the "Share system audio" box
    const needsSystemAudio = mode === RECORDING_MODE.SCREEN_MIC_SYSTEM || mode === RECORDING_MODE.SCREEN_SYSTEM;
    if (needsSystemAudio && displayStream.getAudioTracks().length === 0) {
      throw new Error('System audio was not captured. Make sure to check the "Share system audio" / "Share tab audio" checkbox in the Chrome screen-sharing dialog.');
    }

    // 2. Get microphone stream if needed
    if (mode === RECORDING_MODE.SCREEN_MIC || mode === RECORDING_MODE.SCREEN_MIC_SYSTEM) {
      micStream = await getMicStream();
    }

    // 3. Build the final combined stream
    combinedStream = await buildCombinedStream(mode, displayStream, micStream);

    // 4. Create and start MediaRecorder
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 2500000, // 2.5 Mbps
      audioBitsPerSecond: 128000,  // 128 kbps
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      await finalizeRecording();
    };

    mediaRecorder.onerror = (event) => {
      console.error('[Offscreen] MediaRecorder error:', event.error);
      chrome.runtime.sendMessage({
        type: MSG.RECORDING_ERROR,
        target: TARGET.SERVICE_WORKER,
        data: { error: event.error?.message || 'Recording error' },
      });
    };

    // Handle user stopping the screen share via the browser's built-in UI
    displayStream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          handleStopRecording();
        }
      });
    });

    startTime = Date.now();
    mediaRecorder.start(RECORDER_CONFIG.TIMESLICE_MS);

    // Start transcription if mode includes mic and Web Speech API is supported
    const hasMic = mode === RECORDING_MODE.SCREEN_MIC || mode === RECORDING_MODE.SCREEN_MIC_SYSTEM;
    if (hasMic && Transcriber.isSupported()) {
      transcriber = new Transcriber();
      transcriber.init({
        language: language || 'id-ID',
        onResult: (segment) => {
          chrome.runtime.sendMessage({
            type: MSG.TRANSCRIPT_RESULT,
            target: TARGET.SERVICE_WORKER,
            data: segment,
          }).catch(() => {});
        },
        onInterim: (segment) => {
          chrome.runtime.sendMessage({
            type: MSG.TRANSCRIPT_INTERIM,
            target: TARGET.SERVICE_WORKER,
            data: segment,
          }).catch(() => {});
        },
        onError: (err) => {
          console.warn('[Offscreen Transcriber] Error:', err);
        },
      });
      transcriber.start();
    }

    // Notify service worker that recording started
    chrome.runtime.sendMessage({
      type: MSG.RECORDING_STARTED,
      target: TARGET.SERVICE_WORKER,
      data: { startTime, mode },
    });

    return { success: true };
  } catch (err) {
    console.error('[Offscreen] Start recording error:', err);
    cleanup();
    return { success: false, error: err.message };
  }
}

// ─── Stop Recording ──────────────────────────────────────────
async function handleStopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    return { success: false, error: 'No active recording' };
  }

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      await finalizeRecording();
      resolve({ success: true });
    };
    mediaRecorder.stop();
  });
}

// ─── Pause Recording ─────────────────────────────────────────
function handlePauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    if (transcriber) {
      transcriber.stop();
    }
    chrome.runtime.sendMessage({
      type: MSG.RECORDING_PAUSED,
      target: TARGET.SERVICE_WORKER,
    });
  }
}

// ─── Resume Recording ────────────────────────────────────────
function handleResumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    if (transcriber) {
      transcriber.start();
    }
    chrome.runtime.sendMessage({
      type: MSG.RECORDING_RESUMED,
      target: TARGET.SERVICE_WORKER,
    });
  }
}

// ─── Get Display Stream ──────────────────────────────────────
async function getDisplayStream(mode) {
  const needsSystemAudio =
    mode === RECORDING_MODE.SCREEN_MIC_SYSTEM ||
    mode === RECORDING_MODE.SCREEN_SYSTEM;

  // Modern way to capture screen with crisp high-fidelity system/tab audio
  const constraints = {
    video: {
      width: MEDIA_CONSTRAINTS.VIDEO.width,
      height: MEDIA_CONSTRAINTS.VIDEO.height,
      frameRate: MEDIA_CONSTRAINTS.VIDEO.frameRate,
    },
    audio: needsSystemAudio ? {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      systemAudio: 'include',
    } : false,
  };

  return await navigator.mediaDevices.getDisplayMedia(constraints);
}

// ─── Get Microphone Stream ───────────────────────────────────
async function getMicStream() {
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: MEDIA_CONSTRAINTS.AUDIO.echoCancellation,
      noiseSuppression: MEDIA_CONSTRAINTS.AUDIO.noiseSuppression,
      autoGainControl: MEDIA_CONSTRAINTS.AUDIO.autoGainControl,
      sampleRate: MEDIA_CONSTRAINTS.AUDIO.sampleRate,
    },
    video: false,
  });
}

// ─── Build Combined Stream ───────────────────────────────────
async function buildCombinedStream(mode, display, mic) {
  const videoTracks = display.getVideoTracks();
  const displayAudioTracks = display.getAudioTracks();
  const micAudioTracks = mic ? mic.getAudioTracks() : [];

  const hasDisplayAudio = displayAudioTracks.length > 0;
  const hasMicAudio = micAudioTracks.length > 0;

  // If we need to mix multiple audio sources, use Web Audio API
  if (hasDisplayAudio && hasMicAudio) {
    audioContext = new AudioContext({ sampleRate: 48000 });

    const displaySource = audioContext.createMediaStreamSource(
      new MediaStream(displayAudioTracks)
    );
    const micSource = audioContext.createMediaStreamSource(
      new MediaStream(micAudioTracks)
    );

    // Create a destination to mix audio into
    const destination = audioContext.createMediaStreamDestination();

    // Optional: gain nodes for volume control
    const displayGain = audioContext.createGain();
    const micGain = audioContext.createGain();
    displayGain.gain.value = 1.0;
    micGain.gain.value = 1.0;

    // Connect: source → gain → destination
    displaySource.connect(displayGain);
    displayGain.connect(destination);

    micSource.connect(micGain);
    micGain.connect(destination);

    // Build final stream: video from display + mixed audio
    const mixedStream = new MediaStream([
      ...videoTracks,
      ...destination.stream.getAudioTracks(),
    ]);

    return mixedStream;
  }

  // Single audio source (display or mic, not both)
  if (hasDisplayAudio) {
    return new MediaStream([...videoTracks, ...displayAudioTracks]);
  }

  if (hasMicAudio) {
    return new MediaStream([...videoTracks, ...micAudioTracks]);
  }

  // No audio (screen only)
  return new MediaStream(videoTracks);
}

// ─── Finalize Recording ──────────────────────────────────────
async function finalizeRecording() {
  const duration = Date.now() - startTime;
  const mimeType = mediaRecorder?.mimeType || RECORDER_CONFIG.MIME_TYPE;
  const blob = new Blob(recordedChunks, { type: mimeType });

  const dbKey = `recording_${Date.now()}`;
  try {
    // Save blob directly to IndexedDB for zero-copy sharing with service worker
    await saveBlobToIndexedDB(dbKey, blob);

    // Notify service worker with the recording metadata and DB key
    chrome.runtime.sendMessage({
      type: MSG.RECORDING_COMPLETE,
      target: TARGET.SERVICE_WORKER,
      data: {
        dbKey,
        mimeType,
        duration,
        mode: currentMode,
        fileSize: blob.size,
      },
    });
  } catch (err) {
    console.error('[Offscreen] Failed to save recording to IndexedDB:', err);
    chrome.runtime.sendMessage({
      type: MSG.RECORDING_ERROR,
      target: TARGET.SERVICE_WORKER,
      data: { error: 'Failed to save recording data to internal database' },
    });
  }

  cleanup();
}

// ─── Get Supported MIME Type ─────────────────────────────────
function getSupportedMimeType() {
  const types = [
    RECORDER_CONFIG.MIME_TYPE,
    RECORDER_CONFIG.MIME_TYPE_FALLBACK,
    'video/webm',
    'video/mp4',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return ''; // Let the browser choose
}

// ─── Cleanup ─────────────────────────────────────────────────
function cleanup() {
  // Stop all tracks
  if (displayStream) {
    displayStream.getTracks().forEach((t) => t.stop());
    displayStream = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (combinedStream) {
    combinedStream.getTracks().forEach((t) => t.stop());
    combinedStream = null;
  }

  // Close audio context
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  if (transcriber) {
    transcriber.stop();
    transcriber = null;
  }

  mediaRecorder = null;
  recordedChunks = [];
  currentMode = null;
}
