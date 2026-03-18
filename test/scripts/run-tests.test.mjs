import test from "#test/runner";
import assert from "#test/assert";
import { parseRunTestsArgs, shouldUseNodeFallback } from "../../scripts/run-tests.ts";

test("run-tests parses CLI args for matrix selection and passthrough", () => {
  const parsed = parseRunTestsArgs([
    "--platform=vice",
    "--target",
    "device",
    "--base-url=http://example.test",
    "--coverage",
    "test/logger.test.mjs",
    "--timeout",
    "5000",
  ]);

  assert.deepEqual(parsed, {
    target: "device",
    platform: "vice",
    explicitBaseUrl: "http://example.test",
    runCoverage: true,
    passthrough: ["test/logger.test.mjs", "--timeout", "5000"],
  });
});

test("run-tests prefers Node for broad default Bun suites", () => {
  assert.equal(shouldUseNodeFallback(false, []), true);
});

test("run-tests keeps Bun for coverage and small targeted slices", () => {
  assert.equal(shouldUseNodeFallback(true, []), false);
  assert.equal(shouldUseNodeFallback(false, ["test/logger.test.mjs"]), false);
  assert.equal(shouldUseNodeFallback(false, ["test/logger.test.mjs", "test/petscii.test.mjs", "--timeout", "5000"]), false);
});

test("run-tests prefers Node when explicit Bun file set is too large unless overridden", () => {
  const manyFiles = [
    "test/a.test.mjs",
    "test/b.test.mjs",
    "test/c.test.mjs",
    "test/d.test.mjs",
    "test/e.test.mjs",
  ];

  assert.equal(shouldUseNodeFallback(false, manyFiles), true);
  assert.equal(shouldUseNodeFallback(false, manyFiles, { C64BRIDGE_TEST_RUNNER: "bun" }), false);
  assert.equal(shouldUseNodeFallback(false, manyFiles, { C64BRIDGE_BUN_FILE_LIMIT: "8" }), false);
  assert.equal(shouldUseNodeFallback(false, manyFiles, { C64BRIDGE_TEST_RUNNER: "node" }), true);
});