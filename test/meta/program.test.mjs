import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath } from "./helpers.mjs";

test("cross_platform_greeting switches backends, captures screenshots, and restores the starting backend", async () => {
  const switches = [];
  const renders = [];
  let activeBackend = "vice";
  const { dir } = tmpPath("program", "cross-platform-greeting");
  await fs.rm(dir, { recursive: true, force: true });

  const ctx = {
    client: {
      getAvailableBackends() {
        return ["vice", "c64u"];
      },
      async getActiveBackendType() {
        return activeBackend;
      },
      switchBackend(backend) {
        switches.push(backend);
        activeBackend = backend;
      },
      async renderGreetingScreen({ message }) {
        renders.push({ backend: activeBackend, message });
        return { success: true };
      },
      async readScreen() {
        return activeBackend === "vice"
          ? "READY.\nHAVE A GREAT DAY, VICE!"
          : "READY.\nHAVE A GREAT DAY, C64U!";
      },
      async captureFrames() {
        return {
          backend: activeBackend,
          frames: [
            {
              frameNumber: null,
              width: 2,
              height: 2,
              bitsPerPixel: 4,
              pixels: Uint8Array.from([0, 1, 2, 3]),
              complete: true,
            },
          ],
        };
      },
    },
    logger: createLogger(),
    setPlatform(target) {
      activeBackend = target;
      return { id: target, features: [], limitedFeatures: [] };
    },
  };

  const res = await metaModule.invoke("cross_platform_greeting", {
    outputPath: dir,
    timeoutMs: 100,
    pollIntervalMs: 50,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.deepEqual(data.requestedBackends, ["vice", "c64u"]);
  assert.equal(data.results.length, 2);
  assert.equal(data.results.every((entry) => entry.success === true), true);
  assert.equal(renders.length, 2);
  assert.equal(renders[0].backend, "vice");
  assert.equal(renders[1].backend, "c64u");
  assert.equal(data.results.every((entry) => entry.executionMode === "direct_screen_write"), true);
  assert.equal(switches.join(","), "vice,c64u,vice");
  assert.equal(activeBackend, "vice");
  await fs.stat(data.results[0].screenshotPath);
  await fs.stat(data.results[1].screenshotPath);
  await fs.stat(data.reportPath);
});

test("cross_platform_greeting uses the visible VICE fast path by default for a single backend", async () => {
  const originalVisible = process.env.VICE_VISIBLE;
  process.env.VICE_VISIBLE = "true";

  let activeBackend = "vice";
  let screenReads = 0;
  let captures = 0;

  try {
    const ctx = {
      client: {
        getAvailableBackends() {
          return ["vice"];
        },
        async getActiveBackendType() {
          return activeBackend;
        },
        switchBackend(backend) {
          activeBackend = backend;
        },
        async renderGreetingScreen() {
          return { success: true };
        },
        async readScreen() {
          screenReads += 1;
          return "READY.\nHELLO VICE";
        },
        async captureFrames() {
          captures += 1;
          return { backend: activeBackend, frames: [] };
        },
      },
      logger: createLogger(),
      platform: { id: "vice", features: [], limitedFeatures: [] },
      rag: {},
      setPlatform(target) {
        return { id: target, features: [], limitedFeatures: [] };
      },
    };

    const res = await metaModule.invoke("cross_platform_greeting", {
      platforms: ["vice"],
      messageTemplate: "HELLO VICE",
    }, ctx);

    assert.equal(res.isError, undefined);
    assert.equal(screenReads, 0);
    assert.equal(captures, 0);
    assert.equal(res.structuredContent?.data?.fastPath, "visible_vice_no_probe");
  } finally {
    if (originalVisible === undefined) {
      delete process.env.VICE_VISIBLE;
    } else {
      process.env.VICE_VISIBLE = originalVisible;
    }
  }
});

test("cross_platform_greeting falls back to BASIC upload when direct greeting rendering is unavailable", async () => {
  const runs = [];
  let activeBackend = "vice";

  const ctx = {
    client: {
      getAvailableBackends() {
        return ["vice"];
      },
      async getActiveBackendType() {
        return activeBackend;
      },
      switchBackend(backend) {
        activeBackend = backend;
      },
      async uploadAndRunBasic(program) {
        runs.push(program);
        return { success: true };
      },
      async readScreen() {
        return "READY.\nHAVE A GREAT DAY, VICE!";
      },
    },
    logger: createLogger(),
    setPlatform(target) {
      activeBackend = target;
      return { id: target, features: [], limitedFeatures: [] };
    },
  };

  const res = await metaModule.invoke("cross_platform_greeting", {
    platforms: ["vice"],
    verify: true,
    captureScreenshot: false,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  assert.equal(runs.length, 1);
  assert.equal(res.structuredContent?.data?.results?.[0]?.executionMode, "basic_program");
});

test("program_shuffle discovers and runs programs", async () => {
  let resetCount = 0;
  let runPrgCount = 0;
  const ctx = {
    client: {
      async filesInfo(pattern) {
        if (pattern.includes("prg")) return ["/games/demo1.prg", "/games/demo2.prg"];
        return [];
      },
      async runPrgFile() { runPrgCount += 1; return { success: true }; },
      async readScreen() { return "TEST SCREEN"; },
      async reset() { resetCount += 1; return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("program_shuffle", { root: "/games", durationMs: 5, maxPrograms: 2, captureScreen: true, resetDelayMs: 0 }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.programs, 2);
  assert.equal(runPrgCount, 2);
  assert.equal(resetCount, 2);
  assert.ok(data.logPath);
});

test("program_shuffle handles no programs found", async () => {
  const ctx = {
    client: {
      async filesInfo() { return []; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("program_shuffle", { root: "/empty", durationMs: 5, resetDelayMs: 0 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("program_shuffle handles program run errors gracefully", async () => {
  const ctx = {
    client: {
      async filesInfo() { return ["/games/broken.prg"]; },
      async runPrgFile() { throw new Error("run failed"); },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("program_shuffle", { root: "/games", extensions: ["prg"], durationMs: 5, captureScreen: false, resetDelayMs: 0 }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.errors, 1);
});

test("program_shuffle with CRT files", async () => {
  const ctx = {
    client: {
      async filesInfo(pattern) {
        if (pattern.includes("crt")) return ["/games/demo.crt"];
        return [];
      },
      async runCrtFile() { return { success: true }; },
      async readScreen() { return "CRT SCREEN"; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("program_shuffle", { root: "/games", extensions: ["crt"], durationMs: 5, maxPrograms: 1, resetDelayMs: 0 }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.programs, 1);
});

test("program_shuffle uses default discovery settings, caps results, and accepts info.paths payloads", async () => {
  const seenPatterns = [];
  const outputPath = "test/tmp/meta/program-shuffle-defaults";
  let resets = 0;
  const ctx = {
    client: {
      async filesInfo(pattern) {
        seenPatterns.push(pattern);
        if (pattern.endsWith(".prg")) {
          return { paths: ["/games/one.prg", "/games/two.prg"] };
        }
        throw new Error("crt discovery offline");
      },
      async runPrgFile() { return { success: true }; },
      async reset() { resets += 1; throw new Error("reset failed"); },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("program_shuffle", {
    maxPrograms: 1,
    captureScreen: false,
    durationMs: 1,
    outputPath,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.programs, 1);
  assert.equal(data.errors, 0);
  assert.equal(data.outputPath.endsWith("program-shuffle-defaults"), true);
  assert.equal(resets, 1);
  assert.equal(seenPatterns.length, 2);
  assert.equal(seenPatterns.some((pattern) => pattern.endsWith(".prg")), true);
  assert.equal(seenPatterns.some((pattern) => pattern.endsWith(".crt")), true);
});

test("batch_run_with_assertions runs programs with assertions", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readScreen() { return "READY."; },
      async readMemory() { return { success: true, data: "$FF" }; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    durationMs: 5,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.total, 1);
  assert.equal(data.summary?.passed, 1);
});

test("batch_run_with_assertions detects assertion failures", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readScreen() { return "DIFFERENT TEXT"; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    durationMs: 5,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.failed, 1);
});

test("batch_run_with_assertions validates memory_equals assertion", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readMemory(addr) {
        if (addr === "$0400") return { success: true, data: "$AA" };
        return { success: true, data: "$00" };
      },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "memory_equals", address: "$0400", expected: "$AA" }] },
    ],
    durationMs: 5,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.passed, 1);
});

test("batch_run_with_assertions checks sid_silent assertion", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readMemory(addr) {
        if (addr === "$D404") return { success: true, data: "$00" };
        return { success: true, data: "$00" };
      },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "sid_silent" }] },
    ],
    durationMs: 5,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.passed, 1);
});

test("batch_run_with_assertions stops after the first failing CRT program and ignores reset failures", async () => {
  let crtRuns = 0;
  let prgRuns = 0;
  const readCalls = [];
  const ctx = {
    client: {
      async runCrtFile() {
        crtRuns += 1;
        return { success: true };
      },
      async runPrgFile() {
        prgRuns += 1;
        return { success: true };
      },
      async readScreen() { return "READY."; },
      async readMemory(addr) {
        readCalls.push(addr);
        if (addr === "$D404") return { success: true, data: "$01" };
        return { success: true, data: "$01" };
      },
      async reset() { throw new Error("reset failed"); },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      {
        path: "/demo.crt",
        assertions: [
          { type: "screen_contains", pattern: "READY." },
          { type: "memory_equals" },
          { type: "sid_silent" },
        ],
      },
      { path: "/skipped.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    durationMs: 1,
    outputPath: "test/tmp/meta/program-batch-stop",
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.total, 1);
  assert.equal(data.summary?.failed, 1);
  assert.equal(crtRuns, 1);
  assert.equal(prgRuns, 0);
  assert.equal(readCalls.includes("$0400"), true);
  assert.equal(readCalls.includes("$D404"), true);
});

test("batch_run_with_assertions records non-Error execution failures as task errors", async () => {
  const ctx = {
    client: {
      async runPrgFile() { throw "boom"; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [{ path: "/broken.prg" }],
    continueOnError: true,
    durationMs: 1,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.errors, 1);
});

test("batch_run_with_assertions continues on error when flag set", async () => {
  let runCount = 0;
  const ctx = {
    client: {
      async runPrgFile() {
        runCount += 1;
        if (runCount === 1) throw new Error("first failed");
        return { success: true };
      },
      async readScreen() { return "READY."; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test1.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
      { path: "/test2.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    continueOnError: true,
    durationMs: 5,
    resetDelayMs: 0,
  }, ctx);

  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.total, 2);
  assert.equal(data.summary?.errors, 1);
});
