import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { Buffer } from "node:buffer";
import { audioModule } from "../src/tools/audio.js";
import { recordAndAnalyzeAudio } from "../src/audio/record_and_analyze_audio.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function installAudioRuntimeMocks({
  fixedFreq = 440,
  rms = 0.2,
  includeQuit = true,
  startThrows = false,
} = {}) {
  const instances = [];

  class FakeAudioIO {
    constructor() {
      this.handlers = {};
      instances.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    start() {
      if (startThrows) {
        throw new Error("synthetic start failure");
      }

      const samples = 4096;
      const pcm = Buffer.alloc(samples * 2);
      for (let i = 0; i < samples; i += 1) {
        const value = Math.round(Math.sin((2 * Math.PI * fixedFreq * i) / 44100) * 16000);
        pcm.writeInt16LE(value, i * 2);
      }
      this.handlers.data?.(pcm);
    }

    stop() {
      this.stopCalled = true;
    }
  }

  if (includeQuit) {
    FakeAudioIO.prototype.quit = function quit() {
      this.quitCalled = true;
    };
  }

  mock.module("naudiodon", () => ({
    AudioIO: FakeAudioIO,
    SampleFormat16Bit: 16,
  }));
  mock.module("pitchfinder", () => ({
    default: {
      YIN: () => () => fixedFreq,
    },
  }));
  mock.module("meyda", () => ({
    default: {
      extract: () => ({ rms }),
    },
  }));

  return { instances };
}

afterEach(() => {
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

describe("audio runtime integration", () => {
  test("recordAndAnalyzeAudio surfaces missing audio backend dependencies", async () => {
    await expect(recordAndAnalyzeAudio({ durationSeconds: 0.5 })).rejects.toThrow("Audio backend not available");
  });

  test("recordAndAnalyzeAudio surfaces missing pitch detection dependencies", async () => {
    class FakeAudioIO {
      constructor() {
        this.handlers = {};
      }

      on(event, handler) {
        this.handlers[event] = handler;
      }

      start() {
        this.handlers.data?.(Buffer.alloc(2048));
      }

      quit() {}
    }

    mock.module("naudiodon", () => ({
      AudioIO: FakeAudioIO,
      SampleFormat16Bit: 16,
    }));
    mock.module("pitchfinder", () => {
      throw new Error("missing");
    });

    await expect(recordAndAnalyzeAudio({ durationSeconds: 0.5 })).rejects.toThrow("Missing dependency: pitchfinder");
  });

  test("recordAndAnalyzeAudio captures PCM and analyzes note content", async () => {
    installAudioRuntimeMocks({ fixedFreq: 440, rms: 0.18 });

    const result = await recordAndAnalyzeAudio({
      durationSeconds: 0.5,
      expectedSidwave: {
        voices: [
          {
            patterns: {
              main: {
                notes: ["A4"],
              },
            },
          },
        ],
      },
    });

    expect(result.analysis.durationSeconds).toBeGreaterThan(0.05);
    expect(result.analysis.voices[0]?.detected_notes.some((entry) => entry.note === "A4")).toBe(true);
    expect(result.analysis.global_metrics.average_rms).toBeGreaterThan(0);
    expect(result.analysis.global_metrics.max_rms).toBeGreaterThan(0);
  });

  test("recordAndAnalyzeAudio falls back to stop() when quit() is unavailable", async () => {
    const { instances } = installAudioRuntimeMocks({ includeQuit: false, fixedFreq: 523.25, rms: Number.NaN });

    const result = await recordAndAnalyzeAudio({ durationSeconds: 0.5 });

    expect(result.analysis.voices[0]?.detected_notes.length).toBeGreaterThan(0);
    expect(instances[0]?.stopCalled).toBe(true);
    expect(instances[0]?.quitCalled).toBeUndefined();
  });

  test("recordAndAnalyzeAudio falls back to manual RMS and tolerates invalid expected SIDWAVE", async () => {
    const instances = [];
    class FakeAudioIO {
      constructor() {
        this.handlers = {};
        instances.push(this);
      }

      on(event, handler) {
        this.handlers[event] = handler;
      }

      start() {
        const samples = 4096;
        const pcm = Buffer.alloc(samples * 2);
        for (let i = 0; i < samples; i += 1) {
          const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / 44100) * 12000);
          pcm.writeInt16LE(value, i * 2);
        }
        this.handlers.data?.(pcm);
      }

      quit() {
        this.quitCalled = true;
      }
    }

    mock.module("naudiodon", () => ({
      AudioIO: FakeAudioIO,
      SampleFormat16Bit: 16,
    }));
    mock.module("pitchfinder", () => ({
      default: {
        YIN: () => () => 440,
      },
    }));

    const result = await recordAndAnalyzeAudio({
      durationSeconds: 0.5,
      expectedSidwave: "{not valid yaml",
    });

    expect(result.analysis.global_metrics.average_rms).toBeGreaterThan(0);
    expect(result.analysis.voices[0]?.detected_notes.some((entry) => entry.note === "A4")).toBe(true);
    expect(instances[0]?.quitCalled).toBe(true);
  });

  test("recordAndAnalyzeAudio marks quiet captures as uncertain notes", async () => {
    installAudioRuntimeMocks({ fixedFreq: 440, rms: 0.001 });

    const result = await recordAndAnalyzeAudio({
      durationSeconds: 0.5,
      expectedSidwave: {
        voices: [
          {
            patterns: {
              main: {
                notes: ["BAD", "C4"],
              },
            },
          },
        ],
      },
    });

    expect(result.analysis.voices[0]?.detected_notes.every((entry) => entry.note === null)).toBe(true);
    expect(result.analysis.voices[0]?.detected_notes.every((entry) => entry.uncertain === true)).toBe(true);
  });

  test("recordAndAnalyzeAudio surfaces input startup failures", async () => {
    installAudioRuntimeMocks({ startThrows: true });

    await expect(recordAndAnalyzeAudio({ durationSeconds: 0.5 })).rejects.toThrow("synthetic start failure");
  });

  test("audioModule analyze_audio and record_and_analyze_audio succeed with the mocked runtime", async () => {
    installAudioRuntimeMocks({ fixedFreq: 440, rms: 0.15 });
    const ctx = { client: {}, logger: createLogger() };

    const recorded = await audioModule.invoke(
      "record_and_analyze_audio",
      { durationSeconds: 0.5, expectedSidwave: { voices: [{ patterns: { main: { notes: ["A4"] } } }] } },
      ctx,
    );
    expect(recorded.isError).toBeUndefined();
    expect(recorded.metadata?.success).toBe(true);
    expect(recorded.metadata?.voices?.length).toBe(3);

    const analyzed = await audioModule.invoke(
      "analyze_audio",
      { request: "does the music sound right?", durationSeconds: 0.5, expectedSidwave: { voices: [{ patterns: { main: { notes: ["A4"] } } }] } },
      ctx,
    );

    expect(analyzed.isError).toBeUndefined();
    expect(analyzed.metadata?.analyzed).toBe(true);
    expect(String(analyzed.content?.[0]?.text ?? "")).toContain("Voice 1:");
    expect(String(analyzed.content?.[0]?.text ?? "")).toContain("sounds accurate");
  });
});
