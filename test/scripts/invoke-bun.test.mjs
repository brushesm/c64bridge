import test from "#test/runner";
import assert from "#test/assert";
import { buildBunArgs } from "../../scripts/invoke-bun.mjs";

test("invoke-bun prefixes script paths with bun run", () => {
  assert.deepEqual(
    buildBunArgs(["scripts/run-tests.ts", "--platform=c64u"]),
    ["run", "scripts/run-tests.ts", "--platform=c64u"],
  );
  assert.deepEqual(
    buildBunArgs(["src/mcp-server.ts"]),
    ["run", "src/mcp-server.ts"],
  );
});

test("invoke-bun preserves explicit bun subcommands", () => {
  assert.deepEqual(
    buildBunArgs(["test", "test/device.test.mjs"]),
    ["test", "test/device.test.mjs"],
  );
  assert.deepEqual(
    buildBunArgs(["run", "scripts/run-tests.ts"]),
    ["run", "scripts/run-tests.ts"],
  );
});
