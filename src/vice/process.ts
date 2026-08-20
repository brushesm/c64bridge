import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { createOutputTailCapture, getDiagnosticsSessionInfo, writeDiagnosticEvent } from "../diagnostics.js";

export interface ViceProcessOptions {
  binary: string;
  directory?: string;
  host: string;
  port: number;
  warp?: boolean;
  visible?: boolean;
  display?: string;
  extraArgs?: string[];
  /** When true, pass -headless to VICE and skip Xvfb. Requires VICE 3.5+. */
  headless?: boolean;
}

export interface ViceProcessHandle {
  readonly host: string;
  readonly port: number;
  readonly process: ChildProcess;
  stop(): Promise<void>;
}

const DEFAULT_DISPLAY = ":99";
const DEFAULT_REMOTE_MONITOR_PORT = 6510;

function viceMonitorAddress(host: string, port: number): string {
  if (host.includes("://")) return `${host}:${port}`;
  if (host === "127.0.0.1" || host.toLowerCase() === "localhost") {
    return `ip4://${host}:${port}`;
  }
  if (host === "::1" || host.includes(":")) {
    return `ip6://[${host}]:${port}`;
  }
  return `ip4://${host}:${port}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasGraphicalSession(): boolean {
  return configuredDisplay() !== undefined || configuredWaylandDisplay() !== undefined;
}

function configuredDisplay(): string | undefined {
  const display = process.env.DISPLAY?.trim();
  return display ? display : undefined;
}

function configuredWaylandDisplay(): string | undefined {
  const display = process.env.WAYLAND_DISPLAY?.trim();
  return display ? display : undefined;
}

function currentDisplayLabel(): string {
  return configuredDisplay() ?? configuredWaylandDisplay() ?? DEFAULT_DISPLAY;
}

export function shouldUseXvfb(visible: boolean | undefined): { useXvfb: boolean; display: string } {
  if (process.env.FORCE_XVFB === "1") {
    return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
  }
  if (visible === false) {
    if (process.env.DISABLE_XVFB === "1") {
      return { useXvfb: false, display: currentDisplayLabel() };
    }
    return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
  }
  if (hasGraphicalSession()) {
    return { useXvfb: false, display: currentDisplayLabel() };
  }
  if (process.env.DISABLE_XVFB === "1") {
    return { useXvfb: false, display: currentDisplayLabel() };
  }
  const ci = (process.env.CI || "").toLowerCase();
  if (ci === "true" || ci === "1" || ci === "yes") {
    return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
  }
  return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
}

export async function waitForPort(host: string, port: number, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host, port }, () => {
          socket.end();
          resolve();
        });
        socket.on("error", reject);
        socket.setTimeout(300, () => {
          socket.destroy(new Error("timeout"));
        });
      });
      return;
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Timeout waiting for VICE monitor at ${host}:${port}`);
}

function xvfbTcpPort(display: string): number | undefined {
  const match = /^:([0-9]+)/.exec(display.trim());
  if (!match) return undefined;
  return 6000 + Number(match[1]);
}

function xvfbTcpDisplay(display: string): string {
  return display.startsWith(":") ? `localhost${display}` : display;
}

function configuredRemoteMonitorPort(binaryPort: number): number {
  const raw = process.env.VICE_REMOTE_MONITOR_PORT?.trim();
  if (raw) {
    const value = Number(raw);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
  }
  return binaryPort === DEFAULT_REMOTE_MONITOR_PORT ? DEFAULT_REMOTE_MONITOR_PORT + 1 : DEFAULT_REMOTE_MONITOR_PORT;
}

