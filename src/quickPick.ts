/**
 * Antigravity Quota Lite — QuickPick View
 *
 * Shows detailed quota information in a VS Code QuickPick dropdown.
 * Groups models by category with Unicode progress bars and reset times.
 */

import * as vscode from "vscode";
import { QuotaSnapshot } from "./types";
import { getQuotaLevel, getQuotaEmoji } from "./utils";

/**
 * Show quota details in a QuickPick dropdown.
 */
export function showQuotaQuickPick(
  snapshot: QuotaSnapshot | undefined,
  onRefresh: () => void,
): void {
  if (!snapshot || snapshot.models.length === 0) {
    vscode.window.showInformationMessage(
      "Antigravity Quota Lite: No quota data available. Make sure Antigravity is running.",
    );
    return;
  }

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = "🚀 Antigravity Quota Monitor";
  quickPick.placeholder = "Quota details — press Esc to close";
  quickPick.items = buildItems(snapshot);
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  quickPick.buttons = [
    {
      iconPath: new vscode.ThemeIcon("refresh"),
      tooltip: "Refresh quota data",
    },
  ];

  quickPick.onDidTriggerButton(() => {
    quickPick.busy = true;
    onRefresh();
    setTimeout(() => (quickPick.busy = false), 2000);
  });

  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

// ─── Item builder ────────────────────────────────────────────────────

function buildItems(snapshot: QuotaSnapshot): vscode.QuickPickItem[] {
  const items: vscode.QuickPickItem[] = [];

  for (const group of snapshot.groups) {
    items.push({
      label: `$(folder) ${group.name}`,
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const model of group.models) {
      const pct = model.remainingPercentage ?? 0;
      const emoji = getQuotaEmoji(getQuotaLevel(pct));
      const bar = progressBar(pct, 12);

      items.push({
        label: `    ${emoji} ${model.label}`,
        description: `${bar}  ${pct.toFixed(1)}%`,
        detail: model.timeUntilResetFormatted
          ? `        Reset: ${model.timeUntilResetFormatted} (${model.resetTimeDisplay})`
          : undefined,
      });
    }
  }

  items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
  items.push({
    label: `$(clock) Last updated: ${new Date(snapshot.fetchedAt).toLocaleTimeString()}`,
    description: snapshot.fromCache ? "(cached)" : "",
  });

  return items;
}

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
