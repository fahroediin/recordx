/**
 * MediaRecorder writes WebM as a live stream, without a Duration element, so
 * players show no length and cannot seek. This adds the duration to the header
 * and leaves the (possibly very large) media data untouched.
 */
const HEADER_BYTES = 64 * 1024;

const ID = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  SEEK_HEAD: 0x114d9b74,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  CLUSTER: 0x1f43b675,
};

/**
 * @param {Blob} blob - Recording produced by MediaRecorder
 * @param {number} durationMs - Recorded length, pauses excluded
 * @returns {Promise<Blob>} Patched blob, or the original when the layout is not a live WebM
 */
export async function withWebmDuration(blob, durationMs) {
  try {
    const head = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
    const patched = patchHeader(head, durationMs);
    if (!patched) return blob;
    return new Blob([patched, blob.slice(head.length)], { type: blob.type });
  } catch (err) {
    console.warn('[RecordX] Could not add duration to recording:', err);
    return blob;
  }
}

function patchHeader(buf, durationMs) {
  const ebml = readElement(buf, 0);
  if (ebml?.id !== ID.EBML) return null;

  const segment = readElement(buf, ebml.end);
  // A known segment size would have to grow too; MediaRecorder never writes one.
  if (segment?.id !== ID.SEGMENT || !segment.unknownSize) return null;

  let info = null;
  let hasSeekHead = false;
  for (let pos = segment.dataStart; pos < buf.length; ) {
    const el = readElement(buf, pos);
    if (!el || el.id === ID.CLUSTER) break;
    if (el.id === ID.SEEK_HEAD) hasSeekHead = true;
    if (el.id === ID.INFO) {
      info = el;
      break;
    }
    pos = el.end;
  }
  if (!info || info.unknownSize || info.end > buf.length) return null;

  let scale = 1000000;
  let duration = null;
  for (let pos = info.dataStart; pos < info.end; ) {
    const el = readElement(buf, pos);
    if (!el) return null;
    if (el.id === ID.TIMECODE_SCALE) scale = readUint(buf, el.dataStart, el.end);
    if (el.id === ID.DURATION) duration = el;
    pos = el.end;
  }
  const value = (durationMs * 1000000) / scale;

  if (duration) {
    const out = buf.slice();
    const view = new DataView(out.buffer);
    if (duration.end - duration.dataStart === 8) view.setFloat64(duration.dataStart, value);
    else view.setFloat32(duration.dataStart, value);
    return out;
  }

  // Growing Info would invalidate the offsets stored in a SeekHead.
  if (hasSeekHead) return null;

  const body = buf.slice(info.dataStart, info.end);
  const element = new Uint8Array(11);
  element.set([0x44, 0x89, 0x88]);
  new DataView(element.buffer).setFloat64(3, value);

  const size = new Uint8Array(8);
  new DataView(size.buffer).setUint32(4, body.length + element.length);
  size[0] = 0x01; // 8-byte EBML size marker

  const infoId = buf.slice(info.start, info.start + 4);
  const parts = [buf.slice(0, info.start), infoId, size, body, element, buf.slice(info.end)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readElement(buf, start) {
  const id = readVint(buf, start, true);
  if (!id) return null;
  const size = readVint(buf, start + id.length, false);
  if (!size) return null;
  const dataStart = start + id.length + size.length;
  return {
    id: id.value,
    start,
    dataStart,
    unknownSize: size.unknown,
    end: size.unknown ? Infinity : dataStart + size.value,
  };
}

function readVint(buf, pos, keepMarker) {
  const first = buf[pos];
  if (!first) return null;
  const length = Math.clz32(first) - 23;
  if (pos + length > buf.length) return null;
  const mask = (1 << (8 - length)) - 1;
  let value = keepMarker ? first : first & mask;
  let allOnes = (first & mask) === mask;
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readUint(buf, start, end) {
  let value = 0;
  for (let i = start; i < end; i++) value = value * 256 + buf[i];
  return value;
}
