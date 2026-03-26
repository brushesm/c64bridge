import test from "#test/runner";
import assert from "#test/assert";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMcpInterface } from "../scripts/generate-mcp-interface.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const expectedDir = path.join(repoRoot, "mcp");

async function collectJsonFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(rootDir, fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.relative(rootDir, fullPath));
    }
  }

  return files.sort();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("generated static MCP interface snapshot matches the checked-in mcp directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "c64bridge-mcp-snapshot-test-"));

  try {
    await generateMcpInterface({ outputDir: tempDir });

    const actualFiles = await collectJsonFiles(tempDir);
    const expectedFiles = await collectJsonFiles(expectedDir);

    assert.deepEqual(actualFiles, expectedFiles, "generated file set should match checked-in snapshot");

    for (const relativePath of actualFiles) {
      const actualJson = await readJson(path.join(tempDir, relativePath));
      const expectedJson = await readJson(path.join(expectedDir, relativePath));
      assert.deepEqual(actualJson, expectedJson, `${relativePath} should stay in sync with generator output`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
