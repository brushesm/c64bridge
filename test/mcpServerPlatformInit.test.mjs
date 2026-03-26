import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createConnectedClient } from "./helpers/mcpTestClient.mjs";
import { startMockC64Server } from "../scripts/mockC64Server.mjs";
import { startViceMockServer } from "../src/vice/mockServer.js";

const PLATFORM_RESOURCE_URI = "c64://platform/status";
const REPO_CONFIG_PATH = path.resolve(".c64bridge.json");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePlatformStatus(text) {
  const match = String(text ?? "").match(/Current platform:\s*`([^`]+)`/i);
  if (!match) {
    return null;
  }
  const platform = match[1].trim().toLowerCase();
  return platform === "c64u" || platform === "vice" ? platform : null;
}

function parseAvailableBackends(text) {
  const matches = Array.from(String(text ?? "").matchAll(/^- `([^`]+)`(?: \((active)\))?$/gm));
  return matches.map((match) => ({
    backend: match[1],
    active: match[2] === "active",
  }));
}

async function waitForDiagnosticEvent(diagDir, eventName) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const files = fs.existsSync(diagDir)
      ? fs.readdirSync(diagDir).filter((entry) => entry.endsWith(".ndjson"))
      : [];
    for (const file of files) {
      const fullPath = path.join(diagDir, file);
      const text = fs.readFileSync(fullPath, "utf8").trim();
      if (!text) {
        continue;
      }
      const records = text.split("\n").map((line) => JSON.parse(line));
      const match = records.find((record) => record.event === eventName);
      if (match) {
        return match;
      }
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for diagnostics event '${eventName}'`);
}

async function withServerConfig(config, env, fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "c64bridge-mcp-platform-"));
  const configPath = path.join(tempRoot, "c64bridge.json");
  const diagnosticsDir = path.join(tempRoot, "diagnostics");
  const homeDir = path.join(tempRoot, "home");
  const hadRepoConfig = fs.existsSync(REPO_CONFIG_PATH);
  const originalRepoConfig = hadRepoConfig ? fs.readFileSync(REPO_CONFIG_PATH, "utf8") : null;
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");

  try {
    fs.rmSync(REPO_CONFIG_PATH, { force: true });
    const connection = await createConnectedClient({
      env: {
        C64BRIDGE_CONFIG: configPath,
        C64BRIDGE_DIAGNOSTICS_DIR: diagnosticsDir,
        C64BRIDGE_ENABLE_TEST_DIAGNOSTICS: "1",
        C64_TEST_TARGET: "mock",
        C64_MODE: "",
        HOME: homeDir,
        ...env,
      },
    });

    try {
      await fn({
        client: connection.client,
        diagnosticsDir,
        stderrOutput: connection.stderrOutput,
      });
    } finally {
      await connection.close();
    }
  } finally {
    if (hadRepoConfig) {
      fs.writeFileSync(REPO_CONFIG_PATH, originalRepoConfig, "utf8");
    } else {
      fs.rmSync(REPO_CONFIG_PATH, { force: true });
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test("mcp-server initialises platform state from the active backend", async (t) => {
  await t.test("startup selects c64u and records platform_initialised", async () => {
    const mock = await startMockC64Server();
    t.after(async () => {
      await mock.close();
    });

    const mockUrl = new URL(mock.baseUrl);
    await withServerConfig(
      {
        c64u: {
          host: mockUrl.hostname,
          port: Number(mockUrl.port),
        },
      },
      {},
      async ({ client, diagnosticsDir }) => {
        const resource = await client.request(
          { method: "resources/read", params: { uri: PLATFORM_RESOURCE_URI } },
          ReadResourceResultSchema,
        );
        const text = resource.contents?.[0]?.text ?? "";

        assert.equal(parsePlatformStatus(text), "c64u");
        assert.deepEqual(parseAvailableBackends(text), [
          { backend: "c64u", active: true },
        ]);
        assert.match(text, /c64_select_backend/);

        const event = await waitForDiagnosticEvent(diagnosticsDir, "platform_initialised");
        assert.equal(event.details?.platform, "c64u");
      },
    );
  });

  await t.test("startup selects vice and records platform_initialised", async () => {
    const server = await startViceMockServer({ host: "127.0.0.1", port: 0 });
    t.after(async () => {
      await server.stop();
    });

    await withServerConfig(
      {
        vice: {
          host: "127.0.0.1",
          port: server.port,
        },
      },
      {
        VICE_TEST_TARGET: "mock",
      },
      async ({ client, diagnosticsDir }) => {
        const resource = await client.request(
          { method: "resources/read", params: { uri: PLATFORM_RESOURCE_URI } },
          ReadResourceResultSchema,
        );
        const text = resource.contents?.[0]?.text ?? "";

        assert.equal(parsePlatformStatus(text), "vice");
        assert.deepEqual(parseAvailableBackends(text), [
          { backend: "vice", active: true },
          { backend: "c64u", active: false },
        ]);
        assert.match(text, /c64_select_backend/);

        const event = await waitForDiagnosticEvent(diagnosticsDir, "platform_initialised");
        assert.equal(event.details?.platform, "vice");
      },
    );
  });

  await t.test("platform status lists all configured backends and marks the active one", async () => {
    const mock = await startMockC64Server();
    const mockUrl = new URL(mock.baseUrl);
    const vice = await startViceMockServer({ host: "127.0.0.1", port: 0 });
    t.after(async () => {
      await Promise.all([mock.close(), vice.stop()]);
    });

    await withServerConfig(
      {
        c64u: {
          host: mockUrl.hostname,
          port: Number(mockUrl.port),
        },
        vice: {
          host: "127.0.0.1",
          port: vice.port,
        },
      },
      {
        C64_MODE: "vice",
        VICE_TEST_TARGET: "mock",
      },
      async ({ client, diagnosticsDir }) => {
        const resource = await client.request(
          { method: "resources/read", params: { uri: PLATFORM_RESOURCE_URI } },
          ReadResourceResultSchema,
        );
        const text = resource.contents?.[0]?.text ?? "";

        assert.equal(parsePlatformStatus(text), "vice");
        assert.deepEqual(parseAvailableBackends(text), [
          { backend: "vice", active: true },
          { backend: "c64u", active: false },
        ]);
        assert.match(text, /c64_select_backend/);

        const event = await waitForDiagnosticEvent(diagnosticsDir, "platform_initialised");
        assert.equal(event.details?.platform, "vice");
      },
    );
  });
});
