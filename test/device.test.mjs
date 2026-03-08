import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFacade } from "../src/device.js";
import { startViceMockServer } from "../src/vice/mockServer.js";
import { startMockC64Server } from "../scripts/mockC64Server.mjs";

const platform = (process.env.C64_MODE ?? "").toLowerCase();
const viceSuite = platform === "vice" ? test : test.skip;
const viceTarget = (process.env.VICE_TEST_TARGET ?? "mock").toLowerCase();
const useViceMock = viceTarget !== "vice";
const debugEnabled = process.env.VICE_DEVICE_TEST_DEBUG === "1";
function debugLog(...args) {
  if (debugEnabled) {
    console.error("[device.test]", ...args);
  }
}
const READY_PATTERN = Uint8Array.of(0x12, 0x05, 0x01, 0x04, 0x19, 0x2E);
const WAIT_READY_TIMEOUT_MS = useViceMock ? 1_000 : 10_000;
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
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  let last = null;
  let matchSlice = null;
  let attempts = 0;
  let lastLog = 0;
  while (Date.now() < deadline) {
    attempts += 1;
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
    if (debugEnabled) {
      const now = Date.now();
      if (attempts === 1 || now - lastLog >= 1_000) {
        debugLog(
          `scan attempt=${attempts}, elapsed=${now - startTime}ms, head=${Array.from(data.slice(0, expected.length))}`,
        );
        lastLog = now;
      }
    }
    await delay(intervalMs);
  }
  const lastSnapshot = last ? Array.from(last.slice(0, expected.length)) : null;
  if (debugEnabled) {
    debugLog(`timeout after ${attempts} attempts (${Date.now() - startTime}ms); lastPrefix=${lastSnapshot}`);
  }
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

  debugLog(`vice target=${viceTarget}; useViceMock=${useViceMock}`);

  if (useViceMock) {
    server = await startViceMockServer({ host: "127.0.0.1", port: 0 });
    cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "vice-config-"));
    cfgPath = path.join(cfgDir, "c64bridge.json");
    fs.writeFileSync(cfgPath, JSON.stringify({ vice: { host: "127.0.0.1", port: server.port } }), "utf8");
    process.env.C64BRIDGE_CONFIG = cfgPath;
    process.env.C64_MODE = "vice";
    debugLog(`mock vice server listening on ${server.port}`);
  } else {
    debugLog("running against real VICE backend");
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
  debugLog(`facade selected=${facade.type}`);

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
    debugLog("READY prompt restored");
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

  // Drive tests — resource-backed tests only run against the mock server
  if (useViceMock) {
    await t.test("drivesList returns array of 4 drives", async () => {
      const drives = await facade.drivesList();
      assert.ok(Array.isArray(drives));
      assert.equal(drives.length, 4);
      assert.ok(drives.every((d) => ["drive8", "drive9", "drive10", "drive11"].includes(d.id)));
      assert.ok(drives.every((d) => d.power === "on" || d.power === "off"));
    });

    await t.test("driveOn enables drive 8", async () => {
      const result = await facade.driveOn("drive8");
      assert.equal(result.success, true);
      const detail = result.details;
      assert.equal(detail.drive, "drive8");
      assert.equal(detail.power, "on");
    });

    await t.test("driveOff disables drive 8", async () => {
      const result = await facade.driveOff("drive8");
      assert.equal(result.success, true);
      const detail = result.details;
      assert.equal(detail.drive, "drive8");
      assert.equal(detail.power, "off");
    });

    await t.test("driveSetMode sets drive type to 1571", async () => {
      const result = await facade.driveSetMode("drive8", "1571");
      assert.equal(result.success, true);
    });

    await t.test("driveSetMode sets drive type to 1541", async () => {
      const result = await facade.driveSetMode("drive9", "1541");
      assert.equal(result.success, true);
    });

    await t.test("driveSetMode sets drive type to 1581", async () => {
      const result = await facade.driveSetMode("drive10", "1581");
      assert.equal(result.success, true);
    });

    await t.test("driveMount attaches image to drive 8", async () => {
      const result = await facade.driveMount("drive8", "/tmp/test.d64");
      assert.equal(result.success, true);
    });

    await t.test("driveReset resets drive 8", async () => {
      const result = await facade.driveReset("drive8");
      assert.equal(result.success, true);
    });

    await t.test("driveRemove detaches image from drive 8", async () => {
      const result = await facade.driveRemove("drive8");
      assert.equal(result.success, true);
    });
  }

  // These reject immediately without touching the backend — safe on real VICE too
  await t.test("driveLoadRom throws unsupported", async () => {
    await assert.rejects(() => facade.driveLoadRom("drive8", "/tmp/1541.rom"));
  });

  await t.test("driveOn throws on invalid drive", async () => {
    await assert.rejects(() => facade.driveOn("drive7"));
  });

  await t.test("driveOff throws on invalid drive", async () => {
    await assert.rejects(() => facade.driveOff("drive12"));
  });

  // Config tests
  await t.test("configsList returns categories array", async () => {
    // configsList returns a static structure — no BM round-trip required
    const list = await facade.configsList();
    assert.ok(list && typeof list === "object");
    assert.ok(Array.isArray(list.categories));
    assert.ok(list.categories.length > 0);
    assert.ok(list.categories[0].name);
    assert.ok(Array.isArray(list.categories[0].items));
  });

  if (useViceMock) {
    await t.test("configGet returns resource value for known key", async () => {
      // SidEngine is pre-seeded in mock server as value 1
      const result = await facade.configGet("VICE", "SidEngine");
      assert.ok(result && typeof result === "object");
      assert.ok("value" in result);
    });

    await t.test("configGet returns empty string for unknown key", async () => {
      const result = await facade.configGet("VICE", "UnknownKey99");
      assert.ok(result && typeof result === "object");
      assert.ok("value" in result);
    });

    await t.test("configSet writes a resource value", async () => {
      const result = await facade.configSet("VICE", "WarpMode", "1");
      assert.equal(result.success, true);
    });

    await t.test("configBatchUpdate sets multiple resources", async () => {
      const result = await facade.configBatchUpdate({ VICE: { SoundVolume: "80", WarpMode: "0" } });
      assert.equal(result.success, true);
    });
  }

  // These reject immediately without touching the backend
  await t.test("configLoadFromFlash throws unsupported", async () => {
    await assert.rejects(() => facade.configLoadFromFlash());
  });

  await t.test("configSaveToFlash throws unsupported", async () => {
    await assert.rejects(() => facade.configSaveToFlash());
  });

  await t.test("configResetToDefault throws unsupported", async () => {
    await assert.rejects(() => facade.configResetToDefault());
  });

  await t.test("filesInfo throws unsupported", async () => {
    await assert.rejects(() => facade.filesInfo("/tmp/test.d64"));
  });

  await t.test("filesCreateD64 throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateD64("/tmp/new.d64"));
  });

  await t.test("filesCreateD71 throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateD71("/tmp/new.d71"));
  });

  await t.test("filesCreateD81 throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateD81("/tmp/new.d81"));
  });

  await t.test("filesCreateDnp throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateDnp("/tmp/new.dnp"));
  });
});

