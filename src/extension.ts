/**
 * Antigravity Quota Lite — Extension Entry Point
 *
 * Lightweight quota monitor for Antigravity IDE.
 * No OAuth, no telemetry, no external connections.
 *
 * Flow:
 *   1. On activation, start looking for Antigravity Language Server
 *   2. Once found, poll GetUserStatus for quota data
 *   3. Display in status bar, click for QuickPick details
 */

import * as vscode from "vscode";
import { findConnection } from "./connectionFinder";
import { fetchQuota, fetchQuotaRaw } from "./quotaReader";
import { StatusBarController } from "./statusBar";
import { showQuotaQuickPick } from "./quickPick";
import { ConnectionInfo } from "./types";

// ─── State ───────────────────────────────────────────────────────────

let outputChannel: vscode.OutputChannel;
let statusBar: StatusBarController;
let currentConnection: ConnectionInfo | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let isActive = false;

/** Track consecutive fetch failures to avoid infinite reconnect loops */
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

// ─── Lifecycle ───────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Quota Lite");
  log("Antigravity Quota Lite activating...");

  statusBar = new StatusBarController();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand("quotaLite.showQuota", () => {
      showQuotaQuickPick(statusBar.getLastSnapshot(), () => refreshQuota());
    }),
    vscode.commands.registerCommand("quotaLite.refresh", () => refreshQuota()),
    vscode.commands.registerCommand("quotaLite.diagnose", () =>
      runDiagnostics(),
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("quotaLite")) {
        log("Configuration changed, restarting poll...");
        startPolling();
      }
    }),
  );

  isActive = true;
  startConnectionDiscovery();
}

export function deactivate(): void {
  isActive = false;
  stopPolling();
}

// ─── Connection Discovery ────────────────────────────────────────────

async function startConnectionDiscovery(): Promise<void> {
  log("Searching for Antigravity Language Server...");
  statusBar.showOffline();

  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts && isActive; i++) {
    try {
      const connection = await findConnection();
      if (connection) {
        log(
          `✅ Connected! Port: ${connection.port}, Token: ${connection.csrfToken.substring(0, 8)}...`,
        );
        currentConnection = connection;
        consecutiveFailures = 0;
        startPolling();
        return;
      }
    } catch (e) {
      log(
        `Attempt ${i + 1}/${maxAttempts} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Exponential backoff capped at 10s
    await sleep(Math.min(2000 + i * 1000, 10000));
  }

  log("Language Server not found after all attempts");
  statusBar.showError("Antigravity not found — is it running?");

  // Background retry every 30s
  setTimeout(() => {
    if (isActive && !currentConnection) startConnectionDiscovery();
  }, 30_000);
}

// ─── Polling ─────────────────────────────────────────────────────────

function startPolling(): void {
  stopPolling();
  consecutiveFailures = 0;

  const config = vscode.workspace.getConfiguration("quotaLite");
  const intervalSec = config.get<number>("pollingIntervalSeconds", 60);
  const intervalMs = Math.max(intervalSec * 1000, 10_000);

  log(`Polling every ${intervalSec}s`);
  refreshQuota();
  pollTimer = setInterval(() => refreshQuota(), intervalMs);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

// ─── Quota Refresh ───────────────────────────────────────────────────

async function refreshQuota(): Promise<void> {
  if (!currentConnection) {
    log("No connection, skipping refresh");
    return;
  }

  try {
    const snapshot = await fetchQuota(currentConnection);
    consecutiveFailures = 0;
    statusBar.update(snapshot);
    log(
      `Quota updated: ${snapshot.models.length} models, ${snapshot.groups.length} groups`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`Quota fetch failed: ${message}`);

    if (isConnectionError(message)) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log(
          `${MAX_CONSECUTIVE_FAILURES} consecutive failures, reconnecting...`,
        );
        currentConnection = null;
        statusBar.showError("Reconnecting...");
        startConnectionDiscovery();
      }
    }
  }
}

function isConnectionError(msg: string): boolean {
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("Connection Failed") ||
    msg.includes("timed out")
  );
}

// ─── Diagnostics ─────────────────────────────────────────────────────

async function runDiagnostics(): Promise<void> {
  outputChannel.show(true);
  log("=== DIAGNOSTICS START ===");
  log(`Platform: ${process.platform}, Arch: ${process.arch}`);
  log(`Node: ${process.version}, PID: ${process.pid}`);

  log("Testing findConnection()...");
  try {
    const conn = await findConnection();
    if (conn) {
      log(
        `✅ Found connection: port=${conn.port}, token=${conn.csrfToken.substring(0, 8)}...`,
      );

      log("Fetching raw response...");
      try {
        const raw = await fetchQuotaRaw(conn);
        logRawInspection(raw);
      } catch (e) {
        log(
          `❌ Raw fetch error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      log("Testing fetchQuota() (parsed)...");
      try {
        const quota = await fetchQuota(conn);
        log(
          `✅ Parsed: ${quota.models.length} models, ${quota.groups.length} groups`,
        );
        for (const m of quota.models.slice(0, 5)) {
          log(`  - ${m.label}: ${(m.remainingPercentage ?? 0).toFixed(1)}%`);
        }
      } catch (e) {
        log(
          `❌ fetchQuota error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      log("❌ findConnection returned null");
    }
  } catch (e) {
    log(
      `❌ findConnection error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  log("=== DIAGNOSTICS END ===");
  vscode.window.showInformationMessage(
    "Diagnostics complete — check Output → Quota Lite",
  );
}

/** Log inspection of raw API response for debugging */
function logRawInspection(raw: any): void {
  const topKeys = Object.keys(raw || {});
  log(`Raw top-level keys: ${JSON.stringify(topKeys)}`);

  if (!raw?.userStatus) {
    log("⚠️ No userStatus in response!");
    log(`Preview: ${JSON.stringify(raw).substring(0, 500)}`);
    return;
  }

  const statusKeys = Object.keys(raw.userStatus);
  log(`userStatus keys: ${JSON.stringify(statusKeys)}`);

  const configData = raw.userStatus.cascadeModelConfigData;
  if (!configData) {
    log("⚠️ No cascadeModelConfigData in userStatus");
    return;
  }

  log(
    `cascadeModelConfigData keys: ${JSON.stringify(Object.keys(configData))}`,
  );
  const configs = configData.clientModelConfigs || [];
  log(`clientModelConfigs count: ${configs.length}`);

  for (const m of configs.slice(0, 3)) {
    log(
      `  Model: label=${m.label}, id=${m.modelOrAlias?.model}, fraction=${m.quotaInfo?.remainingFraction}`,
    );
  }
}

// ─── Utilities ───────────────────────────────────────────────────────

function log(message: string): void {
  outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
