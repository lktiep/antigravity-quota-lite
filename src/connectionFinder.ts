/**
 * Antigravity Quota Lite — Connection Finder
 * Ported exactly from vscode-antigravity-cockpit hunter.ts + strategies.ts
 *
 * Flow:
 *   1. ps -ww -eo pid,ppid,args | grep "language_server_macos_arm" | grep -v grep
 *   2. Parse: extract PID, --extension_server_port, --csrf_token
 *   3. Validate: must have --app_data_dir antigravity
 *   4. lsof -nP -a -iTCP -sTCP:LISTEN -p $PID | grep PID
 *   5. For each port: HTTPS POST to /GetUnleashData → if 200, it's the right port
 *   6. Return { port, csrfToken }
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as https from "https";
import * as process from "process";
import { ConnectionInfo, ProcessInfo } from "./types";

const execAsync = promisify(exec);

// ─── Constants (from constants.ts) ───────────────────────────────────

const PROCESS_NAMES = {
  darwin_arm: "language_server_macos_arm",
  darwin_x64: "language_server_macos",
  linux: "language_server_linux",
} as const;

const API_ENDPOINTS = {
  GET_UNLEASH_DATA:
    "/exa.language_server_pb.LanguageServerService/GetUnleashData",
} as const;

const PROCESS_CMD_TIMEOUT_MS = 15000;
const PROCESS_SCAN_RETRY_MS = 100;
const PING_TIMEOUT = 10000;
const MAX_ATTEMPTS = 3;

/**
 * Find connection to the running Antigravity Language Server.
 * Exactly follows ProcessHunter.scanEnvironment logic.
 */
export async function findConnection(): Promise<ConnectionInfo | null> {
  // Determine target process name based on platform & arch
  let targetProcess: string;
  if (process.platform === "darwin") {
    targetProcess =
      process.arch === "arm64"
        ? PROCESS_NAMES.darwin_arm
        : PROCESS_NAMES.darwin_x64;
  } else if (process.platform === "linux") {
    targetProcess = PROCESS_NAMES.linux;
  } else {
    // Windows not supported in lite version
    return null;
  }

  // Phase 1: Scan by process name (up to MAX_ATTEMPTS)
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      // Exact command from UnixStrategy.getProcessListCommand
      const cmd = `ps -ww -eo pid,ppid,args | grep "${targetProcess}" | grep -v grep`;
      const { stdout } = await execAsync(cmd, {
        timeout: PROCESS_CMD_TIMEOUT_MS,
      });

      if (!stdout || !stdout.trim()) {
        continue;
      }

      const candidates = parseProcessInfo(stdout);

      if (candidates.length > 0) {
        // Try each candidate
        for (const info of candidates) {
          const result = await verifyAndConnect(info);
          if (result) {
            return result;
          }
        }
      }
    } catch {
      // Process not found or command failed, retry
    }

    if (i < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, PROCESS_SCAN_RETRY_MS));
    }
  }

  return null;
}

// ─── Process Parsing (from UnixStrategy.parseProcessInfo) ────────────

/**
 * Check if a command line belongs to Antigravity.
 * Must have ALL THREE: --extension_server_port, --csrf_token, --app_data_dir antigravity
 */
function isAntigravityProcess(commandLine: string): boolean {
  if (!commandLine.includes("--extension_server_port")) return false;
  if (!commandLine.includes("--csrf_token")) return false;
  return /--app_data_dir\s+antigravity\b/i.test(commandLine);
}

/**
 * Parse ps output into ProcessInfo objects.
 * Exact port from UnixStrategy.parseProcessInfo.
 */
function parseProcessInfo(stdout: string): ProcessInfo[] {
  const lines = stdout.split("\n").filter((line) => line.trim());
  const currentPid = process.pid;
  const candidates: Array<{
    pid: number;
    ppid: number;
    extensionPort: number;
    csrfToken: string;
  }> = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;

    const pid = parseInt(parts[0], 10);
    const ppid = parseInt(parts[1], 10);
    const cmd = parts.slice(2).join(" ");

    if (isNaN(pid) || isNaN(ppid)) continue;

    const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
    const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/i);

    if (tokenMatch?.[1] && isAntigravityProcess(cmd)) {
      const extensionPort = portMatch?.[1] ? parseInt(portMatch[1], 10) : 0;
      const csrfToken = tokenMatch[1];
      candidates.push({ pid, ppid, extensionPort, csrfToken });
    }
  }

  // Sort: our child processes first (ppid matches current PID)
  return candidates.sort((a, b) => {
    if (a.ppid === currentPid) return -1;
    if (b.ppid === currentPid) return 1;
    return 0;
  });
}

// ─── Port Discovery (from UnixStrategy + ProcessHunter) ──────────────

/**
 * Verify a process and find its API port.
 * Exact logic from ProcessHunter.verifyAndConnect.
 */
async function verifyAndConnect(
  info: ProcessInfo,
): Promise<ConnectionInfo | null> {
  const ports = await identifyPorts(info.pid);

  if (ports.length > 0) {
    const validPort = await verifyConnection(ports, info.csrfToken);
    if (validPort) {
      return {
        port: validPort,
        csrfToken: info.csrfToken,
      };
    }
  }

  return null;
}

/**
 * Get listening ports for a PID using lsof.
 * Exact command from UnixStrategy.getPortListCommand (darwin).
 */
async function identifyPorts(pid: number): Promise<number[]> {
  try {
    // Exact lsof command from the original
    const cmd = `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
    const { stdout } = await execAsync(cmd, {
      timeout: PROCESS_CMD_TIMEOUT_MS,
    });
    return parseListeningPorts(stdout, pid);
  } catch {
    return [];
  }
}

/**
 * Parse lsof output for listening ports.
 * Exact logic from UnixStrategy.parseListeningPorts (darwin branch).
 */
function parseListeningPorts(stdout: string, _pid: number): number[] {
  const ports: number[] = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    if (!line.includes("(LISTEN)")) continue;

    // Extract port from *:PORT or IP:PORT format
    const portMatch = line.match(/[*\d.:]+:(\d+)\s+\(LISTEN\)/);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      if (!ports.includes(port)) {
        ports.push(port);
      }
    }
  }

  return ports.sort((a, b) => a - b);
}

// ─── Port Verification (from ProcessHunter.pingPort) ─────────────────

/**
 * Try each port, return the first that responds to GetUnleashData.
 */
async function verifyConnection(
  ports: number[],
  token: string,
): Promise<number | null> {
  for (const port of ports) {
    if (await pingPort(port, token)) {
      return port;
    }
  }
  return null;
}

/**
 * Ping a port with HTTPS POST to GetUnleashData.
 * Exact logic from ProcessHunter.pingPort.
 */
function pingPort(port: number, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const options: https.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path: API_ENDPOINTS.GET_UNLEASH_DATA,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Codeium-Csrf-Token": token,
        "Connect-Protocol-Version": "1",
      },
      rejectUnauthorized: false,
      timeout: PING_TIMEOUT,
      agent: false,
    };

    const req = https.request(options, (res) =>
      resolve(res.statusCode === 200),
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.write(JSON.stringify({ wrapper_data: {} }));
    req.end();
  });
}
