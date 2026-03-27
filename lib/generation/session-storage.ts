import { z } from 'zod';
import { normalizeScopeId } from '@/lib/constants/scope';
import type { GenerationSessionState } from '@/app/generation-preview/types';

const languageSchema = z.enum(['zh-CN', 'en-US']);

const userRequirementsSchema = z.object({
  requirement: z.string().trim().min(1),
  language: languageSchema,
  userNickname: z.string().optional(),
  userBio: z.string().optional(),
  webSearch: z.boolean().optional(),
});

const sceneOutlineSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.enum(['slide', 'quiz', 'interactive', 'pbl']),
    title: z.string().trim().min(1),
    description: z.string(),
    keyPoints: z.array(z.string()),
    order: z.number(),
    language: languageSchema.optional(),
  })
  .passthrough();

const selectedKnowledgeBaseSummarySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const selectedMemorySummarySchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().trim().min(1),
  contentPreview: z.string(),
});

const generationSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  requirements: userRequirementsSchema,
  scopeId: z.string().optional().transform((value) => normalizeScopeId(value)),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).optional(),
  memoryIds: z.array(z.string().trim().min(1)).optional(),
  selectedKnowledgeBases: z.array(selectedKnowledgeBaseSummarySchema).optional(),
  selectedMemories: z.array(selectedMemorySummarySchema).optional(),
  enableKnowledgeRetrieval: z.boolean().optional(),
  enableMemoryRetrieval: z.boolean().optional(),
  preferKnowledgeVideos: z.boolean().optional(),
  pdfText: z.string(),
  pdfImages: z.array(z.unknown()).optional(),
  imageStorageIds: z.array(z.string()).optional(),
  imageMapping: z.record(z.string(), z.string()).optional(),
  sceneOutlines: z.array(sceneOutlineSchema).nullable().optional(),
  currentStep: z.enum(['generating', 'complete']),
  pdfStorageKey: z.string().optional(),
  pdfFileName: z.string().optional(),
  pdfProviderId: z.string().optional(),
  pdfProviderConfig: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  researchContext: z.string().optional(),
  researchSources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
});

const generationParamsSchema = z.object({
  pdfImages: z.array(z.unknown()).optional(),
  scopeId: z.string().optional().transform((value) => normalizeScopeId(value)),
  agents: z.array(z.unknown()).optional(),
  userProfile: z.string().optional(),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).optional(),
  memoryIds: z.array(z.string().trim().min(1)).optional(),
  selectedKnowledgeBases: z.array(selectedKnowledgeBaseSummarySchema).optional(),
  selectedMemories: z.array(selectedMemorySummarySchema).optional(),
  enableKnowledgeRetrieval: z.boolean().optional(),
  enableMemoryRetrieval: z.boolean().optional(),
  preferKnowledgeVideos: z.boolean().optional(),
});

export type GenerationParamsStorage = z.infer<typeof generationParamsSchema>;

export function buildGenerationSessionStorage(
  input: GenerationSessionState,
): GenerationSessionState {
  return generationSessionSchema.parse(input) as GenerationSessionState;
}

export function buildGenerationParamsStorage(
  input: GenerationParamsStorage,
): GenerationParamsStorage {
  return generationParamsSchema.parse(input);
}

export function parseGenerationSessionStorage(
  raw: string | null,
): GenerationSessionState | null {
  if (!raw) return null;
  try {
    return generationSessionSchema.parse(JSON.parse(raw)) as GenerationSessionState;
  } catch {
    return null;
  }
}

export function parseGenerationParamsStorage(raw: string | null): GenerationParamsStorage | null {
  if (!raw) return null;
  try {
    return generationParamsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
