import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createOutputTailCapture,
  installProcessDiagnostics,
  writeDiagnosticEvent,
} from "../src/diagnostics.ts";

test("installProcessDiagnostics writes an NDJSON session log", (t) => {
  const previousDir = process.env.C64BRIDGE_DIAGNOSTICS_DIR;
  const previousEnable = process.env.C64BRIDGE_ENABLE_TEST_DIAGNOSTICS;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c64bridge-diag-"));

  t.after(() => {
    if (previousDir === undefined) delete process.env.C64BRIDGE_DIAGNOSTICS_DIR;
    else process.env.C64BRIDGE_DIAGNOSTICS_DIR = previousDir;
    if (previousEnable === undefined) delete process.env.C64BRIDGE_ENABLE_TEST_DIAGNOSTICS;
    else process.env.C64BRIDGE_ENABLE_TEST_DIAGNOSTICS = previousEnable;
  });

  process.env.C64BRIDGE_DIAGNOSTICS_DIR = tempDir;
  process.env.C64BRIDGE_ENABLE_TEST_DIAGNOSTICS = "1";

  const info = installProcessDiagnostics("unit-test");
  writeDiagnosticEvent("custom_event", {
    message: "diagnostics smoke test",
    nested: { ok: true },
  });

  const records = fs.readFileSync(info.filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(records[0].event, "session_start");
  assert.equal(records.at(-1)?.event, "custom_event");
  assert.equal(records.at(-1)?.details?.nested?.ok, true);
});

test("createOutputTailCapture keeps byte counts and tails bounded", () => {
  const capture = createOutputTailCapture("vice", 12);

  capture.pushStdout("0123456789");
  capture.pushStdout("abcdef");
  capture.pushStderr("stderr-one\n");
  capture.pushStderr("stderr-two");

  const snapshot = capture.snapshot();
  assert.equal(snapshot.name, "vice");
  assert.equal(snapshot.stdoutBytes, 16);
  assert.equal(snapshot.stderrBytes, 21);
  assert.equal(snapshot.stdoutTail, "456789abcdef");
  assert.equal(snapshot.stderrTail, "e\nstderr-two");
});