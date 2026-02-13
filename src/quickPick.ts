/**
 * Antigravity Quota Lite — QuickPick View
 * 
 * Shows detailed quota information in a VS Code QuickPick dropdown.
 * Groups models by category with Unicode progress bars and reset times.
 */

import * as vscode from 'vscode';
import { QuotaSnapshot, getQuotaLevel, getQuotaEmoji } from './types';

/**
 * Show quota details in a QuickPick dropdown.
 */
export function showQuotaQuickPick(
    snapshot: QuotaSnapshot | undefined,
    onRefresh: () => void,
): void {
    if (!snapshot || snapshot.models.length === 0) {
        vscode.window.showInformationMessage(
            'Antigravity Quota Lite: No quota data available. Make sure Antigravity is running.'
        );
        return;
    }

    const items = buildQuickPickItems(snapshot);

    const quickPick = vscode.window.createQuickPick();
    quickPick.title = '🚀 Antigravity Quota Monitor';
    quickPick.placeholder = 'Quota details — press Esc to close';
    quickPick.items = items;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    // Add refresh button
    quickPick.buttons = [
        {
            iconPath: new vscode.ThemeIcon('refresh'),
            tooltip: 'Refresh quota data',
        },
    ];

    quickPick.onDidTriggerButton(() => {
        quickPick.busy = true;
        onRefresh();
        // The quickpick will be refreshed via the next update cycle
        setTimeout(() => {
            quickPick.busy = false;
        }, 2000);
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
}

/**
 * Build QuickPick items from quota snapshot.
 */
function buildQuickPickItems(snapshot: QuotaSnapshot): vscode.QuickPickItem[] {
    const items: vscode.QuickPickItem[] = [];

    for (let i = 0; i < snapshot.groups.length; i++) {
        const group = snapshot.groups[i];

        // Group separator
        items.push({
            label: `$(folder) ${group.name}`,
            kind: vscode.QuickPickItemKind.Separator,
        });

        // Models in this group
        for (const model of group.models) {
            const level = getQuotaLevel(model.remainingPercentage);
            const emoji = getQuotaEmoji(level);
            const pct = model.remainingPercentage.toFixed(1);
            const bar = makeProgressBar(model.remainingPercentage);
            const resetInfo = model.resetTime ? formatResetTime(model.resetTime) : '';

            items.push({
                label: `    ${emoji} ${model.label}`,
                description: `${bar}  ${pct}%`,
                detail: resetInfo ? `        Reset: ${resetInfo}` : undefined,
            });
        }
    }

    // Footer
    items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator,
    });

    const lastUpdate = new Date(snapshot.fetchedAt);
    items.push({
        label: `$(clock) Last updated: ${lastUpdate.toLocaleTimeString()}`,
        description: snapshot.fromCache ? '(cached)' : '',
    });

    return items;
}

/** Make a Unicode progress bar */
function makeProgressBar(percentage: number): string {
    const total = 12;
    const filled = Math.round((percentage / 100) * total);
    const empty = total - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/** Format reset time as human-readable countdown */
function formatResetTime(isoTime: string): string {
    try {
        const resetDate = new Date(isoTime);
        const now = new Date();
        const diffMs = resetDate.getTime() - now.getTime();

        if (diffMs <= 0) return 'Resetting now...';

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h ${minutes}m remaining`;
        }
        if (hours > 0) return `${hours}h ${minutes}m remaining`;
        return `${minutes}m remaining`;
    } catch {
        return isoTime;
    }
}
