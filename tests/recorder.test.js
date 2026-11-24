import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingStateMachine } from '../src/lib/recorder.js';
import { RECORDING_STATE as S } from '../src/utils/constants.js';

function recording() {
  const r = new RecordingStateMachine();
  r.transition(S.REQUESTING);
  r.transition(S.RECORDING);
  return r;
}

test('a recording ended from the Chrome bar reaches DONE and can start again', () => {
  const r = recording();
  for (const s of [S.PROCESSING, S.DONE, S.IDLE, S.REQUESTING]) {
    r.transition(s);
    assert.equal(r.state, s);
  }
});

test('a paused recording ended from the Chrome bar is processed', () => {
  const r = recording();
  r.transition(S.PAUSED);
  r.transition(S.PROCESSING);
  assert.equal(r.state, S.PROCESSING);
});

test('state survives a service worker restart', () => {
  const r = recording();
  r.mode = 'screen_system';
  r.startTime = Date.now() - 5000;
  r.transition(S.PAUSED);
  const snapshot = JSON.parse(JSON.stringify(r.serialize()));
  const restored = new RecordingStateMachine();
  restored.hydrate(snapshot);
  assert.equal(restored.state, S.PAUSED);
  assert.equal(restored.mode, 'screen_system');
  assert.ok(Math.abs(restored.getElapsedTime() - 5000) < 200);
});
