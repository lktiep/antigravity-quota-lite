/**
 * Antigravity Quota Lite — Extension Entry Point
 * 
 * A lightweight, safe quota monitor for Antigravity IDE.
 * 
 * What this extension does:
 *   ✅ Shows AI model quota usage in the status bar
 *   ✅ Click to see detailed breakdown per model
 *   ✅ Auto-refreshes on configurable interval
 * 
 * What this extension does NOT do:
 *   ❌ No OAuth / credential storage
 *   ❌ No external telemetry / error reporting
 *   ❌ No WebSocket connections
 *   ❌ No reading internal databases
 *   ❌ No shell injection risks (uses execFile, not exec)
 */

import * as vscode from 'vscode';
import { findConnection } from './connectionFinder';
import { fetchQuota } from './quotaReader';
import { StatusBarController } from './statusBar';
import { showQuotaQuickPick } from './quickPick';
import { ConnectionInfo, QuotaSnapshot } from './types';

/** Output channel for logging (user-visible, no external sending) */
let outputChannel: vscode.OutputChannel;

/** Core state */
let statusBar: StatusBarController;
let connection: ConnectionInfo | null = null;
let pollingTimer: ReturnType<typeof setInterval> | undefined;
let lastSnapshot: QuotaSnapshot | undefined;

/** Retry state for connection discovery */
let connectionRetryCount = 0;
const MAX_CONNECTION_RETRIES = 5;
const CONNECTION_RETRY_DELAY_MS = 10000;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Create output channel for local-only logging
    outputChannel = vscode.window.createOutputChannel('Quota Lite');
    log('Antigravity Quota Lite — activating');

    // Initialize status bar
    statusBar = new StatusBarController();
    context.subscriptions.push({ dispose: () => statusBar.dispose() });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('quotaLite.showQuota', () => {
            showQuotaQuickPick(statusBar.getLastSnapshot(), () => refreshQuota());
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('quotaLite.refresh', () => {
            refreshQuota();
        }),
    );

    // Watch for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('quotaLite')) {
                restartPolling();
            }
        }),
    );

    // Start connection discovery and polling
    await startSystem();
}

/**
 * Extension deactivation — clean shutdown
 */
export function deactivate(): void {
    stopPolling();
    log('Antigravity Quota Lite — deactivated');
}

/**
 * Start the system: find connection → start polling
 */
async function startSystem(): Promise<void> {
    statusBar.showOffline();
    connectionRetryCount = 0;

    await discoverConnection();
}

/**
 * Discover Antigravity Language Server connection.
 * Retries with backoff if not found.
 */
async function discoverConnection(): Promise<void> {
    log('Searching for Antigravity Language Server...');

    connection = await findConnection();

    if (connection) {
        log(`Connected to Language Server on port ${connection.port}`);
        connectionRetryCount = 0;
        startPolling();
        // Immediately fetch first data
        await refreshQuota();
    } else {
        connectionRetryCount++;
        if (connectionRetryCount <= MAX_CONNECTION_RETRIES) {
            const delay = CONNECTION_RETRY_DELAY_MS * connectionRetryCount;
            log(`Language Server not found. Retry ${connectionRetryCount}/${MAX_CONNECTION_RETRIES} in ${delay / 1000}s`);
            statusBar.showError('Looking for Antigravity...');
            setTimeout(() => discoverConnection(), delay);
        } else {
            log('Could not find Antigravity Language Server after retries');
            statusBar.showError('Antigravity not found — is it running?');
        }
    }
}

/**
 * Refresh quota data from Language Server.
 */
async function refreshQuota(): Promise<void> {
    if (!connection) {
        // Try to rediscover connection
        connection = await findConnection();
        if (!connection) {
            statusBar.showError('Antigravity not connected');
            return;
        }
        log(`Reconnected on port ${connection.port}`);
    }

    try {
        lastSnapshot = await fetchQuota(connection);
        statusBar.update(lastSnapshot);

        const modelCount = lastSnapshot.models.length;
        const groupCount = lastSnapshot.groups.length;
        log(`Quota updated: ${modelCount} models in ${groupCount} groups`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Quota fetch failed: ${message}`);

        // If connection failed, try to rediscover
        if (message.includes('Connection failed') || message.includes('timed out')) {
            log('Connection lost, attempting rediscovery...');
            connection = null;
            statusBar.showError('Reconnecting...');
            await discoverConnection();
        } else {
            statusBar.showError(message);
        }
    }
}

/**
 * Start periodic polling.
 */
function startPolling(): void {
    stopPolling();

    const config = vscode.workspace.getConfiguration('quotaLite');
    const intervalSec = config.get<number>('pollingIntervalSeconds', 60);
    const intervalMs = Math.max(10000, intervalSec * 1000); // Minimum 10s

    log(`Polling started: every ${intervalSec}s`);

    pollingTimer = setInterval(() => {
        refreshQuota();
    }, intervalMs);
}

/**
 * Stop polling.
 */
function stopPolling(): void {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = undefined;
    }
}

/**
 * Restart polling (e.g. after config change).
 */
function restartPolling(): void {
    if (connection) {
        startPolling();
    }
}

/**
 * Log to output channel (local only, never sent externally).
 */
function log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    outputChannel.appendLine(`[${timestamp}] ${message}`);
}
