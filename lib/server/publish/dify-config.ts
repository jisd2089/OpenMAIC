import { createLogger } from '@/lib/logger';

const log = createLogger('DifyConfig');

export interface DifyConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  datasetId: string;
  documentNameTemplate: string;
  legacyDocumentId: string;
  legacyDocumentName: string;
  timeoutMs: number;
  pollingIntervalMs: number;
  maxPollingAttempts: number;
}

let cachedConfig: DifyConfig | null = null;

function envBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === 'true';
}

function envNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function loadConfig(): DifyConfig {
  const config: DifyConfig = {
    enabled: envBoolean(process.env.OPENMAIC_DIFY_ENABLED, false),
    baseUrl: normalizeBaseUrl(process.env.OPENMAIC_DIFY_BASE_URL),
    apiKey: process.env.OPENMAIC_DIFY_API_KEY?.trim() || '',
    datasetId: process.env.OPENMAIC_DIFY_DATASET_ID?.trim() || '',
    documentNameTemplate:
      process.env.OPENMAIC_DIFY_DOCUMENT_NAME_TEMPLATE?.trim() ||
      process.env.OPENMAIC_DIFY_DOCUMENT_NAME?.trim() ||
      '[{type}] {title} ({classroom})',
    legacyDocumentId: process.env.OPENMAIC_DIFY_DOCUMENT_ID?.trim() || '',
    legacyDocumentName: process.env.OPENMAIC_DIFY_DOCUMENT_NAME?.trim() || '',
    timeoutMs: envNumber(process.env.OPENMAIC_DIFY_TIMEOUT_MS, 30_000),
    pollingIntervalMs: envNumber(process.env.OPENMAIC_DIFY_POLLING_INTERVAL_MS, 2_000),
    maxPollingAttempts: envNumber(process.env.OPENMAIC_DIFY_MAX_POLLING_ATTEMPTS, 180),
  };

  if (config.enabled) {
    log.info('Loaded Dify publish config', {
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      datasetId: config.datasetId,
      documentNameTemplate: config.documentNameTemplate,
      timeoutMs: config.timeoutMs,
      pollingIntervalMs: config.pollingIntervalMs,
      maxPollingAttempts: config.maxPollingAttempts,
      legacyDocumentIdConfigured: Boolean(config.legacyDocumentId),
    });
  }

  return config;
}

export function getDifyConfig(): DifyConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = loadConfig();
  return cachedConfig;
}

export function resetDifyConfigCacheForTests() {
  cachedConfig = null;
}

export function isDifySyncConfigured(config = getDifyConfig()): boolean {
  return Boolean(
    config.enabled &&
      config.baseUrl &&
      config.apiKey &&
      config.datasetId,
  );
}
