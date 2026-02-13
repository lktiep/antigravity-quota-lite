/**
 * Antigravity Quota Lite — Type Definitions
 * Minimal interfaces for quota data, no external dependencies.
 */

/** Single model's quota information */
export interface ModelQuotaInfo {
    /** Display name (e.g. "Gemini 3 Pro (High)") */
    label: string;
    /** Internal model ID */
    modelId: string;
    /** Remaining percentage (0-100) */
    remainingPercentage: number;
    /** ISO timestamp when quota resets */
    resetTime?: string;
}

/** A group of related models */
export interface QuotaGroup {
    /** Group display name (e.g. "Group 1", "Gemini 3 Flash") */
    name: string;
    /** Models in this group */
    models: ModelQuotaInfo[];
}

/** Complete quota snapshot */
export interface QuotaSnapshot {
    /** All model groups */
    groups: QuotaGroup[];
    /** All models (flat list) */
    models: ModelQuotaInfo[];
    /** When this snapshot was taken */
    fetchedAt: number;
    /** Whether this is from cache */
    fromCache: boolean;
}

/** Connection info to Antigravity Language Server */
export interface ConnectionInfo {
    port: number;
    csrfToken: string;
}

/** Raw API response types (partial) */
export interface RawUserStatusResponse {
    loggedIn?: boolean;
    promptCredits?: {
        remaining?: number;
        total?: number;
        expiresAt?: string;
        models?: RawModelQuota[];
    };
    ideChatModels?: RawModelQuota[];
    planType?: string;
}

export interface RawModelQuota {
    label?: string;
    model?: string;
    limits?: {
        remaining?: number;
        total?: number;
        expiresAt?: string;
    };
    quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
    };
}

/** Status levels for color coding */
export type QuotaLevel = 'good' | 'warning' | 'critical' | 'offline';

export function getQuotaLevel(percentage: number): QuotaLevel {
    if (percentage > 50) return 'good';
    if (percentage > 20) return 'warning';
    return 'critical';
}

export function getQuotaEmoji(level: QuotaLevel): string {
    switch (level) {
        case 'good': return '🟢';
        case 'warning': return '🟡';
        case 'critical': return '🔴';
        case 'offline': return '⚫';
    }
}