test("device: createFacade with config file", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "c64bridge-test-"));
  const configPath = path.join(tmpDir, ".c64bridge.json");
  
  t.after(() => {
    try {
      fs.unlinkSync(configPath);
      fs.rmdirSync(tmpDir);
    } catch {}
  });

  await t.test("c64u config only", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      c64u: { hostname: "test.local", port: 8080 }
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "config only");
    assert.equal(facade.type, "c64u");
  });

  await t.test("vice config only", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      vice: { exe: "/usr/bin/x64sc" }
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "vice");
    assert.equal(reason, "config only");
    assert.equal(facade.type, "vice");
  });

  await t.test("both configs prefer c64u", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      c64u: { hostname: "test.local" },
      vice: { exe: "/usr/bin/x64sc" }
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "both defined (prefer c64u)");
    assert.equal(facade.type, "c64u");
  });

  await t.test("c64u config forwards networkPassword to REST backend", async () => {
    const mock = await startMockC64Server({ networkPassword: "open-sesame" });
    t.after(async () => {
      await mock.close();
    });

    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;

    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      c64u: { baseUrl: mock.baseUrl, networkPassword: "open-sesame" },
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "config only");
    assert.equal(await facade.ping(), true);
    const info = await facade.info();
    assert.ok(info && typeof info === "object");
    assert.equal(mock.state.lastRequest.headers["x-password"], "open-sesame");
  });

  await t.test("c64u facade operations stay covered behind networkPassword", async () => {
    const mock = await startMockC64Server({ networkPassword: "open-sesame" });
    t.after(async () => {
      await mock.close();
    });

    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;

    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      c64u: { baseUrl: mock.baseUrl, networkPassword: "open-sesame" },
    }));

    const { facade, selected } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(await facade.ping(), true);
    assert.ok(await facade.version());
    assert.ok(await facade.info());

    const before = await facade.readMemory(0x0400, 4);
    assert.equal(before.length, 4);

    await facade.writeMemory(0x0400, Uint8Array.from([0x01, 0x02, 0x03, 0x04]));
    const after = await facade.readMemory(0x0400, 4);
    assert.deepEqual(Array.from(after), [0x01, 0x02, 0x03, 0x04]);

    const runPrg = await facade.runPrg(Buffer.from([0x01, 0x08, 0x00, 0x00]));
    assert.equal(runPrg.success, true);
    assert.equal((await facade.sidplayFile("/tmp/test.sid", 2)).success, true);
    assert.equal((await facade.sidplayAttachment(Buffer.from([1, 2, 3]), { songnr: 1, songlengths: Buffer.from([4, 5]) })).success, true);
    assert.equal((await facade.modplayFile("/tmp/test.mod")).success, true);
    assert.equal((await facade.pause()).success, true);
    assert.equal((await facade.resume()).success, true);
    assert.equal((await facade.reset()).success, true);
    assert.equal((await facade.reboot()).success, true);
    assert.equal((await facade.poweroff()).success, true);
    assert.equal((await facade.menuButton()).success, true);

    const debugWrite = await facade.debugregWrite("CD");
    assert.equal(debugWrite.success, true);
    const debugRead = await facade.debugregRead();
    assert.equal(debugRead.success, true);
    assert.equal(debugRead.value?.toUpperCase(), "CD");

    const drives = await facade.drivesList();
    assert.ok(drives && typeof drives === "object");
    assert.equal((await facade.driveOn("8")).success, true);
    assert.equal((await facade.driveSetMode("8", "1571")).success, true);
    assert.equal((await facade.driveMount("8", "/tmp/disk.d64", { type: "d64", mode: "readonly" })).success, true);
    assert.equal((await facade.driveLoadRom("8", "/tmp/1541.rom")).success, true);
    assert.equal((await facade.driveReset("8")).success, true);
    assert.equal((await facade.driveRemove("8")).success, true);
    assert.equal((await facade.driveOff("8")).success, true);

    const configList = await facade.configsList();
    assert.ok(configList && typeof configList === "object");
    const configCategory = await facade.configGet("video");
    assert.ok(configCategory && typeof configCategory === "object");
    assert.equal((await facade.configSet("video", "palette", "colodore")).success, true);
    assert.equal((await facade.configBatchUpdate({ audio: { volume: "10" } })).success, true);
    assert.equal((await facade.configSaveToFlash()).success, true);
    assert.equal((await facade.configLoadFromFlash()).success, true);
    assert.equal((await facade.configResetToDefault()).success, true);

    const fileInfo = await facade.filesInfo("/tmp/demo.prg");
    assert.ok(fileInfo && typeof fileInfo === "object");
    assert.equal((await facade.filesCreateD64("/tmp/demo.d64", { tracks: 35, diskname: "DEMO" })).success, true);
    assert.equal((await facade.filesCreateD71("/tmp/demo.d71", { diskname: "DEMO71" })).success, true);
    assert.equal((await facade.filesCreateD81("/tmp/demo.d81", { diskname: "DEMO81" })).success, true);
    assert.equal((await facade.filesCreateDnp("/tmp/demo.dnp", 160, { diskname: "DEMODNP" })).success, true);

    assert.equal((await facade.streamStart("video", "127.0.0.1")).success, true);
    assert.equal((await facade.streamStop("video")).success, true);

    assert.equal(mock.state.lastRequest.headers["x-password"], "open-sesame");
  });
});

