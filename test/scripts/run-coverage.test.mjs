import test from "#test/runner";
import assert from "#test/assert";
import { buildCoverageBatches, chunkFiles, resolveCoverageShardSize } from "../../scripts/run-coverage.mjs";

test("run-coverage shards the broad suite and preserves targeted supplements", () => {
  const testFiles = [
    "test/a.test.mjs",
    "test/b.test.mjs",
    "test/c.test.mjs",
    "test/d.test.mjs",
    "test/e.test.mjs",
  ];
  const extraTests = ["test/supplemental.test.mjs"];

  const batches = buildCoverageBatches(testFiles, extraTests, {
    C64BRIDGE_COVERAGE_SHARD_SIZE: "2",
  });

  assert.deepEqual(batches, [
    { label: "all-01", files: ["test/a.test.mjs", "test/b.test.mjs"] },
    { label: "all-02", files: ["test/c.test.mjs", "test/d.test.mjs"] },
    { label: "all-03", files: ["test/e.test.mjs"] },
    { label: "supplemental.test", files: ["test/supplemental.test.mjs"] },
  ]);
});

test("run-coverage keeps a single all batch when shard size covers the suite", () => {
  const batches = buildCoverageBatches(
    ["test/a.test.mjs", "test/b.test.mjs"],
    ["test/supplemental.test.mjs"],
    { C64BRIDGE_COVERAGE_SHARD_SIZE: "5" },
  );

  assert.deepEqual(batches, [
    { label: "all", files: ["test/a.test.mjs", "test/b.test.mjs"] },
    { label: "supplemental.test", files: ["test/supplemental.test.mjs"] },
  ]);
});

test("run-coverage resolves shard size defaults and chunks files safely", () => {
  assert.equal(resolveCoverageShardSize(undefined), 12);
  assert.equal(resolveCoverageShardSize("0"), 12);
  assert.equal(resolveCoverageShardSize("7"), 7);

  assert.deepEqual(chunkFiles([], 3), [[]]);
  assert.deepEqual(chunkFiles(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
});