/**
 * Antigravity Quota Lite — Status Bar Controller
 * 
 * Displays a compact quota summary in VS Code's status bar.
 * Click → opens QuickPick with full details.
 */

import * as vscode from 'vscode';
import { QuotaSnapshot, getQuotaLevel, getQuotaEmoji, QuotaLevel } from './types';

export class StatusBarController {
    private item: vscode.StatusBarItem;
    private lastSnapshot?: QuotaSnapshot;

    constructor() {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.item.command = 'quotaLite.showQuota';
        this.item.name = 'Antigravity Quota';
        this.showOffline();
    }

    /** Show initial offline state */
    showOffline(): void {
        this.item.text = '$(rocket) Quota: Connecting...';
        this.item.tooltip = 'Antigravity Quota Lite — connecting to Language Server';
        this.item.backgroundColor = undefined;
        this.item.show();
    }

    /** Show error state */
    showError(message: string): void {
        this.item.text = '$(rocket) Quota: Offline';
        this.item.tooltip = `Antigravity Quota Lite — ${message}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.show();
    }

    /** Update with new quota data */
    update(snapshot: QuotaSnapshot): void {
        this.lastSnapshot = snapshot;

        if (snapshot.models.length === 0) {
            this.item.text = '$(rocket) Quota: No models';
            this.item.tooltip = 'No quota data available';
            this.item.backgroundColor = undefined;
            this.item.show();
            return;
        }

        // Build compact status bar text from groups
        const groupSummaries = this.buildGroupSummaries(snapshot);
        this.item.text = `$(rocket) ${groupSummaries}`;

        // Build detailed tooltip
        this.item.tooltip = this.buildTooltip(snapshot);

        // Set background color based on worst group status
        const worstLevel = this.getWorstLevel(snapshot);
        if (worstLevel === 'critical') {
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (worstLevel === 'warning') {
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.item.backgroundColor = undefined;
        }

        this.item.show();
    }

    /** Get the last snapshot */
    getLastSnapshot(): QuotaSnapshot | undefined {
        return this.lastSnapshot;
    }

    /** Dispose of status bar item */
    dispose(): void {
        this.item.dispose();
    }

    /** Build compact group summaries for status bar */
    private buildGroupSummaries(snapshot: QuotaSnapshot): string {
        if (snapshot.groups.length === 0) return 'No data';

        return snapshot.groups.map(group => {
            // Average percentage for the group
            const avgPct = group.models.reduce((sum, m) => sum + m.remainingPercentage, 0) / group.models.length;
            const level = getQuotaLevel(avgPct);
            const emoji = getQuotaEmoji(level);
            const pct = Math.round(avgPct);

            // Shorten group name for status bar
            const shortName = this.shortenGroupName(group.name);
            return `${emoji} ${shortName}: ${pct}%`;
        }).join(' | ');
    }

    /** Shorten group names for compact display */
    private shortenGroupName(name: string): string {
        if (name.startsWith('Gemini 3 Pro')) return 'G3 Pro';
        if (name.startsWith('Gemini 3 Flash')) return 'G3 Flash';
        if (name.startsWith('Gemini')) return 'Gemini';
        if (name.startsWith('Claude Sonnet')) return 'Sonnet';
        if (name.startsWith('Claude Opus')) return 'Opus';
        if (name.startsWith('Claude')) return 'Claude';
        if (name.length > 10) return name.substring(0, 8) + '…';
        return name;
    }

    /** Build detailed tooltip with reset times */
    private buildTooltip(snapshot: QuotaSnapshot): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;

        md.appendMarkdown('### 🚀 Antigravity Quota Monitor\n\n');

        for (const group of snapshot.groups) {
            md.appendMarkdown(`**${group.name}**\n\n`);
            for (const model of group.models) {
                const emoji = getQuotaEmoji(getQuotaLevel(model.remainingPercentage));
                const pct = model.remainingPercentage.toFixed(1);
                const bar = this.makeProgressBar(model.remainingPercentage);
                const resetInfo = model.resetTime ? ` → ${this.formatResetTime(model.resetTime)}` : '';

                md.appendMarkdown(`${emoji} ${model.label}  ${bar}  ${pct}%${resetInfo}\n\n`);
            }
        }

        const lastUpdate = new Date(snapshot.fetchedAt);
        md.appendMarkdown(`---\n\n*Updated: ${lastUpdate.toLocaleTimeString()}* — Click for details`);

        return md;
    }

    /** Get worst quota level across all models */
    private getWorstLevel(snapshot: QuotaSnapshot): QuotaLevel {
        let worst: QuotaLevel = 'good';
        for (const model of snapshot.models) {
            const level = getQuotaLevel(model.remainingPercentage);
            if (level === 'critical') return 'critical';
            if (level === 'warning') worst = 'warning';
        }
        return worst;
    }

    /** Make a Unicode progress bar */
    private makeProgressBar(percentage: number): string {
        const total = 10;
        const filled = Math.round((percentage / 100) * total);
        const empty = total - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /** Format reset time as human-readable countdown */
    private formatResetTime(isoTime: string): string {
        try {
            const resetDate = new Date(isoTime);
            const now = new Date();
            const diffMs = resetDate.getTime() - now.getTime();

            if (diffMs <= 0) return 'Resetting...';

            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (hours > 0) return `${hours}h ${minutes}m`;
            return `${minutes}m`;
        } catch {
            return isoTime;
        }
    }
}
