// ─── Recording Modes ───────────────────────────────────────────
export const RECORDING_MODE = {
  SCREEN_ONLY: 'screen_only',
  SCREEN_MIC: 'screen_mic',
  SCREEN_MIC_SYSTEM: 'screen_mic_system',
  SCREEN_SYSTEM: 'screen_system',
};

export const RECORDING_MODE_LABELS = {
  [RECORDING_MODE.SCREEN_ONLY]: 'Screen Only',
  [RECORDING_MODE.SCREEN_MIC]: 'Screen + Mic',
  [RECORDING_MODE.SCREEN_MIC_SYSTEM]: 'Screen + Mic + System',
  [RECORDING_MODE.SCREEN_SYSTEM]: 'Screen + System',
};

export const RECORDING_MODE_ICONS = {
  [RECORDING_MODE.SCREEN_ONLY]: '🖥️',
  [RECORDING_MODE.SCREEN_MIC]: '🎙️',
  [RECORDING_MODE.SCREEN_MIC_SYSTEM]: '🎛️',
  [RECORDING_MODE.SCREEN_SYSTEM]: '🔊',
};

export const RECORDING_MODE_DESCRIPTIONS = {
  [RECORDING_MODE.SCREEN_ONLY]: 'Capture screen video without any audio',
  [RECORDING_MODE.SCREEN_MIC]: 'Capture screen with microphone audio',
  [RECORDING_MODE.SCREEN_MIC_SYSTEM]: 'Capture screen with both mic and system audio',
  [RECORDING_MODE.SCREEN_SYSTEM]: 'Capture screen with system/tab audio only',
};

// ─── Recording State Machine ──────────────────────────────────
export const RECORDING_STATE = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  PROCESSING: 'processing',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
};

// ─── Message Types (inter-component communication) ────────────
export const MSG = {
  // Recording control
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  PAUSE_RECORDING: 'pause-recording',
  RESUME_RECORDING: 'resume-recording',
  RECORDING_STARTED: 'recording-started',
  RECORDING_STOPPED: 'recording-stopped',
  RECORDING_PAUSED: 'recording-paused',
  RECORDING_RESUMED: 'recording-resumed',
  RECORDING_ERROR: 'recording-error',
  RECORDING_DATA: 'recording-data',
  RECORDING_COMPLETE: 'recording-complete',

  // State sync
  GET_STATE: 'get-state',
  STATE_UPDATE: 'state-update',

  // Transcription
  TRANSCRIPT_RESULT: 'transcript-result',
  TRANSCRIPT_INTERIM: 'transcript-interim',

  // Auth
  SIGN_IN: 'sign-in',
  SIGN_OUT: 'sign-out',
  AUTH_STATE_CHANGED: 'auth-state-changed',

  // Upload
  UPLOAD_PROGRESS: 'upload-progress',
  UPLOAD_COMPLETE: 'upload-complete',
  UPLOAD_ERROR: 'upload-error',
};

// ─── Message Targets ──────────────────────────────────────────
export const TARGET = {
  OFFSCREEN: 'offscreen',
  SERVICE_WORKER: 'service-worker',
  POPUP: 'popup',
};

// ─── Supabase Tables ──────────────────────────────────────────
export const TABLES = {
  RECORDINGS: 'recordings',
  TRANSCRIPTS: 'transcripts',
  MOM_DOCUMENTS: 'mom_documents',
};

// ─── Supabase Storage ─────────────────────────────────────────
export const STORAGE = {
  RECORDINGS_BUCKET: 'recordings',
};

// ─── Media Constraints ────────────────────────────────────────
export const MEDIA_CONSTRAINTS = {
  VIDEO: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  },
  AUDIO: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
  },
};

// ─── MediaRecorder Config ─────────────────────────────────────
export const RECORDER_CONFIG = {
  MIME_TYPE: 'video/webm;codecs=vp9,opus',
  MIME_TYPE_FALLBACK: 'video/webm;codecs=vp8,opus',
  MIME_TYPE_AUDIO_ONLY: 'audio/webm;codecs=opus',
  TIMESLICE_MS: 1000, // Collect data every second
};

// ─── Transcription Config ─────────────────────────────────────
export const TRANSCRIPTION = {
  LANGUAGES: {
    'id-ID': 'Bahasa Indonesia',
    'en-US': 'English (US)',
    'en-GB': 'English (UK)',
  },
  DEFAULT_LANGUAGE: 'id-ID',
};

// ─── UI Config ────────────────────────────────────────────────
export const UI = {
  POPUP_WIDTH: 400,
  POPUP_HEIGHT: 600,
  MAX_TRANSCRIPT_LINES: 100,
  WAVEFORM_BARS: 32,
  ANIMATION_DURATION: 300,
};

// ─── MoM Config ───────────────────────────────────────────────
export const MOM = {
  OPENAI_MODEL: 'gpt-4o-mini',
  MAX_TRANSCRIPT_TOKENS: 12000,
};
