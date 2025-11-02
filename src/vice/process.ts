import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import net from "node:net";

export interface ViceProcessOptions {
  binary: string;
  host: string;
  port: number;
  warp?: boolean;
  visible?: boolean;
  display?: string;
  extraArgs?: string[];
}

export interface ViceProcessHandle {
  readonly host: string;
  readonly port: number;
  readonly process: ChildProcess;
  stop(): Promise<void>;
}

const DEFAULT_DISPLAY = ":99";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldUseXvfb(visible: boolean | undefined): { useXvfb: boolean; display: string } {
  if (visible) return { useXvfb: false, display: process.env.DISPLAY ?? DEFAULT_DISPLAY };
  if (process.env.DISABLE_XVFB === "1") {
    return { useXvfb: false, display: process.env.DISPLAY ?? DEFAULT_DISPLAY };
  }
  if (process.env.FORCE_XVFB === "1") {
    return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
  }
  const ci = (process.env.CI || "").toLowerCase();
  if (ci === "true" || ci === "1" || ci === "yes") {
    return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
  }
  if (!process.env.DISPLAY || process.env.DISPLAY.trim() === "") {
    return { useXvfb: true, display: process.env.VICE_XVFB_DISPLAY ?? DEFAULT_DISPLAY };
  }
  return { useXvfb: false, display: process.env.DISPLAY };
}

async function waitForPort(host: string, port: number, timeoutMs = 4000): Promise<void> {
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

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
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

async function terminateProcess(child: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM", timeoutMs = 1000): Promise<void> {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { child.kill(signal); } catch {}
  await waitForExit(child, timeoutMs);
}

export async function startViceProcess(options: ViceProcessOptions): Promise<ViceProcessHandle> {
  const debugEnabled = process.env.VICE_DEVICE_TEST_DEBUG === "1";
  const { useXvfb, display } = shouldUseXvfb(options.visible);
  const viceEnv: NodeJS.ProcessEnv = { ...process.env };
  let xvfb: ChildProcess | null = null;

  if (useXvfb) {
    ensureXvfbSocketDir(debugEnabled);
    if (debugEnabled) {
      console.error("[vice-process] launching Xvfb", { display });
    }
    xvfb = spawn("Xvfb", [display, "-screen", "0", "640x480x24"], { stdio: debugEnabled ? ["ignore", "pipe", "pipe"] : "ignore" });
    if (debugEnabled) {
      console.error("[vice-process] Xvfb pid", { pid: xvfb.pid });
      xvfb.stdout?.on("data", (chunk) => console.error("[vice-process][xvfb stdout]", chunk.toString().trim()));
      xvfb.stderr?.on("data", (chunk) => console.error("[vice-process][xvfb stderr]", chunk.toString().trim()));
    }
    viceEnv.DISPLAY = display;
    // Give the server a moment to come up before launching VICE
    await delay(200);
  }

  const args = [
    "-binarymonitor",
    "-binarymonitoraddress", `${options.host}:${options.port}`,
    "-sounddev", "dummy",
    "-config", "/dev/null",
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

  const spawnOptions: SpawnOptions = debugEnabled
    ? { stdio: ["ignore", "pipe", "pipe"], env: viceEnv }
    : { stdio: "ignore", env: viceEnv };
  let spawnError: Error | null = null;
  const child = spawn(options.binary, args, spawnOptions);
  if (debugEnabled) {
    console.error("[vice-process] VICE pid", { pid: child.pid });
    child.stdout?.on("data", (chunk) => console.error("[vice-process][vice stdout]", chunk.toString().trim()));
    child.stderr?.on("data", (chunk) => console.error("[vice-process][vice stderr]", chunk.toString().trim()));
  }
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
    if (debugEnabled) {
      console.error("[vice-process] failed to start VICE", err instanceof Error ? err : new Error(String(err)));
    }
    await terminateProcess(child, "SIGTERM", 500);
    await terminateProcess(child, "SIGKILL", 200);
    await terminateProcess(xvfb, "SIGTERM", 500);
    await terminateProcess(xvfb, "SIGKILL", 200);
    throw err instanceof Error ? err : new Error(String(err));
  }

  const stop = async (): Promise<void> => {
    if (debugEnabled) {
      console.error("[vice-process] stopping VICE/xvfb");
    }
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

function ensureXvfbSocketDir(debugEnabled: boolean): void {
  const socketDir = "/tmp/.X11-unix";
  try {
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { mode: 0o1777 });
    }
    fs.chmodSync(socketDir, 0o1777);
  } catch (error) {
    if (debugEnabled) {
      console.error("[vice-process] failed to prepare Xvfb socket dir", error);
    }
  }
}
