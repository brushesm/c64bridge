import test from "#test/runner";
import assert from "#test/assert";
import { ViceClient } from "../src/vice/viceClient.js";

test("ViceClient normalizes string and typed-array data chunks", () => {
  const client = new ViceClient();

  client.onData?.("AB");
  client.onData?.(new Uint8Array([0x43, 0x44]));

  assert.equal(client.buffer.toString("ascii"), "ABCD");
});