import test from 'node:test';
import assert from 'node:assert/strict';

const sent = [];
class FakeRecognition {
  start() { this.onstart?.(); }
  stop() {
    setTimeout(() => {
      this.emit('kalimat terakhir');
      this.onend?.();
    }, 20);
  }
  emit(text) {
    const result = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true });
    this.onresult({ resultIndex: 0, results: [result] });
  }
}
globalThis.window = { SpeechRecognition: FakeRecognition };
globalThis.chrome = { runtime: { sendMessage: async (m) => { sent.push(m); } } };
const { Transcriber } = await import('../src/lib/transcriber.js');

test('each sentence is reported exactly once', () => {
  const got = [];
  const t = new Transcriber();
  t.init({ onResult: (s) => got.push(s.text) });
  t.start();
  t.recognition.emit('halo');
  assert.deepEqual(got, ['halo']);
  assert.equal(sent.length, 0);
});

test('stopping waits for the last sentence', async () => {
  const got = [];
  const t = new Transcriber();
  t.init({ onResult: (s) => got.push(s.text) });
  t.start();
  await t.stopAndFlush();
  assert.deepEqual(got, ['kalimat terakhir']);
});

test('resuming after a pause keeps earlier sentences', () => {
  const t = new Transcriber();
  t.init({});
  t.start();
  t.recognition.emit('satu');
  t.start();
  assert.equal(t.getFullTranscript(), 'satu');
});
