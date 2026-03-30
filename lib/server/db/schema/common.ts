export { DEFAULT_SCOPE_ID } from '@/lib/constants/scope';

export const KB_STATUS = ['active', 'archived', 'deleting'] as const;
export const KB_ASSET_TYPES = ['document', 'image', 'video'] as const;
export const KB_INGEST_STATUS = [
  'pending',
  'processing',
  'indexed',
  'skipped',
  'failed',
] as const;
export const MEMORY_CATEGORIES = [
  'preference',
  'teaching_rule',
  'template',
  'fact',
  'summary',
  'general',
] as const;
export const MEMORY_SOURCE_TYPES = ['manual', 'generated_from_stage'] as const;
export const GENERATION_LINK_TYPES = [
  'knowledge_hit',
  'memory_hit',
  'knowledge_video_used',
  'memory_saved',
] as const;
export const INGESTION_JOB_STATUS = [
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;
export const INGESTION_JOB_STAGES = ['parse', 'chunk', 'embed', 'index'] as const;

export type KnowledgeBaseStatus = (typeof KB_STATUS)[number];
export type KnowledgeAssetType = (typeof KB_ASSET_TYPES)[number];
export type KnowledgeIngestStatus = (typeof KB_INGEST_STATUS)[number];
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];
export type GenerationLinkType = (typeof GENERATION_LINK_TYPES)[number];
export type IngestionJobStatus = (typeof INGESTION_JOB_STATUS)[number];
export type IngestionJobStage = (typeof INGESTION_JOB_STAGES)[number];
