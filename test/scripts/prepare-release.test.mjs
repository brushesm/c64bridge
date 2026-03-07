import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "#test/runner";
import assert from "#test/assert";

const prepareReleaseScript = path.resolve("scripts/prepare-release.mjs");
const generateChangelogScript = path.resolve("scripts/generate-changelog.mjs");

function run(command, cwd) {
  return execSync(command, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test User",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test User",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}

function createRepoFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "prepare-release-"));
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  cpSync(prepareReleaseScript, path.join(dir, "scripts", "prepare-release.mjs"));
  cpSync(generateChangelogScript, path.join(dir, "scripts", "generate-changelog.mjs"));

  const packageJson073 = {
    name: "fixture",
    version: "0.7.3",
  };
  const mcp073 = {
    name: "fixture",
    version: "0.7.3",
  };

  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(packageJson073, null, 2)}\n`, "utf8");
  writeFileSync(path.join(dir, "mcp.json"), `${JSON.stringify(mcp073, null, 2)}\n`, "utf8");
  writeFileSync(path.join(dir, "CHANGELOG.md"), "# Changelog\n\n## 0.7.3 - 2026-03-06\n\n- Previous release.\n", "utf8");

  run("git init", dir);
  run("git config user.name 'Test User'", dir);
  run("git config user.email 'test@example.com'", dir);
  run("git add package.json mcp.json CHANGELOG.md scripts", dir);
  run("git commit -m 'chore: prepare release 0.7.3'", dir);
  run("git tag 0.7.3", dir);

  const packageJson074 = {
    name: "fixture",
    version: "0.7.4",
  };
  const mcp074 = {
    name: "fixture",
    version: "0.7.4",
  };
  const changelog074 = `# Changelog

## 0.7.4 - 2026-03-07

- Current release.

## 0.7.3 - 2026-03-06

- Previous release.
`;

  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(packageJson074, null, 2)}\n`, "utf8");
  writeFileSync(path.join(dir, "mcp.json"), `${JSON.stringify(mcp074, null, 2)}\n`, "utf8");
  writeFileSync(path.join(dir, "CHANGELOG.md"), changelog074, "utf8");
  run("git add package.json mcp.json CHANGELOG.md", dir);
  run("git commit -m 'chore: prepare release 0.7.4'", dir);
  run("git tag 0.7.4", dir);

  return dir;
}

test("prepare-release is a no-op for an already prepared tagged version", (t) => {
  const dir = createRepoFixture();

  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const beforePackage = readFileSync(path.join(dir, "package.json"), "utf8");
  const beforeMcp = readFileSync(path.join(dir, "mcp.json"), "utf8");
  const beforeChangelog = readFileSync(path.join(dir, "CHANGELOG.md"), "utf8");

  const output = run("node scripts/prepare-release.mjs 0.7.4", dir);

  assert.match(output, /Version already set to 0\.7\.4; skipping npm version\./);
  assert.match(output, /CHANGELOG\.md already contains 0\.7\.4; skipping changelog generation\./);
  assert.equal(readFileSync(path.join(dir, "package.json"), "utf8"), beforePackage);
  assert.equal(readFileSync(path.join(dir, "mcp.json"), "utf8"), beforeMcp);
  assert.equal(readFileSync(path.join(dir, "CHANGELOG.md"), "utf8"), beforeChangelog);
  assert.equal(run("git status --short", dir).trim(), "");
});