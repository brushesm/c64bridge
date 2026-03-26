#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Jimp, rgbaToInt } from "jimp";
import { findGlyphByBasicChar } from "../dist/chargen.js";

const OUTPUT_DIR = path.resolve("doc/img/backend-switch");

const VICE_BINARY = process.env.VICE_BINARY || "/usr/local/bin/x64sc";
const VICE_DIRECTORY = process.env.VICE_DIRECTORY || "/usr/local/share/vice";

const PROMPTS = {
  c64u: "c64u: write a small BASIC program that clears the screen and prints HELLO C64U",
  vice: "vice: write a small BASIC program that clears the screen and prints HELLO VICE",
};

const PROGRAMS = {
  c64u: "10 PRINT CHR$(147);\"HELLO C64U\"\n20 END",
  vice: "10 PRINT CHR$(147);\"HELLO VICE\"\n20 END",
};

const VIC_PALETTE = [
  [0x00, 0x00, 0x00],
  [0xff, 0xff, 0xff],
  [0x81, 0x33, 0x38],
  [0x75, 0xce, 0xc8],
  [0x8e, 0x3c, 0x97],
  [0x56, 0xac, 0x4d],
  [0x2e, 0x2c, 0x9b],
  [0xed, 0xf1, 0x71],
  [0x8e, 0x50, 0x29],
  [0x55, 0x38, 0x00],
  [0xc4, 0x6c, 0x71],
  [0x4a, 0x4a, 0x4a],
  [0x7b, 0x7b, 0x7b],
  [0xa9, 0xff, 0x9f],
  [0x70, 0x6d, 0xeb],
  [0xb2, 0xb2, 0xb2],
];

const OCR_CANDIDATES = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.".split("");
const BLANK_GLYPH = { bitmap: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]) };

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function textContent(result) {
  return (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function parseJsonResult(result) {
  return JSON.parse(textContent(result));
}

async function callTool(client, name, args) {
  const result = await client.request(
    { method: "tools/call", params: { name, arguments: args } },
    CallToolResultSchema,
  );
  if (result.isError) {
    throw new Error(`${name} failed: ${textContent(result)}`);
  }
  return result;
}

function rgba(image, x, y) {
  const value = image.getPixelColor(x, y) >>> 0;
  return {
    r: (value >> 24) & 0xff,
    g: (value >> 16) & 0xff,
    b: (value >> 8) & 0xff,
  };
}

function colorDistance(left, right) {
  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return dr * dr + dg * dg + db * db;
}

function dominantColors(image, startX, startY, width, height) {
  const counts = new Map();
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      const key = image.getPixelColor(x, y) >>> 0;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([value]) => ({
      r: (value >> 24) & 0xff,
      g: (value >> 16) & 0xff,
      b: (value >> 8) & 0xff,
    }));
}

function scoreGlyph(image, glyph, originX, originY, background, foreground) {
  let score = 0;
  for (let row = 0; row < 8; row += 1) {
    const bits = glyph.bitmap[row] ?? 0;
    for (let col = 0; col < 8; col += 1) {
      const expectedOn = ((bits >> (7 - col)) & 1) === 1;
      const actual = rgba(image, originX + col, originY + row);
      const actualOn = colorDistance(actual, foreground) < colorDistance(actual, background);
      if (expectedOn !== actualOn) {
        score += 1;
      }
    }
  }
  return score;
}

function scoreString(image, expected, originX, originY) {
  const colors = dominantColors(image, originX, originY, expected.length * 8, 8);
  const background = colors[0] ?? { r: 0, g: 0, b: 0 };
  const foreground = colors[1] ?? { r: 255, g: 255, b: 255 };
  let score = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const glyph = expected[index] === " " ? BLANK_GLYPH : findGlyphByBasicChar(expected[index]);
    if (!glyph) {
      score += 1000;
      continue;
    }
    score += scoreGlyph(image, glyph, originX + (index * 8), originY, background, foreground);
  }
  return score;
}

function decodeStringAt(image, length, originX, originY) {
  const colors = dominantColors(image, originX, originY, length * 8, 8);
  const background = colors[0] ?? { r: 0, g: 0, b: 0 };
  const foreground = colors[1] ?? { r: 255, g: 255, b: 255 };
  let text = "";
  const scores = [];

  for (let index = 0; index < length; index += 1) {
    let best = { char: "?", score: Number.POSITIVE_INFINITY };
    for (const candidate of OCR_CANDIDATES) {
      const glyph = candidate === " " ? BLANK_GLYPH : findGlyphByBasicChar(candidate);
      if (!glyph) {
        continue;
      }
      const score = scoreGlyph(image, glyph, originX + (index * 8), originY, background, foreground);
      if (score < best.score) {
        best = { char: candidate, score };
      }
    }
    text += best.char;
    scores.push(best.score);
  }

  return { text, scores };
}

