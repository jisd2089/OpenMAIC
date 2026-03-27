import type {
  KnowledgeAssetType,
  KnowledgeBaseStatus,
  KnowledgeIngestStatus,
} from './common';

export const KNOWLEDGE_TABLES = {
  knowledgeBases: 'knowledge_bases',
  knowledgeFiles: 'knowledge_files',
  knowledgeChunks: 'knowledge_chunks',
  ingestionJobs: 'ingestion_jobs',
} as const;

export interface KnowledgeBaseRow {
  id: string;
  scopeId: string;
  name: string;
  slug: string;
  description: string | null;
  status: KnowledgeBaseStatus;
  fileCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeFileRow {
  id: string;
  knowledgeBaseId: string;
  scopeId: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  assetType: KnowledgeAssetType;
  ingestStatus: KnowledgeIngestStatus;
  ingestError: string | null;
  posterPath: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
  sourceType: 'upload' | 'import' | 'generated';
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeChunkRow {
  id: string;
  knowledgeFileId: string;
  knowledgeBaseId: string;
  scopeId: string;
  chunkIndex: number;
  pageNo: number | null;
  textContent: string;
  textHash: string;
  tokenCount: number | null;
  vectorDocId: string | null;
  createdAt: number;
}

export interface IngestionJobRow {
  id: string;
  knowledgeBaseId: string;
  knowledgeFileId: string;
  scopeId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  stage: 'parse' | 'chunk' | 'embed' | 'index';
  message: string | null;
  createdAt: number;
  updatedAt: number;
}
