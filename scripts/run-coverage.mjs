#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const coverageDir = path.join(repoRoot, "coverage");
const runner = path.join(repoRoot, "scripts", "invoke-bun.mjs");
const configPath = path.join(repoRoot, ".c8rc.json");

const legs = [
  { name: "c64u-mock", args: ["--platform=c64u", "--target=mock"] },
  { name: "vice-mock", args: ["--platform=vice", "--target=mock"] },
  { name: "vice-device", args: ["--platform=vice", "--target=device"] },
];

const supplementalTests = [
  "test/toolsCoverage.test.mjs",
  "test/audioModule.test.mjs",
  "test/updateReadme.test.mjs",
  "test/viceIntegration.test.mjs",
];

const coverageConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
const includeMatchers = (coverageConfig.include ?? []).map(globToRegExp);
const excludeMatchers = (coverageConfig.exclude ?? []).map(globToRegExp);

await fs.mkdir(coverageDir, { recursive: true });
await fs.rm(path.join(coverageDir, "matrix"), { recursive: true, force: true });
await fs.mkdir(path.join(coverageDir, "matrix"), { recursive: true });

const legOutputs = [];
for (const leg of legs) {
  const legDir = path.join(coverageDir, "matrix", leg.name);
  await fs.mkdir(legDir, { recursive: true });

  const reports = [];
  reports.push(await runCoverageLeg(leg, legDir, "all", []));
  for (const testFile of supplementalTests) {
    reports.push(await runCoverageLeg(leg, legDir, path.basename(testFile, path.extname(testFile)), [testFile]));
  }

  const mergedLeg = mergeReports(await Promise.all(reports.map(readReport)));
  const legPath = path.join(coverageDir, `${leg.name}.lcov.info`);
  await fs.writeFile(legPath, serializeReport(mergedLeg), "utf8");
  legOutputs.push(legPath);
}

const finalReport = mergeReports(await Promise.all(legOutputs.map(readReport)));
const finalPath = path.join(coverageDir, "lcov.info");
await fs.writeFile(finalPath, serializeReport(finalReport), "utf8");

const summary = summariseReport(finalReport);
console.log(JSON.stringify({ lines: summary }, null, 2));

function runCoverageLeg(leg, legDir, label, files) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(legDir, `${label}.lcov.info`);
    const args = [runner, "scripts/run-tests.ts", "--coverage", ...leg.args, ...files];
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", async (code) => {
      if (code !== 0) {
        reject(new Error(`Coverage run failed for ${leg.name}/${label} with exit code ${code ?? 1}`));
        return;
      }
      try {
        await fs.copyFile(path.join(coverageDir, "lcov.info"), outputPath);
        resolve(outputPath);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function readReport(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return parseReport(text);
}

function parseReport(text) {
  const report = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("SF:")) {
      const filePath = line.slice(3).trim();
      const relative = toRelativeSourcePath(filePath);
      current = relative ? getOrCreate(report, relative) : null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("DA:")) {
      const [lineNoRaw, hitsRaw] = line.slice(3).split(",", 2);
      const lineNo = Number(lineNoRaw);
      const hits = Number(hitsRaw);
      current.lines.set(lineNo, Math.max(current.lines.get(lineNo) ?? 0, Number.isFinite(hits) ? hits : 0));
    }
  }
  return report;
}

function mergeReports(reports) {
  const merged = new Map();
  for (const report of reports) {
    for (const [filePath, record] of report.entries()) {
      const target = getOrCreate(merged, filePath);
      for (const [lineNo, hits] of record.lines.entries()) {
        target.lines.set(lineNo, Math.max(target.lines.get(lineNo) ?? 0, hits));
      }
    }
  }
  return merged;
}

function serializeReport(report) {
  const lines = [];
  for (const [filePath, record] of [...report.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let lf = 0;
    let lh = 0;
    lines.push("TN:");
    lines.push(`SF:${filePath}`);
    for (const [lineNo, hits] of [...record.lines.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`DA:${lineNo},${hits}`);
      lf += 1;
      if (hits > 0) lh += 1;
    }
    lines.push(`LF:${lf}`);
    lines.push(`LH:${lh}`);
    lines.push("end_of_record");
  }
  return `${lines.join("\n")}\n`;
}

function summariseReport(report) {
  let covered = 0;
  let total = 0;
  for (const record of report.values()) {
    for (const hits of record.lines.values()) {
      total += 1;
      if (hits > 0) covered += 1;
    }
  }
  return {
    covered,
    total,
    pct: total === 0 ? "0.00" : ((covered * 100) / total).toFixed(2),
  };
}

function getOrCreate(report, filePath) {
  let record = report.get(filePath);
  if (!record) {
    record = { lines: new Map() };
    report.set(filePath, record);
  }
  return record;
}

function toRelativeSourcePath(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
  if (relative.startsWith("..")) {
    return null;
  }
  if (!includeMatchers.some((matcher) => matcher.test(relative))) {
    return null;
  }
  if (excludeMatchers.some((matcher) => matcher.test(relative))) {
    return null;
  }
  return relative;
}

function globToRegExp(glob) {
  const normalized = glob.split(path.sep).join("/");
  let regex = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      regex += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      regex += "[^/]*";
      continue;
    }
    if (char === "?") {
      regex += ".";
      continue;
    }
    if ("\\.^$+{}()|[]".includes(char)) {
      regex += `\\${char}`;
      continue;
    }
    regex += char;
  }
  regex += "$";
  return new RegExp(regex);
}