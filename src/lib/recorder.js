import { RECORDING_STATE } from '../utils/constants.js';

/**
 * Recording State Machine
 * Manages the state transitions for the recording lifecycle.
 */
export class RecordingStateMachine {
  constructor() {
    this.state = RECORDING_STATE.IDLE;
    this.startTime = 0;
    this.pausedDuration = 0;
    this.pauseStartTime = 0;
    this.mode = null;
    this.listeners = new Set();
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Called with (newState, oldState)
   * @returns {Function} Unsubscribe function
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Transition to a new state
   * @param {string} newState - Target state
   */
  transition(newState) {
    const oldState = this.state;

    if (!this._isValidTransition(oldState, newState)) {
      console.warn(`[RecordX] Invalid state transition: ${oldState} → ${newState}`);
      return;
    }

    this.state = newState;

    // Handle side effects
    switch (newState) {
      case RECORDING_STATE.RECORDING:
        if (oldState === RECORDING_STATE.REQUESTING) {
          this.startTime = Date.now();
          this.pausedDuration = 0;
        }
        if (oldState === RECORDING_STATE.PAUSED) {
          this.pausedDuration += Date.now() - this.pauseStartTime;
        }
        break;

      case RECORDING_STATE.PAUSED:
        this.pauseStartTime = Date.now();
        break;

      case RECORDING_STATE.IDLE:
        this.reset();
        break;
    }

    // Notify listeners
    this.listeners.forEach((cb) => cb(newState, oldState));
  }

  /**
   * Get the effective elapsed recording time (excluding paused duration)
   * @returns {number} Elapsed time in milliseconds
   */
  getElapsedTime() {
    if (this.state === RECORDING_STATE.IDLE || this.startTime === 0) return 0;

    const now = Date.now();
    let elapsed = now - this.startTime - this.pausedDuration;

    if (this.state === RECORDING_STATE.PAUSED) {
      elapsed -= (now - this.pauseStartTime);
    }

    return Math.max(0, elapsed);
  }

  /**
   * Reset the state machine to initial state
   */
  reset() {
    this.startTime = 0;
    this.pausedDuration = 0;
    this.pauseStartTime = 0;
    this.mode = null;
  }

  /**
   * Get a serializable snapshot of the current state
   * @returns {object}
   */
  toJSON() {
    return {
      state: this.state,
      mode: this.mode,
      startTime: this.startTime,
      elapsed: this.getElapsedTime(),
    };
  }

  /**
   * Check if a state transition is valid
   * @private
   */
  _isValidTransition(from, to) {
    const transitions = {
      [RECORDING_STATE.IDLE]: [RECORDING_STATE.REQUESTING],
      [RECORDING_STATE.REQUESTING]: [RECORDING_STATE.RECORDING, RECORDING_STATE.ERROR, RECORDING_STATE.IDLE],
      [RECORDING_STATE.RECORDING]: [RECORDING_STATE.PAUSED, RECORDING_STATE.STOPPING, RECORDING_STATE.ERROR],
      [RECORDING_STATE.PAUSED]: [RECORDING_STATE.RECORDING, RECORDING_STATE.STOPPING, RECORDING_STATE.ERROR],
      [RECORDING_STATE.STOPPING]: [RECORDING_STATE.PROCESSING, RECORDING_STATE.ERROR],
      [RECORDING_STATE.PROCESSING]: [RECORDING_STATE.UPLOADING, RECORDING_STATE.ERROR, RECORDING_STATE.DONE],
      [RECORDING_STATE.UPLOADING]: [RECORDING_STATE.DONE, RECORDING_STATE.ERROR],
      [RECORDING_STATE.DONE]: [RECORDING_STATE.IDLE],
      [RECORDING_STATE.ERROR]: [RECORDING_STATE.IDLE],
    };

    return transitions[from]?.includes(to) ?? false;
  }
}

/**
 * Singleton instance for the recording state machine
 */
let instance = null;
export function getRecorderState() {
  if (!instance) instance = new RecordingStateMachine();
  return instance;
}