async function verifyScreenshot(filePath, expected, searchWindow) {
  const image = await Jimp.read(filePath);
  let best = { score: Number.POSITIVE_INFINITY, x: searchWindow.x0, y: searchWindow.y0 };

  for (let y = searchWindow.y0; y <= searchWindow.y1; y += 1) {
    for (let x = searchWindow.x0; x <= searchWindow.x1; x += 1) {
      const score = scoreString(image, expected, x, y);
      if (score < best.score) {
        best = { score, x, y };
      }
    }
  }

  const decoded = decodeStringAt(image, expected.length, best.x, best.y);
  if (decoded.text !== expected) {
    throw new Error(`OCR mismatch for ${path.basename(filePath)}: expected '${expected}' but decoded '${decoded.text}' at (${best.x}, ${best.y})`);
  }

  return {
    expected,
    recognized: decoded.text,
    origin: { x: best.x, y: best.y },
    score: best.score,
    characterScores: decoded.scores,
  };
}

async function renderIndexedFrame(frame, outputPath) {
  const image = new Jimp({ width: frame.width, height: frame.height, color: 0x000000ff });
  const pixels = Buffer.from(frame.pixels.data, frame.pixels.encoding);

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const colorIndex = pixels[(y * frame.width) + x] ?? 0;
      const [r, g, b] = VIC_PALETTE[colorIndex & 0x0f] ?? VIC_PALETTE[0];
      image.setPixelColor(rgbaToInt(r, g, b, 255), x, y);
    }
  }

  await image.write(outputPath);
}

async function main() {
  ensureOutputDir();

  const transport = new StdioClientTransport({
    command: "node",
    args: ["scripts/start.mjs"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      C64_MODE: "vice",
      C64U_HOST: process.env.C64U_HOST || "c64u",
      C64U_PORT: process.env.C64U_PORT || "80",
      VICE_BINARY,
      VICE_DIRECTORY,
      VICE_VISIBLE: process.env.VICE_VISIBLE || "true",
      VICE_WARP: process.env.VICE_WARP || "false",
    },
    stderr: "pipe",
  });

  const client = new Client(
    { name: "backend-switch-artifacts", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  try {
    await client.connect(transport);
    await new Promise((resolve) => setTimeout(resolve, 3500));

    await callTool(client, "c64_select_backend", { op: "select", backend: "c64u" });
    await callTool(client, "c64_program", { op: "upload_run_basic", program: PROGRAMS.c64u });
    await callTool(client, "c64_memory", { op: "wait_for_text", pattern: "HELLO C64U" });
    const c64uCapture = parseJsonResult(await callTool(client, "c64_graphics", {
      op: "capture_frame",
      count: 1,
      includePixels: true,
      encoding: "base64",
    }));
    await renderIndexedFrame(c64uCapture.frames[0], path.join(OUTPUT_DIR, "hello-c64u.png"));

    await callTool(client, "c64_select_backend", { op: "select", backend: "vice" });
    await callTool(client, "c64_program", { op: "upload_run_basic", program: PROGRAMS.vice });
    await callTool(client, "c64_memory", { op: "wait_for_text", pattern: "HELLO VICE" });
    const viceCapture = parseJsonResult(await callTool(client, "c64_graphics", {
      op: "capture_frame",
      count: 1,
      includePixels: true,
      encoding: "base64",
    }));
    await renderIndexedFrame(viceCapture.frames[0], path.join(OUTPUT_DIR, "hello-vice.png"));

    const ocr = {
      c64u: await verifyScreenshot(path.join(OUTPUT_DIR, "hello-c64u.png"), "HELLO C64U", { x0: 20, x1: 90, y0: 20, y1: 60 }),
      vice: await verifyScreenshot(path.join(OUTPUT_DIR, "hello-vice.png"), "HELLO VICE", { x0: 20, x1: 140, y0: 20, y1: 80 }),
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "metadata.json"),
      JSON.stringify({ prompts: PROMPTS, ocr }, null, 2),
      "utf8",
    );

    console.log(JSON.stringify({ ok: true, prompts: PROMPTS, ocr }, null, 2));
  } finally {
    await client.close().catch(() => undefined);
  }
}

await main();