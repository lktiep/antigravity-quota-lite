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
const PROCESS_NAMES: Record<string, string> = {
    darwin_arm64: 'language_server_darwin_arm64',
    darwin_x64: 'language_server_darwin_x64',
    linux: 'language_server_linux_x64',
    win32: 'language_server_windows_x64.exe',
};

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
    const targetName = process.platform === 'darwin'
        ? (process.arch === 'arm64' ? PROCESS_NAMES.darwin_arm64 : PROCESS_NAMES.darwin_x64)
        : PROCESS_NAMES.linux;

    try {
        // Step 1: Find PID using pgrep (safe, fixed arguments)
        const { stdout: pidOutput } = await execFileAsync('pgrep', ['-f', targetName], {
            timeout: CMD_TIMEOUT_MS,
        });

        const pids = pidOutput.trim().split('\n').filter(Boolean);
        if (pids.length === 0) return null;

        // Step 2: Get command line of found processes using ps
        for (const pid of pids) {
            try {
                const { stdout: psOutput } = await execFileAsync('ps', ['-p', pid, '-o', 'args='], {
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
    const targetName = PROCESS_NAMES.win32;

    try {
        const { stdout } = await execFileAsync('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Get-CimInstance Win32_Process -Filter "name='${targetName}'" | Select-Object -ExpandProperty CommandLine`,
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

    const port = parseInt(portMatch[1], 10);
    if (port <= 0 || port > 65535) return null;

    return {
        port,
        csrfToken: tokenMatch[1],
    };
}
