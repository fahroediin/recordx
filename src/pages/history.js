import { getRecordings, deleteRecording, getTranscript } from '../lib/database.js';
import { getRecordingUrl, deleteRecordingFile, downloadRecording } from '../lib/storage.js';
import { getSession } from '../lib/auth.js';
import { RECORDING_MODE_LABELS, RECORDING_MODE_ICONS } from '../utils/constants.js';
import { formatDuration, formatDate, formatFileSize, debounce } from '../utils/helpers.js';

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);

const els = {
  searchInput: $('#search-input'),
  loadingState: $('#loading-state'),
  emptyState: $('#empty-state'),
  recordingsGrid: $('#recordings-grid'),
  loadMoreContainer: $('#load-more-container'),
  btnLoadMore: $('#btn-load-more'),

  // Player modal
  playerModal: $('#player-modal'),
  modalBackdrop: $('#modal-backdrop'),
  playerTitle: $('#player-title'),
  videoPlayer: $('#video-player'),
  btnCloseModal: $('#btn-close-modal'),
  btnDownload: $('#btn-download'),
  btnTranscript: $('#btn-transcript'),
  btnMom: $('#btn-mom'),

  // Transcript modal
  transcriptModal: $('#transcript-modal'),
  transcriptBackdrop: $('#transcript-backdrop'),
  transcriptContent: $('#transcript-content'),
  btnCloseTranscript: $('#btn-close-transcript'),
  btnCopyTranscript: $('#btn-copy-transcript'),
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let recordings = [];
let currentPage = 0;
let totalCount = 0;
let currentRecording = null;
const PAGE_SIZE = 20;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
async function init() {
  const { data } = await getSession();
  if (!data?.session) {
    // Redirect to popup if not authenticated
    els.loadingState.innerHTML = `
      <div class="empty-icon">🔒</div>
      <h2 class="empty-title">Please sign in</h2>
      <p class="empty-desc">Open the RecordX extension popup to sign in first</p>
    `;
    return;
  }

  bindEvents();
  await loadRecordings();
}

// ═══════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ═══════════════════════════════════════════════════════════════
function bindEvents() {
  // Search
  els.searchInput.addEventListener(
    'input',
    debounce(() => {
      currentPage = 0;
      recordings = [];
      loadRecordings();
    }, 400)
  );

  // Load more
  els.btnLoadMore.addEventListener('click', () => {
    currentPage++;
    loadRecordings(true);
  });

  // Player modal
  els.btnCloseModal.addEventListener('click', closePlayerModal);
  els.modalBackdrop.addEventListener('click', closePlayerModal);

  // Transcript modal
  els.btnCloseTranscript.addEventListener('click', closeTranscriptModal);
  els.transcriptBackdrop.addEventListener('click', closeTranscriptModal);

  // Download
  els.btnDownload.addEventListener('click', handleDownload);

  // Transcript
  els.btnTranscript.addEventListener('click', handleViewTranscript);

  // Copy transcript
  els.btnCopyTranscript.addEventListener('click', handleCopyTranscript);

  // MoM
  els.btnMom.addEventListener('click', handleGenerateMoM);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePlayerModal();
      closeTranscriptModal();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════
async function loadRecordings(append = false) {
  if (!append) {
    els.loadingState.classList.remove('hidden');
    els.recordingsGrid.classList.add('hidden');
    els.emptyState.classList.add('hidden');
  }

  const search = els.searchInput.value.trim();
  const { data, count, error } = await getRecordings({
    page: currentPage,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  els.loadingState.classList.add('hidden');

  if (error) {
    console.error('Failed to load recordings:', error);
    return;
  }

  totalCount = count;

  if (append) {
    recordings = [...recordings, ...data];
  } else {
    recordings = data;
  }

  if (recordings.length === 0) {
    els.emptyState.classList.remove('hidden');
    els.recordingsGrid.classList.add('hidden');
  } else {
    els.emptyState.classList.add('hidden');
    els.recordingsGrid.classList.remove('hidden');
    renderRecordings(append);
  }

  // Show/hide load more
  const hasMore = recordings.length < totalCount;
  els.loadMoreContainer.classList.toggle('hidden', !hasMore);
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════
function renderRecordings(append = false) {
  if (!append) {
    els.recordingsGrid.innerHTML = '';
  }

  const fragment = document.createDocumentFragment();

  const startIdx = append ? recordings.length - PAGE_SIZE : 0;
  const renderSet = append ? recordings.slice(startIdx) : recordings;

  renderSet.forEach((rec) => {
    const card = createRecordingCard(rec);
    fragment.appendChild(card);
  });

  els.recordingsGrid.appendChild(fragment);
}

function createRecordingCard(recording) {
  const card = document.createElement('div');
  card.className = 'recording-card';
  card.dataset.id = recording.id;

  const modeIcon = RECORDING_MODE_ICONS[recording.mode] || '🖥️';
  const modeLabel = RECORDING_MODE_LABELS[recording.mode] || recording.mode;
  const duration = formatDuration(recording.duration_ms || 0);
  const date = formatDate(recording.created_at);
  const size = formatFileSize(recording.file_size || 0);

  card.innerHTML = `
    <div class="recording-card__preview">
      <div class="recording-card__preview-icon">🎬</div>
      <div class="recording-card__play-overlay">
        <div class="recording-card__play-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        </div>
      </div>
      <div class="recording-card__duration">${duration}</div>
    </div>
    <div class="recording-card__body">
      <div class="recording-card__title">${recording.title || 'Untitled Recording'}</div>
      <div class="recording-card__meta">
        <span class="recording-card__mode">${modeIcon} ${modeLabel}</span>
        <span>${date}</span>
        <span>${size}</span>
      </div>
    </div>
    <div class="recording-card__actions">
      <button class="recording-card__action-btn recording-card__action-btn--danger" data-action="delete" data-id="${recording.id}" title="Delete" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `;

  // Play click
  card.querySelector('.recording-card__preview').addEventListener('click', () => {
    openPlayerModal(recording);
  });

  // Delete click
  card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('Delete this recording? This cannot be undone.')) {
      await handleDelete(recording);
      card.remove();

      recordings = recordings.filter((r) => r.id !== recording.id);
      if (recordings.length === 0) {
        els.emptyState.classList.remove('hidden');
        els.recordingsGrid.classList.add('hidden');
      }
    }
  });

  return card;
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════
async function openPlayerModal(recording) {
  currentRecording = recording;
  els.playerTitle.textContent = recording.title || 'Recording';

  // Get signed URL for playback
  const { data, error } = await getRecordingUrl(recording.storage_path);
  if (error) {
    alert('Failed to load recording: ' + error.message);
    return;
  }

  els.videoPlayer.src = data.signedUrl;
  els.playerModal.classList.remove('hidden');
}

function closePlayerModal() {
  els.playerModal.classList.add('hidden');
  els.videoPlayer.pause();
  els.videoPlayer.src = '';
  currentRecording = null;
}

async function handleDownload() {
  if (!currentRecording) return;

  const { data, error } = await downloadRecording(currentRecording.storage_path);
  if (error) {
    alert('Download failed: ' + error.message);
    return;
  }

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentRecording.title + '.webm';
  a.click();
  URL.revokeObjectURL(url);
}

async function handleViewTranscript() {
  if (!currentRecording) return;

  const { data, error } = await getTranscript(currentRecording.id);
  if (error || !data) {
    els.transcriptContent.textContent = 'No transcript available for this recording.';
  } else {
    els.transcriptContent.textContent = data.content || 'Empty transcript';
  }

  closePlayerModal();
  els.transcriptModal.classList.remove('hidden');
}

function closeTranscriptModal() {
  els.transcriptModal.classList.add('hidden');
}

async function handleCopyTranscript() {
  const text = els.transcriptContent.textContent;
  await navigator.clipboard.writeText(text);
  els.btnCopyTranscript.textContent = 'Copied!';
  setTimeout(() => {
    els.btnCopyTranscript.textContent = 'Copy to Clipboard';
  }, 2000);
}

async function handleDelete(recording) {
  // Delete from storage
  await deleteRecordingFile(recording.storage_path);
  // Delete from database
  await deleteRecording(recording.id);
}

function handleGenerateMoM() {
  if (!currentRecording) return;
  const url = chrome.runtime.getURL(`src/pages/mom.html?recording_id=${currentRecording.id}`);
  chrome.tabs.create({ url });
  closePlayerModal();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
