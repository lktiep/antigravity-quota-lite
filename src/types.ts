/**
 * Antigravity Quota Lite — Type Definitions
 * Ported exactly from vscode-antigravity-cockpit/src/shared/types.ts
 */

// ─── API Response Types (from server) ────────────────────────────────

/** Model or alias reference */
export interface ModelOrAlias {
  model: string;
}

/** Quota info for a model */
export interface QuotaInfo {
  remainingFraction?: number;
  resetTime: string;
}

/** Client model config (from cascadeModelConfigData) */
export interface ClientModelConfig {
  label: string;
  modelOrAlias?: ModelOrAlias;
  quotaInfo?: QuotaInfo;
  supportsImages?: boolean;
  isRecommended?: boolean;
  tagTitle?: string;
  supportedMimeTypes?: Record<string, boolean>;
}

/** Plan info */
export interface PlanInfo {
  teamsTier: string;
  planName: string;
  monthlyPromptCredits: number;
  monthlyFlowCredits: number;
  [key: string]: string | number | boolean | object | undefined;
}

/** Plan status */
export interface PlanStatus {
  planInfo: PlanInfo;
  availablePromptCredits: number;
  availableFlowCredits: number;
}

/** Cascade model config data */
export interface CascadeModelConfigData {
  clientModelConfigs: ClientModelConfig[];
  clientModelSorts?: ClientModelSort[];
}

/** Model sort group */
export interface ModelSortGroup {
  modelLabels: string[];
}

/** Client model sort */
export interface ClientModelSort {
  name: string;
  groups: ModelSortGroup[];
}

/** User status (from server response) */
export interface UserStatus {
  name: string;
  email: string;
  planStatus?: PlanStatus;
  cascadeModelConfigData?: CascadeModelConfigData;
  acceptedLatestTermsOfService?: boolean;
  userTier?: {
    name: string;
    id: string;
    description: string;
  };
}

/** Server response for GetUserStatus */
export interface ServerUserStatusResponse {
  userStatus: UserStatus;
  message?: string;
  code?: string;
}

// ─── Internal Types ──────────────────────────────────────────────────

/** Prompt credits info */
export interface PromptCreditsInfo {
  available: number;
  monthly: number;
  usedPercentage: number;
  remainingPercentage: number;
}

/** Model quota info (parsed) */
export interface ModelQuotaInfo {
  label: string;
  modelId: string;
  remainingFraction?: number;
  remainingPercentage?: number;
  isExhausted: boolean;
  resetTime: Date;
  timeUntilReset: number;
  timeUntilResetFormatted: string;
  resetTimeDisplay: string;
  resetTimeValid?: boolean;
  supportsImages?: boolean;
  isRecommended?: boolean;
  tagTitle?: string;
}

/** Quota group */
export interface QuotaGroup {
  name: string;
  models: ModelQuotaInfo[];
}

/** Quota snapshot */
export interface QuotaSnapshot {
  models: ModelQuotaInfo[];
  groups: QuotaGroup[];
  promptCredits?: PromptCreditsInfo;
  fetchedAt: number;
  fromCache: boolean;
}

/** Connection info */
export interface ConnectionInfo {
  port: number;
  csrfToken: string;
}

/** Process info */
export interface ProcessInfo {
  pid: number;
  extensionPort: number;
  csrfToken: string;
}
