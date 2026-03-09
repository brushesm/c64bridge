import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DiagnosticsSessionInfo {
  readonly component: string;
  readonly directory: string;
  readonly filePath: string;
  readonly sessionId: string;
}

export interface OutputTailSnapshot {
  readonly name: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly stdoutTail: string;
  readonly stderrTail: string;
}

export interface OutputTailCapture {
  pushStdout(chunk: string | Uint8Array<ArrayBufferLike>): void;
  pushStderr(chunk: string | Uint8Array<ArrayBufferLike>): void;
  snapshot(): OutputTailSnapshot;
}

interface DiagnosticsState {
  readonly info: DiagnosticsSessionInfo;
}

let state: DiagnosticsState | null = null;
let handlersInstalled = false;

const DEFAULT_OUTPUT_TAIL_CHARS = 4_096;

export function installProcessDiagnostics(component: string): DiagnosticsSessionInfo {
  const info = ensureState(component).info;
  writeDiagnosticEvent("session_start", {
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    node: process.version,
    pid: process.pid,
    platform: process.platform,
  });
  installGlobalHandlers();
  return info;
}

export function getDiagnosticsSessionInfo(): DiagnosticsSessionInfo | null {
  return state?.info ?? null;
}

export function writeDiagnosticEvent(event: string, details?: unknown): void {
  if (!isDiagnosticsEnabled()) {
    return;
  }

  const current = ensureState("runtime");
  const record = {
    ts: new Date().toISOString(),
    pid: process.pid,
    sessionId: current.info.sessionId,
    component: current.info.component,
    event,
    details: sanitize(details),
  };

  try {
    fs.appendFileSync(current.info.filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    safeStderrWrite(
      `[diagnostics] failed to append event ${event}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

export function createOutputTailCapture(name: string, maxChars = DEFAULT_OUTPUT_TAIL_CHARS): OutputTailCapture {
  let stdoutTail = "";
  let stderrTail = "";
  let stdoutBytes = 0;
  let stderrBytes = 0;

  return {
    pushStdout(chunk) {
      const text = normalizeChunk(chunk);
      stdoutBytes += Buffer.byteLength(text, "utf8");
      stdoutTail = keepTail(stdoutTail, text, maxChars);
    },
    pushStderr(chunk) {
      const text = normalizeChunk(chunk);
      stderrBytes += Buffer.byteLength(text, "utf8");
      stderrTail = keepTail(stderrTail, text, maxChars);
    },
    snapshot() {
      return {
        name,
        stdoutBytes,
        stderrBytes,
        stdoutTail: stdoutTail.trim(),
        stderrTail: stderrTail.trim(),
      };
    },
  };
}

function ensureState(component: string): DiagnosticsState {
  if (state) {
    return state;
  }

  const info = createSessionInfo(component);
  state = { info };
  return state;
}

function createSessionInfo(component: string): DiagnosticsSessionInfo {
  const directory = resolveDiagnosticsDirectory();
  fs.mkdirSync(directory, { recursive: true });

  const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
  const safeComponent = component.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "runtime";
  const sessionId = `${startedAt}-${process.pid}`;
  const filePath = path.join(directory, `${sessionId}-${safeComponent}.ndjson`);
  return { component: safeComponent, directory, filePath, sessionId };
}

function resolveDiagnosticsDirectory(): string {
  const configured = process.env.C64BRIDGE_DIAGNOSTICS_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), ".c64bridge", "diagnostics");
}

function installGlobalHandlers(): void {
  if (!isDiagnosticsEnabled() || handlersInstalled) {
    return;
  }

  handlersInstalled = true;

  process.on("warning", (warning) => {
    writeDiagnosticEvent("process_warning", warning);
  });

  process.on("unhandledRejection", (reason, promise) => {
    writeDiagnosticEvent("unhandled_rejection", {
      reason,
      promise: Object.prototype.toString.call(promise),
    });
  });

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    writeDiagnosticEvent("uncaught_exception", { error, origin });
  });

  process.on("beforeExit", (code) => {
    writeDiagnosticEvent("before_exit", { code });
  });

  process.on("exit", (code) => {
    writeDiagnosticEvent("process_exit", { code });
  });
}

function isDiagnosticsEnabled(): boolean {
  if (process.env.C64BRIDGE_DISABLE_DIAGNOSTICS === "1") {
    return false;
  }
  if (process.env.NODE_ENV === "test" && process.env.C64BRIDGE_ENABLE_TEST_DIAGNOSTICS !== "1") {
    return false;
  }
  return true;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    const extra = value as Error & { cause?: unknown; code?: unknown };
    return {
      name: value.name,
      message: value.message,
      stack: limitString(value.stack ?? "", 8_000),
      code: extra.code,
      cause: depth < 3 ? sanitize(extra.cause, depth + 1) : undefined,
    };
  }
  if (typeof value === "string") {
    return limitString(value, 8_000);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return {
      type: "Buffer",
      byteLength: value.length,
      previewHex: value.subarray(0, 64).toString("hex"),
    };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      type: value.constructor.name,
      byteLength: value.byteLength,
    };
  }
  if (Array.isArray(value)) {
    if (depth >= 3) {
      return `[Array(${value.length})]`;
    }
    return value.slice(0, 25).map((entry) => sanitize(entry, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 3) {
      return `[Object ${value?.constructor?.name ?? "Object"}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 25);
    return Object.fromEntries(entries.map(([key, entry]) => [key, sanitize(entry, depth + 1)]));
  }
  return String(value);
}

function normalizeChunk(chunk: string | Uint8Array<ArrayBufferLike>): string {
  return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
}

function keepTail(existing: string, next: string, maxChars: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= maxChars) {
    return combined;
  }
  return combined.slice(combined.length - maxChars);
}

function limitString(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}…[truncated ${value.length - maxChars} chars]`;
}

function safeStderrWrite(text: string): void {
  try {
    process.stderr.write(text);
  } catch {
    // Ignore stderr write failures during crash handling.
  }
}
