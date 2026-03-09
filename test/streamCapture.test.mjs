import test from "#test/runner";
import assert from "#test/assert";
import { Buffer } from "node:buffer";
import {
  collectCompleteVideoFrames,
  parseAudioPacket,
  parseVideoPacket,
} from "../src/streamCapture.js";

function buildVideoPacket({
  sequence,
  frameNumber,
  lineNumber,
  isLastPacket = false,
  pixelsPerLine = 8,
  linesPerPacket = 2,
  rows,
}) {
  const header = Buffer.alloc(12);
  header.writeUInt16LE(sequence, 0);
  header.writeUInt16LE(frameNumber, 2);
  header.writeUInt16LE(isLastPacket ? (lineNumber | 0x8000) : lineNumber, 4);
  header.writeUInt16LE(pixelsPerLine, 6);
  header.writeUInt8(linesPerPacket, 8);
  header.writeUInt8(4, 9);
  header.writeUInt16LE(0, 10);

  const payload = Buffer.alloc((pixelsPerLine / 2) * linesPerPacket);
  let offset = 0;
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 2) {
      payload[offset++] = (row[index] & 0x0f) | ((row[index + 1] & 0x0f) << 4);
    }
  }

  return Buffer.concat([header, payload]);
}

test("parseVideoPacket decodes C64U packet headers", () => {
  const packet = buildVideoPacket({
    sequence: 12,
    frameNumber: 7,
    lineNumber: 4,
    rows: [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [8, 7, 6, 5, 4, 3, 2, 1],
    ],
  });

  const parsed = parseVideoPacket(packet);

  assert.equal(parsed.sequence, 12);
  assert.equal(parsed.frameNumber, 7);
  assert.equal(parsed.lineNumber, 4);
  assert.equal(parsed.isLastPacket, false);
  assert.equal(parsed.pixelsPerLine, 8);
  assert.equal(parsed.linesPerPacket, 2);
  assert.equal(parsed.bitsPerPixel, 4);
  assert.equal(parsed.encodingType, 0);
  assert.equal(parsed.payload.length, 8);
});

test("collectCompleteVideoFrames reconstructs complete pixel rows", () => {
  const packets = [
    parseVideoPacket(buildVideoPacket({
      sequence: 1,
      frameNumber: 3,
      lineNumber: 0,
      rows: [
        [0, 1, 2, 3, 4, 5, 6, 7],
        [7, 6, 5, 4, 3, 2, 1, 0],
      ],
    })),
    parseVideoPacket(buildVideoPacket({
      sequence: 2,
      frameNumber: 3,
      lineNumber: 2,
      isLastPacket: true,
      rows: [
        [1, 1, 1, 1, 2, 2, 2, 2],
        [3, 3, 3, 3, 4, 4, 4, 4],
      ],
    })),
  ];

  const frames = collectCompleteVideoFrames(packets, 1);

  assert.equal(frames.length, 1);
  assert.equal(frames[0].frameNumber, 3);
  assert.equal(frames[0].width, 8);
  assert.equal(frames[0].height, 4);
  assert.equal(frames[0].complete, true);
  assert.deepEqual(
    Array.from(frames[0].pixels),
    [
      0, 1, 2, 3, 4, 5, 6, 7,
      7, 6, 5, 4, 3, 2, 1, 0,
      1, 1, 1, 1, 2, 2, 2, 2,
      3, 3, 3, 3, 4, 4, 4, 4,
    ],
  );
});

test("parseAudioPacket decodes interleaved PCM16 samples", () => {
  const payload = Buffer.alloc(2 + 8);
  payload.writeUInt16LE(9, 0);
  payload.writeInt16LE(1000, 2);
  payload.writeInt16LE(-1000, 4);
  payload.writeInt16LE(2000, 6);
  payload.writeInt16LE(-2000, 8);

  const parsed = parseAudioPacket(payload);

  assert.equal(parsed.sequence, 9);
  assert.deepEqual(Array.from(parsed.samples), [1000, -1000, 2000, -2000]);
});
