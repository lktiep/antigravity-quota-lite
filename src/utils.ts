/**
 * Antigravity Quota Lite — Shared Utilities
 *
 * Common helpers used across status bar, quick pick, and other UI components.
 */

/** Quota health level */
export type QuotaLevel = "good" | "warning" | "critical";

/** Thresholds matching the original cockpit extension */
const THRESHOLD_HEALTHY = 50;
const THRESHOLD_WARNING = 30;
const THRESHOLD_CRITICAL = 10;

/**
 * Get the health level for a remaining percentage.
 * Uses same thresholds as the original cockpit: >50% good, >10% warning, <=10% critical
 */
export function getQuotaLevel(pct: number | undefined): QuotaLevel {
  if (pct === undefined) return "warning";
  if (pct <= THRESHOLD_CRITICAL) return "critical";
  if (pct <= THRESHOLD_WARNING) return "warning";
  return "good";
}

/** Get the colored dot emoji for a quota level */
export function getQuotaEmoji(level: QuotaLevel): string {
  switch (level) {
    case "good":
      return "🟢";
    case "warning":
      return "🟡";
    case "critical":
      return "🔴";
  }
}
