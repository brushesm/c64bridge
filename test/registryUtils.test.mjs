import test from "#test/runner";
import assert from "#test/assert";
import {
  buildDescriptorIndex,
  ensureDescriptor,
  extendSchemaWithOp,
  createOperationHandlers,
  invokeModuleTool,
} from "../src/tools/registry/utils.ts";

function createCtx() {
  return {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: { id: "c64u", features: [], limitedFeatures: [] },
    setPlatform(target) {
      return { id: target, features: [], limitedFeatures: [] };
    },
  };
}

test("buildDescriptorIndex and ensureDescriptor resolve module tools", () => {
  const module = {
    describeTools() {
      return [
        { name: "alpha", description: "Alpha", metadata: { domain: "test", summary: "Alpha", lifecycle: "request-response", resources: [], prompts: [], tags: [] } },
        { name: "beta", description: "Beta", metadata: { domain: "test", summary: "Beta", lifecycle: "request-response", resources: [], prompts: [], tags: [] } },
      ];
    },
    invoke() {
      throw new Error("not used");
    },
  };

  const index = buildDescriptorIndex(module);
  assert.equal(index.size, 2);
  assert.equal(ensureDescriptor(index, "beta").description, "Beta");
  assert.throws(() => ensureDescriptor(index, "missing"), /Unable to locate descriptor/);
});

test("extendSchemaWithOp augments object schemas with op and extra properties", () => {
  const schema = extendSchemaWithOp(
    "capture",
    {
      type: "object",
      description: "base",
      properties: { count: { type: "integer" } },
      required: ["count"],
      additionalProperties: false,
    },
    {
      description: "extended",
      extraProperties: { verify: { type: "boolean" } },
    },
  );

  assert.equal(schema.description, "extended");
  assert.equal(schema.properties.op.const, "capture");
  assert.equal(schema.properties.verify.type, "boolean");
  assert.deepEqual(schema.required, ["count", "op"]);
});

test("extendSchemaWithOp wraps non-object schemas in payload objects", () => {
  const schema = extendSchemaWithOp("encode", { type: "string", description: "raw string" });

  assert.equal(schema.type, "object");
  assert.equal(schema.properties.op.const, "encode");
  assert.deepEqual(schema.required, ["op", "payload"]);
  assert.equal(schema.properties.payload.type, "string");
});

test("createOperationHandlers returns callable handler map", async () => {
  const calls = [];
  const handlers = createOperationHandlers([
    {
      op: "read",
      schema: { type: "object" },
      handler: async (args) => {
        calls.push(args.op);
        return { content: [{ type: "text", text: "read" }] };
      },
    },
    {
      op: "write",
      schema: { type: "object" },
      handler: async (args) => {
        calls.push(args.op);
        return { content: [{ type: "text", text: "write" }] };
      },
    },
  ]);

  const read = await handlers.read({ op: "read" }, createCtx());
  const write = await handlers.write({ op: "write" }, createCtx());

  assert.equal(read.content[0].text, "read");
  assert.equal(write.content[0].text, "write");
  assert.deepEqual(calls, ["read", "write"]);
});

test("invokeModuleTool strips op before delegating to module.invoke", async () => {
  const calls = [];
  const module = {
    describeTools() {
      return [];
    },
    async invoke(toolName, args) {
      calls.push({ toolName, args });
      return { content: [{ type: "text", text: "ok" }] };
    },
  };

  const result = await invokeModuleTool(
    module,
    "demo_tool",
    { op: "read", address: 1024, length: 16 },
    createCtx(),
  );

  assert.equal(result.content[0].text, "ok");
  assert.deepEqual(calls, [{ toolName: "demo_tool", args: { address: 1024, length: 16 } }]);
});