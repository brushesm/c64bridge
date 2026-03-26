import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath, waitForTaskCompletion } from "./helpers.mjs";

test("background tasks persist and complete iterations", async () => {
  const { file, dir } = tmpPath("background", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ tasks: [] }, null, 2));
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const ctx = {
      client: {
        async readMemory() { return { success: true, data: "$00" }; },
      },
      logger: createLogger(),
    };

  const start = await metaModule.invoke("start_background_task", { name: "t1", operation: "read", arguments: { address: "$0400", length: 1 }, intervalMs: 5, maxIterations: 2 }, ctx);
    assert.equal(start.metadata?.success, true);

    const t1 = await waitForTaskCompletion(metaModule, "t1", ctx);
    assert.ok(t1, "background task t1 should be present after completion window");
    assert.ok(t1.status === "completed" || t1.status === "stopped", `unexpected status ${String(t1.status)}`);

    const stopped = await metaModule.invoke("stop_background_task", { name: "t1" }, ctx);
    assert.equal(stopped.metadata?.success, true);

    const data = JSON.parse(await fs.readFile(file, "utf8"));
    assert.ok(Array.isArray(data.tasks));
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("background tasks handle unknown operation and stop all", async () => {
  const { file, dir } = tmpPath("background2", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const ctx = { client: {}, logger: createLogger() };

    let res = await metaModule.invoke("start_background_task", { name: "noop", operation: "unknown_op", intervalMs: 5, maxIterations: 1 }, ctx);
    assert.equal(res.metadata?.success, true);
    await waitForTaskCompletion(metaModule, "noop", ctx);
    res = await metaModule.invoke("stop_all_background_tasks", {}, ctx);
    assert.equal(res.metadata?.success, true);
    const list = await metaModule.invoke("list_background_tasks", {}, ctx);
    assert.equal(list.metadata?.success, true);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("background tasks support write/read_screen/menu_button and stop missing task idempotently", async () => {
  const { file, dir } = tmpPath("background3", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const calls = [];
    const ctx = {
      client: {
        async writeMemory(address, bytes) {
          calls.push(["write", address, bytes]);
          return { success: true };
        },
        async readScreen() {
          calls.push(["screen"]);
          return "READY.";
        },
        async menuButton() {
          calls.push(["menu"]);
          return { success: true };
        },
      },
      logger: createLogger(),
    };

    const writeTask = await metaModule.invoke("start_background_task", {
      name: "writer",
      operation: "write_memory",
      arguments: { address: "$0400", bytes: "$41" },
      intervalMs: 5,
      maxIterations: 1,
    }, ctx);
    const screenTask = await metaModule.invoke("start_background_task", {
      name: "screen",
      operation: "read_screen",
      intervalMs: 5,
      maxIterations: 1,
    }, ctx);
    const menuTask = await metaModule.invoke("start_background_task", {
      name: "menu",
      operation: "menu_button",
      intervalMs: 5,
      maxIterations: 1,
    }, ctx);

    assert.equal(writeTask.metadata?.success, true);
    assert.equal(screenTask.metadata?.success, true);
    assert.equal(menuTask.metadata?.success, true);

    await waitForTaskCompletion(metaModule, "writer", ctx);
    await waitForTaskCompletion(metaModule, "screen", ctx);
    await waitForTaskCompletion(metaModule, "menu", ctx);

    const stopMissing = await metaModule.invoke("stop_background_task", { name: "missing" }, ctx);
    assert.equal(stopMissing.metadata?.success, true);
    assert.equal(stopMissing.structuredContent?.data?.notFound, true);
    assert.ok(calls.some((entry) => entry[0] === "write"));
    assert.ok(calls.some((entry) => entry[0] === "screen"));
    assert.ok(calls.some((entry) => entry[0] === "menu"));
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("background tasks persist task errors and reuse ids when restarted", async () => {
  const { file, dir } = tmpPath("background4", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    let readCalls = 0;
    const ctx = {
      client: {
        async readMemory() {
          readCalls += 1;
          if (readCalls === 1) {
            throw new Error("simulated read failure");
          }
          return { success: true, data: "$00" };
        },
      },
      logger: createLogger(),
    };

    const first = await metaModule.invoke("start_background_task", {
      name: "flaky",
      operation: "read",
      intervalMs: 5,
      maxIterations: 1,
    }, ctx);
    assert.equal(first.metadata?.success, true);
    const firstTask = await waitForTaskCompletion(metaModule, "flaky", ctx);
    assert.equal(firstTask?.status, "error");
    assert.ok(String(firstTask?.lastError ?? "").includes("simulated read failure"));

    const second = await metaModule.invoke("start_background_task", {
      name: "flaky",
      operation: "read",
      intervalMs: 5,
      maxIterations: 1,
    }, ctx);
    assert.equal(second.metadata?.success, true);
    assert.equal(second.structuredContent?.data?.task?.id, firstTask?.id);
    const secondTask = await waitForTaskCompletion(metaModule, "flaky", ctx);
    assert.ok(secondTask?.status === "completed" || secondTask?.status === "stopped");
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("background tasks stop active timers and support write_memory alias defaults", async () => {
  const { file, dir } = tmpPath("background5", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const calls = [];
    const ctx = {
      client: {
        async writeMemory(address, bytes) {
          calls.push([address, bytes]);
          return { success: true };
        },
      },
      logger: createLogger(),
    };

    const started = await metaModule.invoke("start_background_task", {
      name: "alias-writer",
      operation: "write_memory",
      intervalMs: 100,
      maxIterations: 5,
    }, ctx);
    assert.equal(started.metadata?.success, true);

    const stopped = await metaModule.invoke("stop_background_task", { name: "alias-writer" }, ctx);
    assert.equal(stopped.metadata?.success, true);
    assert.equal(stopped.structuredContent?.data?.status, "stopped");

    const list = await metaModule.invoke("list_background_tasks", {}, ctx);
    const task = list.structuredContent?.data?.tasks?.find((entry) => entry.name === "alias-writer");
    assert.equal(task?.status, "stopped");

    const logPath = `${dir}/tasks/background/${task.id}/log.txt`;
    const logText = await fs.readFile(logPath, "utf8");
    assert.ok(logText.includes("started"));
    assert.ok(logText.includes("stopped"));
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("background tasks run write_memory alias with default address and bytes", async () => {
  const { file, dir } = tmpPath("background6", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const calls = [];
    const ctx = {
      client: {
        async writeMemory(address, bytes) {
          calls.push([address, bytes]);
          return { success: true };
        },
      },
      logger: createLogger(),
    };

    const started = await metaModule.invoke("start_background_task", {
      name: "writer-defaults",
      operation: "write_memory",
      intervalMs: 5,
      maxIterations: 1,
    }, ctx);
    assert.equal(started.metadata?.success, true);

    const task = await waitForTaskCompletion(metaModule, "writer-defaults", ctx);
    assert.equal(task?.status, "completed");
    assert.deepEqual(calls, [["$0400", "$00"]]);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});
