import test from "#test/runner";
import assert from "#test/assert";
import { createSocket } from "node:dgram";
import { startMockC64Server } from "../scripts/mockC64Server.mjs";
import { parseAudioPacket, parseVideoPacket } from "../src/streamCapture.js";

async function bindSocket(socket) {
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.off("error", reject);
      resolve();
    });
  });
}

async function waitForPacket(socket) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for UDP packet")), 1000);
    socket.once("message", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test("mock C64U stream endpoints emit spec-shaped video and audio UDP packets", async (t) => {
  const mock = await startMockC64Server();
  const videoSocket = createSocket("udp4");
  const audioSocket = createSocket("udp4");

  t.after(async () => {
    videoSocket.close();
    audioSocket.close();
    await mock.close();
  });

  await bindSocket(videoSocket);
  await bindSocket(audioSocket);

  const videoAddress = videoSocket.address();
  const audioAddress = audioSocket.address();
  assert.ok(typeof videoAddress === "object");
  assert.ok(typeof audioAddress === "object");

  const videoTarget = `127.0.0.1:${videoAddress.port}`;
  const audioTarget = `127.0.0.1:${audioAddress.port}`;

  const videoStart = await fetch(`${mock.baseUrl}/v1/streams/video:start?ip=${encodeURIComponent(videoTarget)}`, {
    method: "PUT",
  });
  assert.equal(videoStart.status, 200);

  const audioStart = await fetch(`${mock.baseUrl}/v1/streams/audio:start?ip=${encodeURIComponent(audioTarget)}`, {
    method: "PUT",
  });
  assert.equal(audioStart.status, 200);

  const videoPacket = parseVideoPacket(await waitForPacket(videoSocket));
  const audioPacket = parseAudioPacket(await waitForPacket(audioSocket));

  assert.equal(videoPacket.pixelsPerLine, 384);
  assert.equal(videoPacket.linesPerPacket, 4);
  assert.equal(videoPacket.bitsPerPixel, 4);
  assert.equal(videoPacket.encodingType, 0);
  assert.equal(videoPacket.payload.length, 768);

  assert.equal(audioPacket.samples.length, 384);

  const videoStop = await fetch(`${mock.baseUrl}/v1/streams/video:stop`, { method: "PUT" });
  const audioStop = await fetch(`${mock.baseUrl}/v1/streams/audio:stop`, { method: "PUT" });
  assert.equal(videoStop.status, 200);
  assert.equal(audioStop.status, 200);
  assert.equal(mock.state.streams.video.active, false);
  assert.equal(mock.state.streams.audio.active, false);
  assert.ok(mock.state.streams.video.packetsSent >= 1);
  assert.ok(mock.state.streams.audio.packetsSent >= 1);
});
