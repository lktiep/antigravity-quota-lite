/**
 * Antigravity Quota Lite — Quota Reader
 * 
 * Fetches quota data from Antigravity's local Language Server API.
 * 
 * SECURITY NOTES:
 *   - Only connects to 127.0.0.1 (localhost) via HTTP, never external servers
 *   - Uses HTTP (not HTTPS) because the Language Server's HTTP API port
 *     runs on localhost only — no TLS needed for loopback traffic.
 *   - No data is ever sent to external servers
 *   - Read-only: we only GET data, never modify Antigravity state
 */

import * as http from 'http';
import { ConnectionInfo, QuotaSnapshot, QuotaGroup, ModelQuotaInfo, RawUserStatusResponse } from './types';

/** API endpoint path */
const API_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';

/** Request timeout */
const TIMEOUT_MS = 8000;

/** Request body — read-only status query */
const REQUEST_BODY = JSON.stringify({
    metadata: {
        ideName: 'antigravity',
        extensionName: 'antigravity',
        locale: 'en',
    },
});

/**
 * Fetch current quota snapshot from Antigravity Language Server.
 */
export async function fetchQuota(connection: ConnectionInfo): Promise<QuotaSnapshot> {
    const raw = await httpPost<RawUserStatusResponse>(connection);
    return parseResponse(raw);
}

/**
 * Send HTTP POST to the local Language Server.
 */
function httpPost<T>(connection: ConnectionInfo): Promise<T> {
    return new Promise((resolve, reject) => {
        const opts: http.RequestOptions = {
            hostname: '127.0.0.1',
            port: connection.port,
            path: API_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(REQUEST_BODY),
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': connection.csrfToken,
            },
            timeout: TIMEOUT_MS,
            agent: false,
        };

        const req = http.request(opts, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (!body || body.trim().length === 0) {
                    reject(new Error('Empty response from Language Server'));
                    return;
                }
                try {
                    resolve(JSON.parse(body) as T);
                } catch {
                    reject(new Error('Invalid JSON response from Language Server'));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Connection failed: ${e.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.write(REQUEST_BODY);
        req.end();
    });
}

/**
 * Parse raw API response into our clean QuotaSnapshot format.
 */
function parseResponse(raw: RawUserStatusResponse): QuotaSnapshot {
    const models: ModelQuotaInfo[] = [];

    // Parse ideChatModels (primary source in newer API versions)
    if (raw.ideChatModels && Array.isArray(raw.ideChatModels)) {
        for (const m of raw.ideChatModels) {
            const info = parseModelQuota(m);
            if (info) models.push(info);
        }
    }

    // Parse promptCredits.models (fallback for older API versions)
    if (models.length === 0 && raw.promptCredits?.models && Array.isArray(raw.promptCredits.models)) {
        for (const m of raw.promptCredits.models) {
            const info = parseModelQuota(m);
            if (info) models.push(info);
        }
    }

    // If still no models but we have overall prompt credits, create a summary entry
    if (models.length === 0 && raw.promptCredits) {
        const pc = raw.promptCredits;
        if (pc.remaining !== undefined && pc.total !== undefined && pc.total > 0) {
            models.push({
                label: 'Prompt Credits',
                modelId: 'prompt_credits',
                remainingPercentage: (pc.remaining / pc.total) * 100,
                resetTime: pc.expiresAt,
            });
        }
    }

    // Group models intelligently
    const groups = groupModels(models);

    return {
        groups,
        models,
        fetchedAt: Date.now(),
        fromCache: false,
    };
}

/**
 * Parse a single model's quota data.
 */
function parseModelQuota(raw: { label?: string; model?: string; limits?: { remaining?: number; total?: number; expiresAt?: string }; quotaInfo?: { remainingFraction?: number; resetTime?: string } }): ModelQuotaInfo | null {
    const label = raw.label || raw.model;
    if (!label) return null;

    let remainingPercentage = 0;
    let resetTime: string | undefined;

    // Prefer quotaInfo (authorized API format)
    if (raw.quotaInfo?.remainingFraction !== undefined) {
        remainingPercentage = raw.quotaInfo.remainingFraction * 100;
        resetTime = raw.quotaInfo.resetTime;
    }
    // Fallback to limits (local API format)
    else if (raw.limits?.remaining !== undefined && raw.limits?.total !== undefined && raw.limits.total > 0) {
        remainingPercentage = (raw.limits.remaining / raw.limits.total) * 100;
        resetTime = raw.limits.expiresAt;
    }

    return {
        label,
        modelId: raw.model || label,
        remainingPercentage: Math.max(0, Math.min(100, remainingPercentage)),
        resetTime,
    };
}

/**
 * Group models by common prefix patterns.
 * E.g. "Gemini 3 Pro (High)" and "Gemini 3 Pro (Low)" → "Gemini 3 Pro"
 */
function groupModels(models: ModelQuotaInfo[]): QuotaGroup[] {
    if (models.length === 0) return [];
    if (models.length <= 3) {
        return [{ name: 'All Models', models }];
    }

    const groups = new Map<string, ModelQuotaInfo[]>();

    for (const model of models) {
        const groupName = inferGroupName(model.label);
        if (!groups.has(groupName)) {
            groups.set(groupName, []);
        }
        groups.get(groupName)!.push(model);
    }

    return Array.from(groups.entries()).map(([name, groupModels]) => ({
        name,
        models: groupModels,
    }));
}

/**
 * Infer group name from model label.
 */
function inferGroupName(label: string): string {
    // Remove variant indicators in parentheses
    const base = label.replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Known group patterns
    if (/gemini\s*3\s*pro/i.test(base)) return 'Gemini 3 Pro';
    if (/gemini\s*3\s*flash/i.test(base)) return 'Gemini 3 Flash';
    if (/gemini/i.test(base)) return 'Gemini';
    if (/claude\s*sonnet/i.test(base)) return 'Claude Sonnet';
    if (/claude\s*opus/i.test(base)) return 'Claude Opus';
    if (/claude/i.test(base)) return 'Claude';
    if (/gpt/i.test(base)) return 'GPT';

    return base;
}
