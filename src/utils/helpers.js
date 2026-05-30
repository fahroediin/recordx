/**
 * Format milliseconds to HH:MM:SS display string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format bytes to human-readable file size
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Generate a unique filename for a recording
 * @param {string} mode - Recording mode
 * @returns {string} Unique filename
 */
export function generateFilename(mode = 'recording') {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const rand = Math.random().toString(36).substring(2, 6);
  return `recordx_${mode}_${date}_${time}_${rand}.webm`;
}

/**
 * Format date to locale-friendly string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

/**
 * Debounce a function call
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Create a simple event emitter
 * @returns {object} EventEmitter with on, off, emit methods
 */
export function createEventEmitter() {
  const listeners = new Map();

  return {
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => this.off(event, callback);
    },
    off(event, callback) {
      listeners.get(event)?.delete(callback);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
  };
}

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function uuid() {
  return crypto.randomUUID();
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Duration to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate text to a max length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum character length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Convert blob to base64 data URL
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 data URL
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert base64 data URL to Blob
 * @param {string} base64 - Base64 data URL
 * @returns {Blob} Blob object
 */
export function base64ToBlob(base64) {
  const [meta, data] = base64.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Save a Blob to IndexedDB for zero-copy background sharing
 * @param {string} key - Database key
 * @param {Blob} blob - Blob to save
 * @returns {Promise<void>}
 */
export function saveBlobToIndexedDB(key, blob) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RecordXDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const transaction = db.transaction('blobs', 'readwrite');
      const store = transaction.objectStore('blobs');
      const putRequest = store.put(blob, key);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve a Blob from IndexedDB
 * @param {string} key - Database key
 * @returns {Promise<Blob>}
 */
export function getBlobFromIndexedDB(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RecordXDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const transaction = db.transaction('blobs', 'readonly');
      const store = transaction.objectStore('blobs');
      const getRequest = store.get(key);
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a Blob from IndexedDB
 * @param {string} key - Database key
 * @returns {Promise<void>}
 */
export function deleteBlobFromIndexedDB(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('RecordXDB', 1);
    request.onsuccess = (e) => {
      const db = e.target.result;
      const transaction = db.transaction('blobs', 'readwrite');
      const store = transaction.objectStore('blobs');
      const deleteRequest = store.delete(key);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}
