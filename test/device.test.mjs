import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFacade } from "../src/device.js";
import { startViceMockServer } from "../src/vice/mockServer.js";

const platform = (process.env.C64_MODE ?? "").toLowerCase();
const viceSuite = platform === "vice" ? test : test.skip;
const viceTarget = (process.env.VICE_TEST_TARGET ?? "mock").toLowerCase();
const useViceMock = viceTarget !== "vice";
const READY_PATTERN = Uint8Array.of(0x12, 0x05, 0x01, 0x04, 0x19, 0x2E);
const WAIT_READY_TIMEOUT_MS = useViceMock ? 1_000 : 20_000;
const WAIT_READY_INTERVAL_MS = useViceMock ? 25 : 200;
const WAIT_READY_SCAN_LENGTH = 1_000; // full text screen

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPattern(
  facade,
  address,
  expected,
  { timeoutMs = WAIT_READY_TIMEOUT_MS, intervalMs = WAIT_READY_INTERVAL_MS, scanLength = WAIT_READY_SCAN_LENGTH } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let matchSlice = null;
  while (Date.now() < deadline) {
    const data = await facade.readMemory(address, scanLength);
    last = data;
    for (let offset = 0; offset <= data.length - expected.length; offset += 1) {
      let matches = true;
      for (let index = 0; index < expected.length; index += 1) {
        if (data[offset + index] !== expected[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        matchSlice = data.slice(offset, offset + expected.length);
        return matchSlice;
      }
    }
    await delay(intervalMs);
  }
  const lastSnapshot = last ? Array.from(last.slice(0, expected.length)) : null;
  throw new Error(
    `Timed out waiting for pattern at $${address.toString(16).toUpperCase()} (expected=${Array.from(expected)}, lastPrefix=${lastSnapshot})`,
  );
}

viceSuite("device: ViceBackend basic operations", async (t) => {
  let server = null;
  let cfgDir = null;
  let cfgPath = null;
  const oldConfig = process.env.C64BRIDGE_CONFIG;
  const oldMode = process.env.C64_MODE;
  const scratchAddress = 0x1000;
  const scratchBytes = Uint8Array.of(0x11, 0x22, 0x33, 0x44);

  if (useViceMock) {
    server = await startViceMockServer({ host: "127.0.0.1", port: 0 });
    cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "vice-config-"));
    cfgPath = path.join(cfgDir, "c64bridge.json");
    fs.writeFileSync(cfgPath, JSON.stringify({ vice: { host: "127.0.0.1", port: server.port } }), "utf8");
    process.env.C64BRIDGE_CONFIG = cfgPath;
    process.env.C64_MODE = "vice";
  }

  t.after(async () => {
    if (server) await server.stop();
    if (cfgDir) fs.rmSync(cfgDir, { recursive: true, force: true });
    if (oldConfig !== undefined) process.env.C64BRIDGE_CONFIG = oldConfig;
    else delete process.env.C64BRIDGE_CONFIG;
    if (oldMode !== undefined) process.env.C64_MODE = oldMode;
    else delete process.env.C64_MODE;
  });

  const { facade } = await createFacade();

  await t.test("ping succeeds", async () => {
    assert.equal(await facade.ping(), true);
  });

  await t.test("version reports vice backend", async () => {
    const version = await facade.version();
    assert.equal(version?.emulator, "vice");
  });

  await t.test("info reports vice endpoint", async () => {
    const info = await facade.info();
    assert.equal(info?.emulator, "vice");
    assert.ok(typeof info?.host === "string" && info.host.length > 0);
    assert.ok(Number.isInteger(info?.port));
  });

  await t.test("readMemory returns requested length", async () => {
    const data = await facade.readMemory(0x0400, READY_PATTERN.length);
    assert.equal(data.length, READY_PATTERN.length);
  });

  await t.test("writeMemory round-trips bytes", async () => {
    await facade.writeMemory(scratchAddress, scratchBytes);
    const data = await facade.readMemory(scratchAddress, scratchBytes.length);
    assert.deepEqual(Array.from(data), Array.from(scratchBytes));
  });

  await t.test("reset restores READY prompt", async () => {
    await facade.writeMemory(0x0400, new Uint8Array(READY_PATTERN.length).fill(0));
    await facade.reset();
    const data = await waitForPattern(facade, 0x0400, READY_PATTERN);
    assert.deepEqual(Array.from(data), Array.from(READY_PATTERN));
  });

  await t.test("pause/resume return success", async () => {
    assert.deepEqual(await facade.pause(), { success: true });
    assert.deepEqual(await facade.resume(), { success: true });
  });

  await t.test("loadPrgFile throws unsupported", async () => {
    await assert.rejects(() => facade.loadPrgFile("/tmp/test.prg"));
  });

  await t.test("runCrtFile throws unsupported", async () => {
    await assert.rejects(() => facade.runCrtFile("/tmp/test.crt"));
  });

  await t.test("sidplayFile throws unsupported", async () => {
    await assert.rejects(() => facade.sidplayFile("/tmp/test.sid"));
  });

  await t.test("sidplayAttachment throws unsupported", async () => {
    await assert.rejects(() => facade.sidplayAttachment(new Uint8Array([1, 2, 3])));
  });

  await t.test("poweroff succeeds and allows reconnect", async () => {
    const result = await facade.poweroff();
    assert.equal(result.success, true);
    // Give the supervisor a moment to respawn if needed.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await facade.ping(), true);
    if (!useViceMock) {
      await facade.poweroff();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  });

  await t.test("menuButton throws unsupported", async () => {
    await assert.rejects(() => facade.menuButton());
  });
});
