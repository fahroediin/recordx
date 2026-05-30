import { MSG, TARGET, TRANSCRIPTION } from '../utils/constants.js';

/**
 * Web Speech API Transcription Engine
 * Provides real-time speech-to-text during recording.
 * 
 * NOTE: This must run in a DOM context (popup, tab, or offscreen document).
 * It cannot run in the service worker.
 */
export class Transcriber {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.language = TRANSCRIPTION.DEFAULT_LANGUAGE;
    this.segments = [];
    this.onResult = null;
    this.onInterim = null;
    this.onError = null;
    this.onStatusChange = null;
    this._restartTimeout = null;
    this._startTime = 0;
  }

  /**
   * Check if Web Speech API is available
   * @returns {boolean}
   */
  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Initialize the speech recognition engine
   * @param {object} [options]
   * @param {string} [options.language='id-ID'] - Recognition language
   * @param {Function} [options.onResult] - Called with final transcript segment
   * @param {Function} [options.onInterim] - Called with interim (in-progress) transcript
   * @param {Function} [options.onError] - Called with error details
   * @param {Function} [options.onStatusChange] - Called with 'listening'|'stopped'|'error'
   */
  init(options = {}) {
    if (!Transcriber.isSupported()) {
      console.warn('[Transcriber] Web Speech API not supported');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configuration
    this.language = options.language || TRANSCRIPTION.DEFAULT_LANGUAGE;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;
    this.recognition.maxAlternatives = 1;

    // Callbacks
    this.onResult = options.onResult || null;
    this.onInterim = options.onInterim || null;
    this.onError = options.onError || null;
    this.onStatusChange = options.onStatusChange || null;

    // Event handlers
    this.recognition.onresult = (event) => this._handleResult(event);
    this.recognition.onerror = (event) => this._handleError(event);
    this.recognition.onend = () => this._handleEnd();
    this.recognition.onstart = () => {
      this.isListening = true;
      this.onStatusChange?.('listening');
    };

    return true;
  }

  /**
   * Start transcription
   */
  start() {
    if (!this.recognition) {
      console.warn('[Transcriber] Not initialized. Call init() first.');
      return;
    }

    this.segments = [];
    this._startTime = Date.now();

    try {
      this.recognition.start();
    } catch (err) {
      // Already started — restart
      if (err.message?.includes('already started')) {
        this.recognition.stop();
        setTimeout(() => this.recognition.start(), 100);
      } else {
        console.error('[Transcriber] Start error:', err);
      }
    }
  }

  /**
   * Stop transcription
   */
  stop() {
    this.isListening = false;
    clearTimeout(this._restartTimeout);

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {
        // Already stopped
      }
    }

    this.onStatusChange?.('stopped');
  }

  /**
   * Change the recognition language
   * @param {string} language - Language code (e.g. 'id-ID', 'en-US')
   */
  setLanguage(language) {
    this.language = language;
    if (this.recognition) {
      this.recognition.lang = language;

      // Restart if currently listening
      if (this.isListening) {
        this.stop();
        setTimeout(() => this.start(), 200);
      }
    }
  }

  /**
   * Get the full transcript text
   * @returns {string}
   */
  getFullTranscript() {
    return this.segments.map((s) => s.text).join(' ');
  }

  /**
   * Get all segments with timestamps
   * @returns {object[]}
   */
  getSegments() {
    return [...this.segments];
  }

  /**
   * Send transcript to service worker
   */
  sendToServiceWorker() {
    if (this.segments.length === 0) return;

    this.segments.forEach((segment) => {
      chrome.runtime.sendMessage({
        type: MSG.TRANSCRIPT_RESULT,
        target: TARGET.SERVICE_WORKER,
        data: segment,
      });
    });
  }

  // ─── Private Methods ────────────────────────────────────────

  _handleResult(event) {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      const confidence = result[0].confidence;

      if (result.isFinal) {
        const segment = {
          text,
          confidence,
          timestamp: Date.now() - this._startTime,
          language: this.language,
          isFinal: true,
        };

        this.segments.push(segment);
        this.onResult?.(segment);

        // Also send to service worker for storage
        chrome.runtime.sendMessage({
          type: MSG.TRANSCRIPT_RESULT,
          target: TARGET.SERVICE_WORKER,
          data: segment,
        }).catch(() => {});
      } else {
        // Interim result
        this.onInterim?.({
          text,
          confidence,
          timestamp: Date.now() - this._startTime,
          isFinal: false,
        });
      }
    }
  }

  _handleError(event) {
    console.warn('[Transcriber] Error:', event.error, event.message);

    switch (event.error) {
      case 'no-speech':
        // Normal — no speech detected, will auto-restart
        break;
      case 'audio-capture':
        this.onError?.('Microphone not accessible');
        break;
      case 'not-allowed':
        this.onError?.('Microphone permission denied');
        this.isListening = false;
        this.onStatusChange?.('error');
        break;
      case 'network':
        this.onError?.('Network error — speech recognition requires internet');
        break;
      default:
        this.onError?.(`Speech recognition error: ${event.error}`);
    }
  }

  _handleEnd() {
    // Auto-restart if we're supposed to be listening
    // (Web Speech API stops automatically after silence or errors)
    if (this.isListening) {
      this._restartTimeout = setTimeout(() => {
        try {
          this.recognition.start();
        } catch (err) {
          console.warn('[Transcriber] Restart failed:', err.message);
        }
      }, 300);
    } else {
      this.onStatusChange?.('stopped');
    }
  }

  /**
   * Destroy the transcriber and clean up resources
   */
  destroy() {
    this.stop();
    this.recognition = null;
    this.segments = [];
    this.onResult = null;
    this.onInterim = null;
    this.onError = null;
    this.onStatusChange = null;
  }
}
