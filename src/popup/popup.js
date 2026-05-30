import { getSession, onAuthStateChange } from '../lib/auth.js';
import { MSG, TARGET, RECORDING_STATE, RECORDING_MODE } from '../utils/constants.js';
import { formatDuration } from '../utils/helpers.js';

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  // Screens
  authScreen: $('#auth-screen'),
  mainScreen: $('#main-screen'),

  // Auth
  btnGoogleLogin: $('#btn-google-login'),

  // Header
  btnHistory: $('#btn-history'),
  btnUser: $('#btn-user'),
  userAvatar: $('#user-avatar'),
  userInitials: $('#user-initials'),
  userDropdown: $('#user-dropdown'),
  dropdownName: $('#dropdown-name'),
  dropdownEmail: $('#dropdown-email'),
  btnLogout: $('#btn-logout'),

  // Mode
  modeSection: $('#mode-section'),
  modeCards: $$('.mode-card'),
  langSelect: $('#lang-select'),
  langSection: $('#lang-section'),

  // Record
  btnRecord: $('#btn-record'),
  recordLabel: $('#record-label'),

  // Recording
  recordingSection: $('#recording-section'),
  recordingStatusText: $('#recording-status-text'),
  recordingTimer: $('#recording-timer'),
  visualizer: $('#visualizer'),
  transcriptContainer: $('#transcript-container'),
  transcriptText: $('#transcript-text'),
  btnPause: $('#btn-pause'),
  btnStop: $('#btn-stop'),
  btnResume: $('#btn-resume'),

  // Processing
  processingSection: $('#processing-section'),
  processingText: $('#processing-text'),
  progressBarContainer: $('#progress-bar-container'),
  progressBar: $('#progress-bar'),

  // Done
  doneSection: $('#done-section'),
  doneDuration: $('#done-duration'),
  doneSize: $('#done-size'),
  btnViewHistory: $('#btn-view-history'),
  btnNewRecording: $('#btn-new-recording'),

  // Error
  errorSection: $('#error-section'),
  errorText: $('#error-text'),
  btnDismissError: $('#btn-dismiss-error'),
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let currentState = RECORDING_STATE.IDLE;
let selectedMode = RECORDING_MODE.SCREEN_ONLY;
let timerInterval = null;
let transcriber = null;
let visualizerAnimId = null;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
async function init() {
  // Check current auth session
  const { data } = await getSession();
  if (data?.session) {
    showMainScreen(data.session.user);
  } else {
    showAuthScreen();
  }

  // Listen for auth changes
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      showMainScreen(session.user);
    } else if (event === 'SIGNED_OUT') {
      showAuthScreen();
    }
  });

  // Sync state with service worker
  syncState();

  // Bind events
  bindEvents();
}

// ═══════════════════════════════════════════════════════════════
// AUTH UI
// ═══════════════════════════════════════════════════════════════
function showAuthScreen() {
  els.authScreen.classList.remove('hidden');
  els.mainScreen.classList.add('hidden');
}

function showMainScreen(user) {
  els.authScreen.classList.add('hidden');
  els.mainScreen.classList.remove('hidden');

  // Update user info
  if (user) {
    const avatarUrl = user.user_metadata?.avatar_url;
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const email = user.email || '';

    if (avatarUrl) {
      els.userAvatar.src = avatarUrl;
      els.userAvatar.classList.remove('hidden');
      els.userInitials.classList.add('hidden');
    } else {
      els.userAvatar.classList.add('hidden');
      els.userInitials.classList.remove('hidden');
      els.userInitials.textContent = name.charAt(0).toUpperCase();
    }

    els.dropdownName.textContent = name;
    els.dropdownEmail.textContent = email;
  }
}

