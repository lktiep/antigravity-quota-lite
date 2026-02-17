/**
 * Antigravity Quota Lite — Status Bar Controller
 *
 * Displays a compact quota summary in VS Code's status bar.
 * Click → opens QuickPick with full details.
 */

import * as vscode from "vscode";
import { QuotaSnapshot } from "./types";
import { QuotaLevel, getQuotaLevel, getQuotaEmoji } from "./utils";

export class StatusBarController {
  private readonly item: vscode.StatusBarItem;
  private lastSnapshot?: QuotaSnapshot;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = "quotaLite.showQuota";
    this.item.name = "Antigravity Quota";
    this.showOffline();
  }

  showOffline(): void {
    this.item.text = "$(rocket) Quota: Connecting...";
    this.item.tooltip =
      "Antigravity Quota Lite — connecting to Language Server";
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = "$(rocket) Quota: Offline";
    this.item.tooltip = `Antigravity Quota Lite — ${message}`;
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
    this.item.show();
  }

  update(snapshot: QuotaSnapshot): void {
    this.lastSnapshot = snapshot;

    if (snapshot.models.length === 0) {
      this.item.text = "$(rocket) Quota: No models";
      this.item.tooltip = "No quota data available";
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    this.item.text = `$(rocket) ${this.buildGroupSummaries(snapshot)}`;
    this.item.tooltip = this.buildTooltip(snapshot);

    const worstLevel = this.getWorstLevel(snapshot);
    this.item.backgroundColor =
      worstLevel === "critical"
        ? new vscode.ThemeColor("statusBarItem.errorBackground")
        : worstLevel === "warning"
          ? new vscode.ThemeColor("statusBarItem.warningBackground")
          : undefined;

    this.item.show();
  }

  getLastSnapshot(): QuotaSnapshot | undefined {
    return this.lastSnapshot;
  }

  dispose(): void {
    this.item.dispose();
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  private buildGroupSummaries(snapshot: QuotaSnapshot): string {
    if (snapshot.groups.length === 0) return "No data";

    return snapshot.groups
      .map((group) => {
        const avgPct =
          group.models.reduce(
            (sum, m) => sum + (m.remainingPercentage ?? 0),
            0,
          ) / group.models.length;
        const emoji = getQuotaEmoji(getQuotaLevel(avgPct));
        return `${emoji} ${shortenName(group.name)}: ${Math.round(avgPct)}%`;
      })
      .join(" | ");
  }

  private buildTooltip(snapshot: QuotaSnapshot): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown("### 🚀 Antigravity Quota Monitor\n\n");

    for (const group of snapshot.groups) {
      md.appendMarkdown(`**${group.name}**\n\n`);
      for (const model of group.models) {
        const pct = model.remainingPercentage ?? 0;
        const emoji = getQuotaEmoji(getQuotaLevel(pct));
        const bar = progressBar(pct, 10);
        const reset = model.timeUntilResetFormatted
          ? ` → ${model.timeUntilResetFormatted}`
          : "";
        md.appendMarkdown(
          `${emoji} ${model.label}  ${bar}  ${pct.toFixed(1)}%${reset}\n\n`,
        );
      }
    }

    md.appendMarkdown(
      `---\n\n*Updated: ${new Date(snapshot.fetchedAt).toLocaleTimeString()}* — Click for details`,
    );
    return md;
  }

  private getWorstLevel(snapshot: QuotaSnapshot): QuotaLevel {
    let worst: QuotaLevel = "good";
    for (const model of snapshot.models) {
      const level = getQuotaLevel(model.remainingPercentage);
      if (level === "critical") return "critical";
      if (level === "warning") worst = "warning";
    }
    return worst;
  }
}

// ─── Standalone helpers ──────────────────────────────────────────────

const SHORT_NAMES: [string, string][] = [
  ["Gemini 3 Pro", "G3 Pro"],
  ["Gemini 3 Flash", "G3 Flash"],
  ["Gemini", "Gemini"],
  ["Claude Sonnet", "Sonnet"],
  ["Claude Opus", "Opus"],
  ["Claude", "Claude"],
];

function shortenName(name: string): string {
  for (const [prefix, short] of SHORT_NAMES) {
    if (name.startsWith(prefix)) return short;
  }
  return name.length > 10 ? name.substring(0, 8) + "…" : name;
}

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