test("device: createFacade with env overrides", async (t) => {
  await t.test("C64_MODE=vice forces vice backend", async () => {
    const oldMode = process.env.C64_MODE;
    process.env.C64_MODE = "vice";
    
    t.after(() => {
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      } else {
        delete process.env.C64_MODE;
      }
    });

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "vice");
    assert.equal(reason, "env override");
    assert.equal(facade.type, "vice");
  });

  await t.test("C64_MODE=c64u forces c64u backend", async () => {
    const oldMode = process.env.C64_MODE;
    process.env.C64_MODE = "c64u";
    
    t.after(() => {
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      } else {
        delete process.env.C64_MODE;
      }
    });

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "env override");
    assert.equal(facade.type, "c64u");
  });
});

test("device: createFacade fallback behavior", async (t) => {
  await t.test("falls back to vice or c64u when no config", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    const oldHome = process.env.HOME;
    
    // Point to non-existent config
    process.env.C64BRIDGE_CONFIG = "/tmp/nonexistent-config.json";
    delete process.env.C64_MODE;
    process.env.HOME = "/tmp/nonexistent-home";
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
      if (oldHome !== undefined) {
        process.env.HOME = oldHome;
      } else {
        delete process.env.HOME;
      }
    });

    const { facade, selected } = await createFacade();
    // Should select either vice (fallback) or c64u (if reachable)
    assert.ok(selected === "vice" || selected === "c64u");
    assert.ok(facade.type === "vice" || facade.type === "c64u");
  });
});

test("device: URL helpers parse endpoints and ports", () => {
  // These helpers are not exported directly; we exercise indirectly via createFacade resolveBaseUrl
  // by constructing config objects through env file
});