// ═══════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ═══════════════════════════════════════════════════════════════
function bindEvents() {
  // Auth
  els.btnGoogleLogin.addEventListener('click', handleGoogleLogin);
  els.btnLogout.addEventListener('click', handleLogout);

  // User menu dropdown
  els.btnUser.addEventListener('click', (e) => {
    e.stopPropagation();
    els.userDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    els.userDropdown.classList.add('hidden');
  });

  // Mode selection
  els.modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      els.modeCards.forEach((c) => c.classList.remove('mode-card--active'));
      card.classList.add('mode-card--active');
      selectedMode = card.dataset.mode;

      // Show/hide language selector based on mic availability
      const hasMic = selectedMode === RECORDING_MODE.SCREEN_MIC ||
                     selectedMode === RECORDING_MODE.SCREEN_MIC_SYSTEM;
      els.langSection.style.display = hasMic ? 'flex' : 'none';
    });
  });

  // Record button
  els.btnRecord.addEventListener('click', handleRecord);

  // Recording controls
  els.btnPause.addEventListener('click', handlePause);
  els.btnStop.addEventListener('click', handleStop);
  els.btnResume.addEventListener('click', handleResume);

  // History
  els.btnHistory.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/history.html') });
  });

  // Done actions
  els.btnViewHistory.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/history.html') });
  });
  els.btnNewRecording.addEventListener('click', () => {
    updateUI(RECORDING_STATE.IDLE);
  });

  // Error dismiss
  els.btnDismissError.addEventListener('click', () => {
    updateUI(RECORDING_STATE.IDLE);
  });

  // Listen for state and transcript updates from service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG.STATE_UPDATE) {
      handleStateUpdate(message.data);
    } else if (message.type === MSG.TRANSCRIPT_RESULT) {
      appendTranscript(message.data.text, true);
    } else if (message.type === MSG.TRANSCRIPT_INTERIM) {
      showInterimTranscript(message.data.text);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// AUTH HANDLERS
// ═══════════════════════════════════════════════════════════════
async function handleGoogleLogin() {
  els.btnGoogleLogin.disabled = true;
  els.btnGoogleLogin.textContent = 'Signing in...';

  // Delegate flow to background service worker to prevent context destruction when popup closes
  const response = await chrome.runtime.sendMessage({
    type: MSG.SIGN_IN,
    target: TARGET.SERVICE_WORKER,
  });

  const { data, error } = response || { data: null, error: { message: 'Failed to start authentication' } };

  if (error) {
    console.error('Login error:', error.message || error);
    els.btnGoogleLogin.disabled = false;
    els.btnGoogleLogin.innerHTML = `
      <svg class="btn__icon" width="20" height="20" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span>Sign in with Google</span>
    `;
    return;
  }

  if (data?.session) {
    showMainScreen(data.session.user);
  }
}

async function handleLogout() {
  await chrome.runtime.sendMessage({
    type: MSG.SIGN_OUT,
    target: TARGET.SERVICE_WORKER,
  });
  showAuthScreen();
}

// ═══════════════════════════════════════════════════════════════
// RECORDING HANDLERS
// ═══════════════════════════════════════════════════════════════
async function handleRecord() {
  if (currentState !== RECORDING_STATE.IDLE) return;

  updateUI(RECORDING_STATE.REQUESTING);

  // Request microphone permission first if mode includes mic
  const hasMic = selectedMode === RECORDING_MODE.SCREEN_MIC ||
                 selectedMode === RECORDING_MODE.SCREEN_MIC_SYSTEM;

  if (hasMic) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      console.error('[Popup] Microphone permission denied:', err);
      updateUI(RECORDING_STATE.ERROR, { error: 'Microphone permission is required for this recording mode.' });
      return;
    }
  }

  // Send start command to service worker
  const response = await chrome.runtime.sendMessage({
    type: MSG.START_RECORDING,
    target: TARGET.SERVICE_WORKER,
    data: { 
      mode: selectedMode,
      language: els.langSelect.value
    },
  });

  if (!response?.success) {
    updateUI(RECORDING_STATE.ERROR, { error: response?.error || 'Failed to start recording' });
  }
}

async function handlePause() {
  await chrome.runtime.sendMessage({
    type: MSG.PAUSE_RECORDING,
    target: TARGET.SERVICE_WORKER,
  });
}

async function handleResume() {
  await chrome.runtime.sendMessage({
    type: MSG.RESUME_RECORDING,
    target: TARGET.SERVICE_WORKER,
  });
}

async function handleStop() {
  await chrome.runtime.sendMessage({
    type: MSG.STOP_RECORDING,
    target: TARGET.SERVICE_WORKER,
  });
}

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
async function syncState() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.GET_STATE,
      target: TARGET.SERVICE_WORKER,
    });

    if (response?.success) {
      handleStateUpdate(response.data);
    }
  } catch (err) {
    // Service worker might not be ready yet
  }
}

function handleStateUpdate(data) {
  updateUI(data.state, data);
}

