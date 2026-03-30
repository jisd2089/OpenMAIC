import { z } from 'zod';
import { DEFAULT_SCOPE_ID, KB_ASSET_TYPES, KB_STATUS, KB_INGEST_STATUS } from '@/lib/server/db/schema/common';

export const knowledgeBaseIdSchema = z.string().min(1);
export const knowledgeFileIdSchema = z.string().min(1);
export const knowledgeBaseRouteParamsSchema = z.object({
  id: knowledgeBaseIdSchema,
});
export const knowledgeBaseFileRouteParamsSchema = z.object({
  id: knowledgeBaseIdSchema,
  fileId: knowledgeFileIdSchema,
});
export const knowledgeFileRouteParamsSchema = z.object({
  fileId: knowledgeFileIdSchema,
});

export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  scopeId: z.string().trim().min(1).default(DEFAULT_SCOPE_ID),
});

export const listKnowledgeBasesQuerySchema = z.object({
  scopeId: z.string().trim().min(1).default(DEFAULT_SCOPE_ID),
  keyword: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const updateKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(KB_STATUS).optional(),
});

export const listKnowledgeFilesQuerySchema = z.object({
  assetType: z.enum(KB_ASSET_TYPES).optional(),
  ingestStatus: z.enum(KB_INGEST_STATUS).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const uploadKnowledgeFileFormSchema = z.object({
  assetType: z.enum(KB_ASSET_TYPES).optional(),
  autoIngest: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .default(true),
});

export const searchKnowledgeBaseSchema = z.object({
  query: z.string().trim().min(1),
  knowledgeBaseIds: z.array(knowledgeBaseIdSchema).min(1),
  topK: z.number().int().positive().max(20).default(5),
  includeVideos: z.boolean().default(true),
  includeDocuments: z.boolean().default(true),
});

export interface KnowledgeBaseSummary {
  id: string;
  scopeId: string;
  name: string;
  slug: string;
  description?: string | null;
  status: (typeof KB_STATUS)[number];
  fileCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface KnowledgeFileSummary {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  assetType: (typeof KB_ASSET_TYPES)[number];
  mimeType: string;
  fileSize: number;
  ingestStatus: (typeof KB_INGEST_STATUS)[number];
  posterUrl?: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type KnowledgeSearchItem =
  | {
      type: 'video';
      fileId: string;
      knowledgeBaseId: string;
      filename: string;
      score: number;
      url: string;
      posterUrl?: string;
      durationMs?: number | null;
      width?: number | null;
      height?: number | null;
    }
  | {
      type: 'chunk';
      fileId: string;
      chunkId: string;
      knowledgeBaseId: string;
      score: number;
      text: string;
      pageNo?: number | null;
    };
