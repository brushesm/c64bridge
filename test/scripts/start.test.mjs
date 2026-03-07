import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "#test/runner";
import assert from "#test/assert";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const sourceStartScript = path.join(repoRoot, "scripts", "start.mjs");

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c64bridge-start-"));
  return { dir };
}

function writeFile(filePath, content, mode) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  if (mode !== undefined) {
    fs.chmodSync(filePath, mode);
  }
}

function withTempEnv(pairs) {
  const previous = new Map();
  for (const [key, value] of Object.entries(pairs)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

async function importFixtureStart(fixtureDir) {
  const restoreEnv = withTempEnv({
    C64BRIDGE_START_SKIP_AUTO_LAUNCH: "1",
    C64BRIDGE_PROJECT_ROOT: fixtureDir,
  });
  try {
    const href = `${pathToFileURL(sourceStartScript).href}?t=${Date.now()}-${Math.random()}`;
    return await import(href);
  } finally {
    restoreEnv();
  }
}

test("start script imports src entry directly when running under Bun", async (t) => {
  const fixture = createFixture();
  const markerKey = `__startFixtureSrc_${Date.now()}`;
  writeFile(
    path.join(fixture.dir, "src", "index.ts"),
    `globalThis.${markerKey} = "src";\n`,
  );

  t.after(() => {
    fs.rmSync(fixture.dir, { recursive: true, force: true });
    delete globalThis[markerKey];
  });

  const startModule = await importFixtureStart(fixture.dir);
  const restoreEnv = withTempEnv({
    C64BRIDGE_PROJECT_ROOT: fixture.dir,
  });
  try {
    await startModule.launch();
  } finally {
    restoreEnv();
  }
  assert.equal(globalThis[markerKey], "src");
});

test("start script runs src via configured Bun executable when Bun global is unavailable", async (t) => {
  const fixture = createFixture();
  const captureFile = path.join(fixture.dir, "captured-args.txt");
  const stubPath = path.join(fixture.dir, "bun-stub.sh");
  writeFile(path.join(fixture.dir, "src", "index.ts"), "export {};\n");
  writeFile(
    stubPath,
    "#!/bin/sh\nprintf '%s\n' \"$1\" > \"$START_CAPTURE_FILE\"\n",
    0o755,
  );

  t.after(() => {
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  });

  const startModule = await importFixtureStart(fixture.dir);
  const previousExitCode = process.exitCode;
  const restoreEnv = withTempEnv({
    C64BRIDGE_PROJECT_ROOT: fixture.dir,
    C64BRIDGE_START_FORCE_NODE_RUNTIME: "1",
    BUN_BIN: stubPath,
    START_CAPTURE_FILE: captureFile,
  });
  try {
    await startModule.launch();
  } finally {
    restoreEnv();
    process.exitCode = previousExitCode;
  }

  const captured = fs.readFileSync(captureFile, "utf8").trim();
  assert.equal(captured, path.join(fixture.dir, "src", "index.ts"));
});

test("start script falls back to dist entry when src is unavailable", async (t) => {
  const fixture = createFixture();
  const markerKey = `__startFixtureDist_${Date.now()}`;
  writeFile(
    path.join(fixture.dir, "dist", "index.js"),
    `globalThis.${markerKey} = "dist";\n`,
  );

  t.after(() => {
    fs.rmSync(fixture.dir, { recursive: true, force: true });
    delete globalThis[markerKey];
  });

  const startModule = await importFixtureStart(fixture.dir);
  const restoreEnv = withTempEnv({
    C64BRIDGE_PROJECT_ROOT: fixture.dir,
  });
  try {
    await startModule.launch();
  } finally {
    restoreEnv();
  }
  assert.equal(globalThis[markerKey], "dist");
});

test("start script reports missing entry points", async (t) => {
  const fixture = createFixture();
  const errors = [];
  const oldError = console.error;
  const previousExitCode = process.exitCode;
  console.error = (...args) => {
    errors.push(args.join(" "));
  };

  t.after(() => {
    console.error = oldError;
    process.exitCode = previousExitCode;
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  });

  const startModule = await importFixtureStart(fixture.dir);
  const restoreEnv = withTempEnv({
    C64BRIDGE_PROJECT_ROOT: fixture.dir,
  });
  try {
    await startModule.launch();
  } finally {
    restoreEnv();
  }
  assert.equal(process.exitCode, 1);
  assert.ok(errors.some((line) => line.includes("Unable to locate server entry point")));
});