function updateUI(state, data = {}) {
  currentState = state;

  // Hide all dynamic sections
  const sections = [
    els.modeSection,
    els.langSection,
    els.recordingSection,
    els.processingSection,
    els.doneSection,
    els.errorSection,
  ];

  sections.forEach((s) => {
    if (s) s.classList.add('hidden');
  });

  // Show/hide record button section
  const recordSection = els.btnRecord.closest('.section--record');

  switch (state) {
    case RECORDING_STATE.IDLE:
    case RECORDING_STATE.REQUESTING:
      els.modeSection.classList.remove('hidden');
      // Show lang section only if mic mode
      const hasMic = selectedMode === RECORDING_MODE.SCREEN_MIC ||
                     selectedMode === RECORDING_MODE.SCREEN_MIC_SYSTEM;
      if (hasMic) els.langSection.classList.remove('hidden');
      if (recordSection) recordSection.classList.remove('hidden');

      els.btnRecord.disabled = state === RECORDING_STATE.REQUESTING;
      els.recordLabel.textContent = state === RECORDING_STATE.REQUESTING ? 'Starting...' : 'Start Recording';

      // Reset timer
      stopTimer();
      els.recordingTimer.textContent = '00:00';
      els.transcriptText.innerHTML = '<span class="transcript-placeholder">Waiting for speech...</span>';
      break;

    case RECORDING_STATE.RECORDING:
      if (recordSection) recordSection.classList.add('hidden');
      els.recordingSection.classList.remove('hidden');
      els.recordingStatusText.textContent = 'Recording';
      els.recordingStatusText.style.color = 'var(--danger)';
      document.querySelector('.recording-dot').style.animationPlayState = 'running';
      els.btnPause.classList.remove('hidden');
      els.btnResume.classList.add('hidden');

      if (data.transcript) {
        els.transcriptText.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'transcript-final';
        span.textContent = data.transcript;
        els.transcriptText.appendChild(span);
        els.transcriptText.scrollTop = els.transcriptText.scrollHeight;
      }

      startTimer(data.startTime);
      startVisualizer();
      break;

    case RECORDING_STATE.PAUSED:
      if (recordSection) recordSection.classList.add('hidden');
      els.recordingSection.classList.remove('hidden');
      els.recordingStatusText.textContent = 'Paused';
      els.recordingStatusText.style.color = 'var(--warning)';
      document.querySelector('.recording-dot').style.animationPlayState = 'paused';
      els.btnPause.classList.add('hidden');
      els.btnResume.classList.remove('hidden');

      if (data.transcript) {
        els.transcriptText.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'transcript-final';
        span.textContent = data.transcript;
        els.transcriptText.appendChild(span);
        els.transcriptText.scrollTop = els.transcriptText.scrollHeight;
      }

      stopVisualizer();
      break;

    case RECORDING_STATE.STOPPING:
    case RECORDING_STATE.PROCESSING:
      if (recordSection) recordSection.classList.add('hidden');
      els.processingSection.classList.remove('hidden');
      els.processingText.textContent = 'Processing recording...';
      stopTimer();
      stopVisualizer();
      break;

    case RECORDING_STATE.UPLOADING:
      if (recordSection) recordSection.classList.add('hidden');
      els.processingSection.classList.remove('hidden');
      els.processingText.textContent = 'Uploading to cloud...';
      els.progressBarContainer.classList.remove('hidden');
      break;

    case RECORDING_STATE.DONE:
      if (recordSection) recordSection.classList.add('hidden');
      els.doneSection.classList.remove('hidden');
      if (data.duration) {
        els.doneDuration.textContent = `Duration: ${formatDuration(data.duration)}`;
      }
      if (data.fileSize) {
        const sizeMB = (data.fileSize / 1024 / 1024).toFixed(1);
        els.doneSize.textContent = `Size: ${sizeMB} MB`;
      }
      stopTimer();
      stopVisualizer();
      break;

    case RECORDING_STATE.ERROR:
      if (recordSection) recordSection.classList.add('hidden');
      els.errorSection.classList.remove('hidden');
      els.errorText.textContent = data.error || 'An unexpected error occurred';
      stopTimer();
      stopVisualizer();
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════════════════
function startTimer(startTime) {
  stopTimer();

  const baseTime = startTime || Date.now();

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - baseTime;
    els.recordingTimer.textContent = formatDuration(elapsed);
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIO VISUALIZER (simulated waveform)
// ═══════════════════════════════════════════════════════════════
function startVisualizer() {
  const canvas = els.visualizer;
  const ctx = canvas.getContext('2d');
  const bars = 32;
  const barWidth = canvas.width / bars;
  const heights = new Float32Array(bars).fill(0);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < bars; i++) {
      // Smooth random heights for visual effect
      const target = Math.random() * 0.6 + 0.1;
      heights[i] += (target - heights[i]) * 0.15;

      const h = heights[i] * canvas.height;
      const x = i * barWidth + 1;
      const w = barWidth - 2;
      const y = (canvas.height - h) / 2;

      // Gradient color: accent orange-red
      const gradient = ctx.createLinearGradient(0, y, 0, y + h);
      gradient.addColorStop(0, 'rgba(255, 107, 107, 0.9)');
      gradient.addColorStop(0.5, 'rgba(238, 90, 36, 0.7)');
      gradient.addColorStop(1, 'rgba(240, 147, 43, 0.5)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 2);
      ctx.fill();
    }

    visualizerAnimId = requestAnimationFrame(draw);
  }

  draw();
}

function stopVisualizer() {
  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }

  // Clear canvas
  const ctx = els.visualizer?.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, els.visualizer.width, els.visualizer.height);
  }
}

// ═══════════════════════════════════════════════════════════════
// TRANSCRIPT UI
// ═══════════════════════════════════════════════════════════════
function appendTranscript(text, isFinal) {
  // Remove placeholder
  const placeholder = els.transcriptText.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  // Remove any interim text
  const interim = els.transcriptText.querySelector('.transcript-interim');
  if (interim) interim.remove();

  if (isFinal && text) {
    const span = document.createElement('span');
    span.className = 'transcript-final';
    span.textContent = text + ' ';
    els.transcriptText.appendChild(span);

    // Auto-scroll
    els.transcriptText.scrollTop = els.transcriptText.scrollHeight;
  }
}

function showInterimTranscript(text) {
  let interim = els.transcriptText.querySelector('.transcript-interim');

  if (!interim) {
    interim = document.createElement('span');
    interim.className = 'transcript-interim';
    els.transcriptText.appendChild(interim);
  }

  interim.textContent = text;
  els.transcriptText.scrollTop = els.transcriptText.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
