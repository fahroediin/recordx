import test from 'node:test';
import assert from 'node:assert/strict';
import { withWebmDuration } from '../src/lib/webm-duration.js';

// Minimal live-style WebM: EBML header, Segment (unknown size), Info, then payload.
function liveWebm(infoChildren, { segmentSize = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] } = {}) {
  return new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01,
    0x18, 0x53, 0x80, 0x67, ...segmentSize,
    0x15, 0x49, 0xa9, 0x66, 0x80 | infoChildren.length, ...infoChildren,
    0x16, 0x54, 0xae, 0x6b, 0x81, 0x77,
  ]);
}
const TIMECODE_SCALE = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40];
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

function readDuration(buf) {
  for (let i = 0; i < buf.length - 11; i++) {
    if (buf[i] === 0x44 && buf[i + 1] === 0x89 && buf[i + 2] === 0x88) {
      return new DataView(buf.buffer, buf.byteOffset + i + 3, 8).getFloat64(0);
    }
  }
  return null;
}

test('adds a Duration element when the recorder left it out', async () => {
  const src = new Blob([liveWebm(TIMECODE_SCALE)], { type: 'video/webm' });
  const out = await withWebmDuration(src, 4321);
  const b = await bytes(out);
  assert.equal(readDuration(b), 4321);
  assert.equal(out.type, 'video/webm');
  // Everything after Info is untouched.
  assert.deepEqual([...b.slice(-6)], [0x16, 0x54, 0xae, 0x6b, 0x81, 0x77]);
});

test('overwrites an existing Duration without changing the size', async () => {
  const info = [...TIMECODE_SCALE, 0x44, 0x89, 0x88, 0, 0, 0, 0, 0, 0, 0, 0];
  const src = new Blob([liveWebm(info)]);
  const out = await withWebmDuration(src, 1500);
  assert.equal(out.size, src.size);
  assert.equal(readDuration(await bytes(out)), 1500);
});

test('returns the original blob when it is not a live WebM', async () => {
  const mp4 = new Blob([new Uint8Array(64)], { type: 'video/mp4' });
  assert.equal(await withWebmDuration(mp4, 1000), mp4);
  const sized = new Blob([liveWebm(TIMECODE_SCALE, { segmentSize: [0x9f] })]);
  assert.equal(await withWebmDuration(sized, 1000), sized);
});
