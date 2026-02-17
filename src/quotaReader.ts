/**
 * Antigravity Quota Lite — Quota Reader
 * Ported exactly from vscode-antigravity-cockpit reactor.ts:
 *   - transmit()           → httpsPost()
 *   - fetchLocalTelemetry() → fetchQuota()
 *   - decodeSignal()        → decodeSignal()
 */

import * as https from "https";
import {
  ConnectionInfo,
  QuotaSnapshot,
  ModelQuotaInfo,
  QuotaGroup,
  PromptCreditsInfo,
  ServerUserStatusResponse,
  ClientModelConfig,
} from "./types";

// ─── Constants (from constants.ts) ───────────────────────────────────

const API_ENDPOINT =
  "/exa.language_server_pb.LanguageServerService/GetUserStatus";
const HTTP_TIMEOUT = 10000;

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Fetch quota data from the Antigravity Language Server.
 * Exact port of ReactorCore.fetchLocalTelemetry().
 */
export async function fetchQuota(
  connection: ConnectionInfo,
): Promise<QuotaSnapshot> {
  const raw = await httpsPost<ServerUserStatusResponse>(
    connection.port,
    connection.csrfToken,
    API_ENDPOINT,
    {
      metadata: {
        ideName: "antigravity",
        extensionName: "antigravity",
        locale: "en",
      },
    },
  );

  return decodeSignal(raw);
}

/**
 * Fetch raw response for diagnostics (no parsing).
 */
export async function fetchQuotaRaw(connection: ConnectionInfo): Promise<any> {
  return await httpsPost<any>(
    connection.port,
    connection.csrfToken,
    API_ENDPOINT,
    {
      metadata: {
        ideName: "antigravity",
        extensionName: "antigravity",
        locale: "en",
      },
    },
  );
}

// ─── HTTPS Transport (from ReactorCore.transmit) ─────────────────────

/**
 * Make HTTPS POST to local language server.
 * Exact port of ReactorCore.transmit().
 */
function httpsPost<T>(
  port: number,
  token: string,
  endpoint: string,
  payload: object,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);

    const opts: https.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "Connect-Protocol-Version": "1",
        "X-Codeium-Csrf-Token": token,
      },
      rejectUnauthorized: false,
      timeout: HTTP_TIMEOUT,
      agent: false, // Bypass proxy, connect directly to localhost
    };

    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const statusCode = res.statusCode;
        const contentType = res.headers["content-type"] || "unknown";

        // Try JSON parse
        const bodyStr = raw.toString("utf-8");
        try {
          resolve(JSON.parse(bodyStr) as T);
        } catch {
          // Show detailed debug info
          const hexPreview = raw.slice(0, 32).toString("hex");
          reject(
            new Error(
              `Non-JSON response from :${port}${endpoint}. ` +
                `Status: ${statusCode}, Content-Type: ${contentType}, ` +
                `Size: ${raw.length}B, Hex[0:32]: ${hexPreview}, ` +
                `Text[0:200]: ${bodyStr.substring(0, 200)}`,
            ),
          );
        }
      });
    });

    req.on("error", (e) =>
      reject(new Error(`Connection Failed: ${e.message}`)),
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.write(data);
    req.end();
  });
}

// ─── Response Decoding (from ReactorCore.decodeSignal) ───────────────

/**
 * Decode server response into QuotaSnapshot.
 * Exact port of ReactorCore.decodeSignal().
 */
