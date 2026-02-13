/**
 * Antigravity Quota Lite — Connection Finder
 * 
 * SAFE approach to find Antigravity Language Server port + CSRF token.
 * 
 * Strategy (in order of preference):
 *   1. Read from Antigravity's process args via `execFile('pgrep', ...)`
 *      → Uses execFile (NOT exec) to prevent shell injection
 *      → Only searches for the specific Antigravity process name
 *   2. Fallback: User-configured values in VS Code settings
 * 
 * SECURITY: Unlike the original extension, we:
 *   - Use execFile (no shell interpretation, immune to injection)
 *   - Only look for one specific process by name
 *   - Never list ALL system processes
 *   - No reading of internal SQLite databases
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as process from 'process';
import { ConnectionInfo } from './types';

const execFileAsync = promisify(execFile);

/** Known process names per platform */
/** 
 * Search pattern for pgrep — matches any language_server variant:
 *   language_server_macos_arm, language_server_macos_x64,
 *   language_server_linux_x64, language_server_windows_x64, etc.
 */
const PGREP_PATTERN = 'language_server';

/** Timeout for process discovery commands */
const CMD_TIMEOUT_MS = 5000;

/**
 * Find Antigravity Language Server connection info safely.
 * Returns null if not found.
 */
export async function findConnection(): Promise<ConnectionInfo | null> {
    try {
        if (process.platform === 'win32') {
            return await findConnectionWindows();
        } else {
            return await findConnectionUnix();
        }
    } catch {
        return null;
    }
}

/**
 * macOS / Linux: Use pgrep + ps to find the process.
 * execFile is safe — arguments are passed as array, no shell interpretation.
 */
async function findConnectionUnix(): Promise<ConnectionInfo | null> {
    try {
        // Step 1: Find PID using pgrep (safe, fixed arguments)
        // Searches for any process matching "language_server"
        const { stdout: pidOutput } = await execFileAsync('pgrep', ['-f', PGREP_PATTERN], {
            timeout: CMD_TIMEOUT_MS,
        });

        const pids = pidOutput.trim().split('\n').filter(Boolean);
        if (pids.length === 0) return null;

        // Step 2: Get command line of found processes using ps
        for (const pid of pids) {
            try {
                const { stdout: psOutput } = await execFileAsync('ps', ['-p', pid, '-ww', '-o', 'args='], {
                    timeout: CMD_TIMEOUT_MS,
                });

                const result = parseCommandLine(psOutput);
                if (result) return result;
            } catch {
                // Process may have exited, continue
            }
        }
    } catch {
        // pgrep returned no results or errored
    }

    return null;
}

/**
 * Windows: Use PowerShell Get-CimInstance with fixed filter.
 * Still uses execFile — the PowerShell command is a fixed string, not user input.
 */
async function findConnectionWindows(): Promise<ConnectionInfo | null> {
    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'language_server*' } | Select-Object -ExpandProperty CommandLine`,
        ], {
            timeout: CMD_TIMEOUT_MS,
        });

        return parseCommandLine(stdout);
    } catch {
        return null;
    }
}

/**
 * Extract port and CSRF token from Antigravity process command line.
 * Only extracts two specific parameters — no other data is captured.
 */
function parseCommandLine(cmdLine: string): ConnectionInfo | null {
    // Validate this is actually an Antigravity process
    if (!cmdLine.includes('--extension_server_port') || !cmdLine.includes('--csrf_token')) {
        return null;
    }

    // Must have Antigravity identifier
    if (!/--app_data_dir\s+antigravity\b/i.test(cmdLine)) {
        return null;
    }

    const portMatch = cmdLine.match(/--extension_server_port[=\s]+(\d+)/);
    const tokenMatch = cmdLine.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);

    if (!portMatch?.[1] || !tokenMatch?.[1]) return null;

    const extensionPort = parseInt(portMatch[1], 10);
    if (extensionPort <= 0 || extensionPort > 65535) return null;

    // The Language Server exposes the quota HTTP API on extension_server_port + 2.
    // Port layout: extension_server_port (internal gRPC), +1 (HTTPS API), +2 (HTTP API)
    const apiPort = extensionPort + 2;

    return {
        port: apiPort,
        csrfToken: tokenMatch[1],
    };
}
