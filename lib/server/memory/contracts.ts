import { z } from 'zod';
import { DEFAULT_SCOPE_ID, MEMORY_CATEGORIES } from '@/lib/server/db/schema/common';

export const memoryNoteIdSchema = z.string().min(1);
export const memoryNoteRouteParamsSchema = z.object({
  id: memoryNoteIdSchema,
});

export const createMemoryNoteSchema = z.object({
  scopeId: z.string().trim().min(1).default(DEFAULT_SCOPE_ID),
  content: z.string().trim().min(1).max(10000),
  category: z.enum(MEMORY_CATEGORIES),
  keywords: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const listMemoryNotesQuerySchema = z.object({
  scopeId: z.string().trim().min(1).default(DEFAULT_SCOPE_ID),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  keyword: z.string().trim().optional(),
  pinnedOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const updateMemoryNoteSchema = z.object({
  content: z.string().trim().min(1).max(10000).optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isPinned: z.boolean().optional(),
});

export const searchMemorySchema = z.object({
  scopeId: z.string().trim().min(1).default(DEFAULT_SCOPE_ID),
  query: z.string().trim().min(1),
  categories: z.array(z.enum(MEMORY_CATEGORIES)).default([]),
  topK: z.number().int().positive().max(20).default(5),
});

export const createMemoryFromStageSchema = z.object({
  stageId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(10000),
  category: z.enum(MEMORY_CATEGORIES),
  scopeId: z.string().trim().min(1).default(DEFAULT_SCOPE_ID),
});

export interface MemoryNoteSummary {
  id: string;
  scopeId: string;
  content: string;
  category: (typeof MEMORY_CATEGORIES)[number];
  keywords: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchItem extends MemoryNoteSummary {
  score: number;
}
