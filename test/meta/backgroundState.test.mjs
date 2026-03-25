import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpPath } from "./helpers.mjs";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

async function loadBackgroundTools(tag) {
  return import(`../../src/tools/meta/background.ts?case=${tag}`);
}

function toolByName(tools, name) {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Missing background tool ${name}`);
  }
  return tool;
}

describe("meta/background state loading", () => {
  beforeEach(() => {
    delete process.env.C64_TASK_STATE_FILE;
  });

  test("list_background_tasks loads persisted tasks from disk", async () => {
    const { file, dir } = tmpPath("background-state", "tasks.json");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({
      tasks: [
        {
          id: "0007_saved",
          name: "saved",
          type: "background",
          operation: "read",
          args: { address: "$0400", length: 2 },
          intervalMs: 25,
          maxIterations: 3,
          iterations: 2,
          status: "stopped",
          startedAt: "2025-03-08T10:00:00.000Z",
          updatedAt: "2025-03-08T10:00:10.000Z",
          stoppedAt: "2025-03-08T10:00:11.000Z",
          lastError: "offline",
          nextRunAt: "2025-03-08T10:00:20.000Z",
          folder: "tasks/background/0007_saved",
        },
      ],
    }, null, 2));

    process.env.C64_TASK_STATE_FILE = file;
    const { tools } = await loadBackgroundTools("persisted");
    const listTool = toolByName(tools, "list_background_tasks");

    const result = await listTool.execute({}, { client: {}, logger: createLogger() });

    expect(result.metadata?.success).toBe(true);
    expect(result.metadata?.count).toBe(1);
    expect(result.structuredContent?.data?.tasks?.[0]).toMatchObject({
      id: "0007_saved",
      name: "saved",
      status: "stopped",
      iterations: 2,
      folder: "tasks/background/0007_saved",
      lastError: "offline",
    });
  });

  test("ensureTasksLoaded creates an empty registry file when state is missing", async () => {
    const { file, dir } = tmpPath("background-missing", "tasks.json");
    await fs.mkdir(dir, { recursive: true });
    process.env.C64_TASK_STATE_FILE = file;

    const { tools } = await loadBackgroundTools("missing");
    const listTool = toolByName(tools, "list_background_tasks");

    const result = await listTool.execute({}, { client: {}, logger: createLogger() });

    expect(result.metadata?.success).toBe(true);
    expect(result.metadata?.count).toBe(0);
    const stored = JSON.parse(await fs.readFile(file, "utf8"));
    expect(stored).toEqual({ tasks: [] });
  });

  test("start_background_task rejects a duplicate running task loaded from disk", async () => {
    const { file, dir } = tmpPath("background-duplicate", "tasks.json");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({
      tasks: [
        {
          id: "0012_dup",
          name: "dup",
          type: "background",
          operation: "read",
          args: {},
          intervalMs: 20,
          iterations: 1,
          status: "running",
          startedAt: "2025-03-08T10:00:00.000Z",
          updatedAt: "2025-03-08T10:00:05.000Z",
          stoppedAt: null,
          lastError: null,
          nextRunAt: null,
          folder: path.join("tasks", "background", "0012_dup"),
        },
      ],
    }, null, 2));

    process.env.C64_TASK_STATE_FILE = file;
    const { tools } = await loadBackgroundTools("duplicate");
    const startTool = toolByName(tools, "start_background_task");

    const result = await startTool.execute(
      { name: "dup", operation: "read", intervalMs: 5, maxIterations: 1 },
      { client: {}, logger: createLogger() },
    );

    expect(result.isError).toBe(true);
    expect(result.metadata?.error?.kind).toBe("validation");
    expect(String(result.metadata?.error?.message ?? result.content?.[0]?.text ?? "")).toContain("already running");
  });
});