function decodeSignal(data: ServerUserStatusResponse): QuotaSnapshot {
  // Validate response structure
  if (!data || !data.userStatus) {
    if (data && typeof (data as any).message === "string") {
      throw new Error(`Server error: ${(data as any).message}`);
    }
    throw new Error(
      `Invalid response: ${data ? JSON.stringify(data).substring(0, 100) : "empty"}`,
    );
  }

  const status = data.userStatus;
  const plan = status.planStatus?.planInfo;
  const credits = status.planStatus?.availablePromptCredits;

  // Parse prompt credits
  let promptCredits: PromptCreditsInfo | undefined;
  if (plan && credits !== undefined) {
    const monthlyLimit = Number(plan.monthlyPromptCredits);
    const availableVal = Number(credits);

    if (monthlyLimit > 0) {
      promptCredits = {
        available: availableVal,
        monthly: monthlyLimit,
        usedPercentage: ((monthlyLimit - availableVal) / monthlyLimit) * 100,
        remainingPercentage: (availableVal / monthlyLimit) * 100,
      };
    }
  }

  // Parse models from cascadeModelConfigData.clientModelConfigs
  const configs: ClientModelConfig[] =
    status.cascadeModelConfigData?.clientModelConfigs || [];

  const models: ModelQuotaInfo[] = configs
    .filter(
      (
        m,
      ): m is ClientModelConfig & {
        quotaInfo: NonNullable<ClientModelConfig["quotaInfo"]>;
      } => !!m.quotaInfo,
    )
    .map((m) => {
      const now = new Date();
      let reset = new Date(m.quotaInfo.resetTime);
      let resetTimeValid = true;

      if (Number.isNaN(reset.getTime())) {
        reset = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        resetTimeValid = false;
      }

      const delta = reset.getTime() - now.getTime();

      return {
        label: m.label,
        modelId: m.modelOrAlias?.model || "unknown",
        remainingFraction: m.quotaInfo.remainingFraction,
        remainingPercentage:
          m.quotaInfo.remainingFraction !== undefined
            ? m.quotaInfo.remainingFraction * 100
            : undefined,
        isExhausted: m.quotaInfo.remainingFraction === 0,
        resetTime: reset,
        resetTimeDisplay: resetTimeValid ? formatIso(reset) : "Unknown",
        timeUntilReset: delta,
        timeUntilResetFormatted: resetTimeValid
          ? formatDelta(delta)
          : "Unknown",
        resetTimeValid,
        supportsImages: m.supportsImages,
        isRecommended: m.isRecommended,
        tagTitle: m.tagTitle,
      };
    });

  // Sort using clientModelSorts if available
  const modelSorts = status.cascadeModelConfigData?.clientModelSorts || [];
  if (modelSorts.length > 0) {
    const sortOrderMap = new Map<string, number>();
    const primarySort = modelSorts[0];
    let index = 0;
    for (const group of primarySort.groups) {
      for (const label of group.modelLabels) {
        sortOrderMap.set(label, index++);
      }
    }

    models.sort((a, b) => {
      const indexA = sortOrderMap.get(a.label);
      const indexB = sortOrderMap.get(b.label);
      if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
      if (indexA !== undefined) return -1;
      if (indexB !== undefined) return 1;
      return a.label.localeCompare(b.label);
    });
  }

  // Build groups
  const groups = buildGroups(models);

  return {
    models,
    groups,
    promptCredits,
    fetchedAt: Date.now(),
    fromCache: false,
  };
}

// ─── Grouping ────────────────────────────────────────────────────────

function buildGroups(models: ModelQuotaInfo[]): QuotaGroup[] {
  if (models.length === 0) return [];

  // Group by quota fingerprint (remainingFraction + resetTime)
  const fingerprints = new Map<string, ModelQuotaInfo[]>();
  for (const model of models) {
    const fraction = (model.remainingFraction ?? 0).toFixed(6);
    const resetTime = model.resetTime.getTime();
    const key = `${fraction}_${resetTime}`;
    if (!fingerprints.has(key)) fingerprints.set(key, []);
    fingerprints.get(key)!.push(model);
  }

  const groups: QuotaGroup[] = [];
  let groupIndex = 1;
  for (const [, groupModels] of fingerprints) {
    const name =
      groupModels.length === 1 ? groupModels[0].label : `Group ${groupIndex}`;
    groups.push({ name, models: groupModels });
    groupIndex++;
  }

  return groups;
}

// ─── Time Formatting ─────────────────────────────────────────────────

function formatIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDelta(ms: number): string {
  if (ms <= 0) return "now";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
