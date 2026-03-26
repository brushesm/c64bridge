import test from "#test/runner";
import assert from "#test/assert";
import { toolRegistry } from "../src/tools/registry/index.js";

function createStubLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function createSwitchClient(availableBackends = ["c64u", "vice"], activeBackend = "c64u") {
  let active = activeBackend;
  const switches = [];
  return {
    switches,
    getAvailableBackends() {
      return [...availableBackends];
    },
    switchBackend(target) {
      if (!availableBackends.includes(target)) {
        throw new Error(`Backend '${target}' is not configured`);
      }
      switches.push(target);
      active = target;
    },
    async getActiveBackendType() {
      return active;
    },
  };
}

function createCtx(client, setPlatformCalls, platform = "c64u") {
  return {
    client,
    rag: {},
    logger: createStubLogger(),
    platform: { id: platform, features: [], limitedFeatures: [] },
    setPlatform(target) {
      setPlatformCalls.push(target);
      return { id: target, features: [], limitedFeatures: [] };
    },
  };
}

test("c64_select_backend switches to an available backend and updates platform state", async () => {
  const client = createSwitchClient(["c64u", "vice"], "c64u");
  const setPlatformCalls = [];

  const result = await toolRegistry.invoke(
    "c64_select_backend",
    { op: "select", backend: "vice" },
    createCtx(client, setPlatformCalls),
  );

  assert.equal(result.isError, undefined);
  assert.deepEqual(client.switches, ["vice"]);
  assert.deepEqual(setPlatformCalls, ["vice"]);
  assert.equal(result.structuredContent?.data?.activeBackend, "vice");
  assert.ok(result.structuredContent?.data?.availableTools.includes("c64_select_backend"));
  assert.ok(result.structuredContent?.data?.unavailableTools.includes("c64_printer"));
});

test("c64_select_backend returns an error result when the backend is unavailable", async () => {
  const client = createSwitchClient(["c64u"], "c64u");
  const setPlatformCalls = [];

  const result = await toolRegistry.invoke(
    "c64_select_backend",
    { op: "select", backend: "vice" },
    createCtx(client, setPlatformCalls),
  );

  assert.equal(result.isError, true);
  assert.deepEqual(client.switches, []);
  assert.deepEqual(setPlatformCalls, []);
  assert.deepEqual(result.structuredContent?.data?.configuredBackends, ["c64u"]);
  assert.match(result.structuredContent?.data?.message ?? "", /not configured/);
});

test("c64_select_backend supports round-trip backend switching", async () => {
  const client = createSwitchClient(["c64u", "vice"], "c64u");
  const setPlatformCalls = [];
  const ctx = createCtx(client, setPlatformCalls);

  const toVice = await toolRegistry.invoke(
    "c64_select_backend",
    { op: "select", backend: "vice" },
    ctx,
  );
  const toC64u = await toolRegistry.invoke(
    "c64_select_backend",
    { op: "select", backend: "c64u" },
    ctx,
  );

  assert.equal(toVice.isError, undefined);
  assert.equal(toC64u.isError, undefined);
  assert.deepEqual(client.switches, ["vice", "c64u"]);
  assert.deepEqual(setPlatformCalls, ["vice", "c64u"]);
  assert.equal(toC64u.structuredContent?.data?.activeBackend, "c64u");
  assert.ok(toC64u.structuredContent?.data?.usageHint.includes('"vice"'));
});
