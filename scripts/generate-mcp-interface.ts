#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  LATEST_PROTOCOL_VERSION,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { startMockC64Server } from "./mockC64Server.mjs";
import { getMcpProjectMetadata } from "../src/mcp/metadata.js";

type JsonObject = Record<string, unknown>;

interface ToolDescriptorLike {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly metadata?: {
    readonly examples?: readonly {
      readonly name?: string;
      readonly description?: string;
      readonly arguments?: Record<string, unknown>;
    }[];
  };
}

interface GenerateOptions {
  readonly outputDir?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, "mcp");

function fileExists(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveBunExecutable(): string {
  if (typeof Bun !== "undefined") {
    return process.execPath;
  }
  const candidates = [
    process.env.BUN_BIN,
    process.env.C64BRIDGE_TEST_BUN_BIN,
    process.env.C64BRIDGE_BUN_BIN,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "bun";
}

function resolveNodeExecutable(): string {
  const candidates = [
    process.env.C64BRIDGE_TEST_NODE_BIN,
    process.env.C64BRIDGE_NODE_BIN,
    process.env.NODE_BINARY,
    process.env.NODE_EXEC_PATH,
    process.env.npm_node_execpath,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return typeof Bun !== "undefined" ? "node" : process.execPath;
}

function resolveServerProcess(): { command: string; args: string[] } {
  const sourceEntrypoint = path.join(PROJECT_ROOT, "src", "mcp-server.ts");
  const distEntrypoint = path.join(PROJECT_ROOT, "dist", "mcp-server.js");

  if (typeof Bun !== "undefined" && fileExists(sourceEntrypoint)) {
    return { command: process.execPath, args: [sourceEntrypoint] };
  }

  if (fileExists(distEntrypoint)) {
    return { command: resolveNodeExecutable(), args: [distEntrypoint] };
  }

  if (fileExists(sourceEntrypoint)) {
    return { command: resolveBunExecutable(), args: [sourceEntrypoint] };
  }

  throw new Error("Unable to locate MCP server entry point (src/mcp-server.ts or dist/mcp-server.js).");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, json(value), "utf8");
}

function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildProtocolExamples(tools: readonly ToolDescriptorLike[]) {
  const selectedTool = tools.find((tool) => Array.isArray(tool.metadata?.examples) && tool.metadata.examples.length > 0)
    ?? tools[0];
  const selectedExample = selectedTool?.metadata?.examples?.[0];

  return {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    examples: {
      initialize: {
        description: "Client initialization request sent immediately after connecting to the stdio MCP server.",
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {
              resources: {},
              tools: {},
              prompts: {},
            },
            clientInfo: {
              name: "c64bridge-static-interface-generator",
              version: "1.0.0",
            },
          },
        },
      },
      "tools/list": {
        description: "Enumerates the full tool catalog and input schemas exposed by the server.",
        request: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
      },
      "tools/call": {
        description: selectedExample?.description
          ?? `Invokes the ${selectedTool?.name ?? "tool"} tool with deterministic example arguments.`,
        request: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: selectedTool?.name ?? "c64_program",
            arguments: selectedExample?.arguments ?? {},
          },
        },
      },
    },
  };
}

async function discoverMcpInterface() {
  const mockServer = await startMockC64Server();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "c64bridge-mcp-interface-"));
  const configPath = path.join(tempDir, "config.json");
  const serverProcess = resolveServerProcess();
  const mockUrl = new URL(mockServer.baseUrl);
  const configPayload = {
    c64u: {
      host: mockUrl.hostname,
      port: mockUrl.port ? Number(mockUrl.port) : 80,
    },
  };

  await writeFile(configPath, json(configPayload), "utf8");

  const transport = new StdioClientTransport({
    command: serverProcess.command,
    args: serverProcess.args,
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      C64_TEST_TARGET: "mock",
      C64BRIDGE_CONFIG: configPath,
    },
    stderr: "pipe",
  });

  const client = new Client(
    { name: "c64bridge-static-interface-generator", version: "1.0.0" },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    },
  );

  try {
    await client.connect(transport);

    const toolsList = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
    const resourcesList = await client.request({ method: "resources/list", params: {} }, ListResourcesResultSchema);
    const promptsList = await client.request({ method: "prompts/list", params: {} }, ListPromptsResultSchema);

    return {
      serverInfo: client.getServerVersion(),
      capabilities: client.getServerCapabilities(),
      toolsList,
      resourcesList,
      promptsList,
    };
  } finally {
    await client.close().catch(() => undefined);
    await mockServer.close().catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function generateMcpInterface(options: GenerateOptions = {}): Promise<void> {
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : DEFAULT_OUTPUT_DIR;
  const schemasDir = path.join(outputDir, "schemas");
  const snapshot = await discoverMcpInterface();
  const projectMetadata = getMcpProjectMetadata();

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(schemasDir, { recursive: true });

  const serverJson: JsonObject = {
    name: snapshot.serverInfo?.name ?? projectMetadata.name,
    version: snapshot.serverInfo?.version ?? projectMetadata.version,
    description: projectMetadata.description,
    transports: [...projectMetadata.transports],
    capabilities: snapshot.capabilities ?? {},
  };

  if (projectMetadata.repository) {
    serverJson.repository = projectMetadata.repository;
  }
  if (projectMetadata.license) {
    serverJson.license = projectMetadata.license;
  }

  await writeJsonFile(path.join(outputDir, "server.json"), serverJson);
  await writeJsonFile(path.join(outputDir, "tools.json"), snapshot.toolsList);
  await writeJsonFile(path.join(outputDir, "resources.json"), snapshot.resourcesList);
  await writeJsonFile(path.join(outputDir, "prompts.json"), snapshot.promptsList);
  await writeJsonFile(
    path.join(outputDir, "protocol-examples.json"),
    buildProtocolExamples((snapshot.toolsList.tools ?? []) as readonly ToolDescriptorLike[]),
  );

  for (const tool of snapshot.toolsList.tools ?? []) {
    if (tool.inputSchema === undefined) {
      continue;
    }
    await writeJsonFile(
      path.join(schemasDir, `${sanitizeFilename(tool.name)}.schema.json`),
      tool.inputSchema,
    );
  }
}

async function main(): Promise<void> {
  await generateMcpInterface();
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error("[generate-mcp-interface] Failed:", error);
    process.exitCode = 1;
  });
}