async function waitForXvfb(display: string, useTcp: boolean, timeoutMs = 5_000): Promise<void> {
  if (useTcp) {
    const port = xvfbTcpPort(display);
    if (port === undefined) {
      await delay(500);
      return;
    }
    await waitForPort("127.0.0.1", port, timeoutMs);
    return;
  }

  const match = /^:([0-9]+)/.exec(display.trim());
  if (!match) {
    await delay(500);
    return;
  }
  const socketPath = `/tmp/.X11-unix/X${match[1]}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.existsSync(socketPath)) {
        return;
      }
    } catch {
      // Ignore transient fs errors while polling for the display socket.
    }
    await delay(50);
  }
  throw new Error(`Timeout waiting for Xvfb display socket ${socketPath}`);
}

export function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve();
    }, Math.max(0, timeoutMs));
    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("exit", onExit);
  });
}

export async function terminateProcess(child: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM", timeoutMs = 1000): Promise<void> {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill(signal); } catch {}
  await waitForExit(child, timeoutMs);
}

export async function startViceProcess(options: ViceProcessOptions): Promise<ViceProcessHandle> {
  const debugEnabled = process.env.VICE_DEVICE_TEST_DEBUG === "1";
  // Some VICE builds used in this workspace do not support -headless, but can
  // still run under SDL's dummy video driver. VICE_DISABLE_HEADLESS=1 keeps
  // the no-Xvfb launch path without passing the unsupported flag.
  const disableHeadlessFlag = process.env.VICE_DISABLE_HEADLESS === "1";
  const useHeadless = !disableHeadlessFlag && (options.headless === true || process.env.VICE_HEADLESS === "1");
  const { useXvfb, display } = useHeadless ? { useXvfb: false, display: "" } : shouldUseXvfb(options.visible);
  const useXvfbTcp = useXvfb && process.env.VICE_XVFB_TCP === "1";
  const viceEnv: NodeJS.ProcessEnv = { ...process.env };
  let xvfb: ChildProcess | null = null;
  const xvfbOutput = createOutputTailCapture("xvfb");
  const viceOutput = createOutputTailCapture("vice");

  writeDiagnosticEvent("vice_process_start_requested", {
    binary: options.binary,
    directory: options.directory,
    display,
    extraArgs: options.extraArgs ?? [],
    headless: useHeadless,
    host: options.host,
    port: options.port,
    useXvfb,
    useXvfbTcp,
    visible: options.visible === true,
    warp: options.warp !== false,
  });

  if (useXvfb) {
    ensureXvfbSocketDir(debugEnabled);
    if (debugEnabled) {
      console.error("[vice-process] launching Xvfb", { display });
    }
    const xvfbArgs = [display, "-screen", "0", "640x480x24"];
    if (useXvfbTcp) {
      xvfbArgs.push("-nolisten", "unix", "-listen", "tcp");
    }
    xvfb = spawn("Xvfb", xvfbArgs, { stdio: ["ignore", "pipe", "pipe"] });
    if (debugEnabled) {
      console.error("[vice-process] Xvfb pid", { pid: xvfb.pid });
    }
    xvfb.stdout?.on("data", (chunk) => {
      xvfbOutput.pushStdout(chunk);
      if (debugEnabled) console.error("[vice-process][xvfb stdout]", chunk.toString().trim());
    });
    xvfb.stderr?.on("data", (chunk) => {
      xvfbOutput.pushStderr(chunk);
      if (debugEnabled) console.error("[vice-process][xvfb stderr]", chunk.toString().trim());
    });
    xvfb.once("exit", (code, signal) => {
      writeDiagnosticEvent("xvfb_exit", {
        code,
        signal,
        output: xvfbOutput.snapshot(),
      });
    });
    viceEnv.DISPLAY = useXvfbTcp ? xvfbTcpDisplay(display) : display;
    await waitForXvfb(display, useXvfbTcp);
  }

  const args = [
    "-remotemonitor",
    "-remotemonitoraddress", viceMonitorAddress(options.host, configuredRemoteMonitorPort(options.port)),
    "-binarymonitor",
    "-binarymonitoraddress", viceMonitorAddress(options.host, options.port),
    "-sounddev", "dummy",
    "-config", "/dev/null",
    ...(useHeadless ? ["-headless"] : []),
    ...(options.directory ? ["-directory", options.directory] : []),
    ...(options.extraArgs ?? []),
  ];
  if (options.warp !== false) args.push("-warp");

  if (debugEnabled) {
    console.error("[vice-process] starting VICE", {
      binary: options.binary,
      args,
      display: viceEnv.DISPLAY,
      warp: options.warp !== false,
    });
  }

  const spawnOptions: SpawnOptions = { stdio: ["ignore", "pipe", "pipe"], env: viceEnv };
  let spawnError: Error | null = null;
  const child = spawn(options.binary, args, spawnOptions);
  if (debugEnabled) {
    console.error("[vice-process] VICE pid", { pid: child.pid });
  }
  child.stdout?.on("data", (chunk) => {
    viceOutput.pushStdout(chunk);
    if (debugEnabled) console.error("[vice-process][vice stdout]", chunk.toString().trim());
  });
  child.stderr?.on("data", (chunk) => {
    viceOutput.pushStderr(chunk);
    if (debugEnabled) console.error("[vice-process][vice stderr]", chunk.toString().trim());
  });
  child.once("exit", (code, signal) => {
    writeDiagnosticEvent("vice_process_exit", {
      code,
      signal,
      output: viceOutput.snapshot(),
    });
  });
  child.once("error", (err) => { spawnError = err; });

  try {
    await new Promise<void>((resolve, reject) => {
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        child.removeListener("error", onError);
        if (spawnError) reject(spawnError);
        else reject(new Error(`VICE process exited before monitor became ready (code=${code}, signal=${signal ?? "null"})`));
      };
      const onError = (err: Error) => {
        child.removeListener("exit", onExit);
        reject(err);
      };
      child.once("exit", onExit);
      child.once("error", onError);
      waitForPort(options.host, options.port)
        .then(() => {
          if (debugEnabled) {
            console.error("[vice-process] monitor port is ready", { host: options.host, port: options.port });
          }
          writeDiagnosticEvent("vice_process_monitor_ready", {
            host: options.host,
            port: options.port,
            pid: child.pid,
          });
          child.removeListener("exit", onExit);
          child.removeListener("error", onError);
          resolve();
        })
        .catch((err) => {
          child.removeListener("exit", onExit);
          child.removeListener("error", onError);
          reject(err);
        });
    });
  } catch (err) {
    const diagnosticsFile = getDiagnosticsSessionInfo()?.filePath;
    const detail = {
      diagnosticsFile,
      display,
      host: options.host,
      output: {
        vice: viceOutput.snapshot(),
        xvfb: xvfbOutput.snapshot(),
      },
      pid: child.pid,
      useXvfb,
      error: err,
    };
    writeDiagnosticEvent("vice_process_start_failed", detail);
    if (debugEnabled) {
      console.error("[vice-process] failed to start VICE", err instanceof Error ? err : new Error(String(err)));
    }
    await terminateProcess(child, "SIGTERM", 500);
    await terminateProcess(child, "SIGKILL", 200);
    await terminateProcess(xvfb, "SIGTERM", 500);
    await terminateProcess(xvfb, "SIGKILL", 200);
    const stderrTail = viceOutput.snapshot().stderrTail || xvfbOutput.snapshot().stderrTail;
    const suffix = diagnosticsFile
      ? ` Diagnostics: ${diagnosticsFile}`
      : "";
    const error = err instanceof Error ? err : new Error(String(err));
    if (stderrTail) {
      error.message = `${error.message}${suffix} Last stderr: ${stderrTail}`;
    } else if (suffix) {
      error.message = `${error.message}${suffix}`;
    }
    throw error;
  }

  const stop = async (): Promise<void> => {
    if (debugEnabled) {
      console.error("[vice-process] stopping VICE/xvfb");
    }
    writeDiagnosticEvent("vice_process_stop_requested", {
      pid: child.pid,
      useXvfb,
    });
    await terminateProcess(child, "SIGTERM", 750);
    if (child.exitCode === null && child.signalCode === null) {
      await terminateProcess(child, "SIGKILL", 300);
    }
    await terminateProcess(xvfb, "SIGTERM", 500);
    if (xvfb && xvfb.exitCode === null && xvfb.signalCode === null) {
      await terminateProcess(xvfb, "SIGKILL", 200);
    }
  };

  child.once("exit", async () => {
    await terminateProcess(xvfb, "SIGTERM", 0);
  });

  return { host: options.host, port: options.port, process: child, stop };
}

export function ensureXvfbSocketDir(debugEnabled: boolean): void {
  const socketDir = "/tmp/.X11-unix";
  try {
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { mode: 0o1777 });
    }
    fs.chmodSync(socketDir, 0o1777);
  } catch (error) {
    writeDiagnosticEvent("xvfb_socket_dir_failed", { socketDir, error });
    if (debugEnabled) {
      console.error("[vice-process] failed to prepare Xvfb socket dir", error);
    }
  }
}
