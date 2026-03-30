import { z } from 'zod';
import { DEFAULT_SCOPE_ID } from '@/lib/server/db/schema/common';
import { normalizeScopeId } from '@/lib/constants/scope';

export const coursePackageFormatVersion = 2 as const;

const classroomIdPattern = /^[a-zA-Z0-9_-]+$/;
const routeIdSchema = z.string().trim().min(1).regex(classroomIdPattern);
const optionalScopeSchema = z
  .string()
  .optional()
  .transform((value) => normalizeScopeId(value));

export const classroomIdSchema = routeIdSchema;
export const exportJobIdSchema = routeIdSchema;
export const importJobIdSchema = routeIdSchema;
export const revisionIdSchema = routeIdSchema;
export const regenerationJobIdSchema = routeIdSchema;

export const classroomRouteParamsSchema = z.object({
  id: classroomIdSchema,
});

export const classroomExportRouteParamsSchema = z.object({
  id: classroomIdSchema,
  jobId: exportJobIdSchema,
});

export const classroomImportRouteParamsSchema = z.object({
  jobId: importJobIdSchema,
});

export const classroomRevisionRouteParamsSchema = z.object({
  id: classroomIdSchema,
  revisionId: revisionIdSchema,
});

export const classroomRegenerationRouteParamsSchema = z.object({
  id: classroomIdSchema,
  jobId: regenerationJobIdSchema,
});

export const createCourseExportJobSchema = z.object({
  includeAssets: z.boolean().default(true),
  includeContext: z.boolean().default(true),
  includeRevisions: z.boolean().default(false),
});

export const courseImportFormFieldsSchema = z.object({
  strategy: z.enum(['create-new', 'duplicate']).default('create-new'),
});

export const applyCourseImportSchema = z.object({
  courseNameOverride: z.string().trim().min(1).max(200).optional(),
});

const stageDraftPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  language: z.string().trim().min(1).max(32).optional(),
  style: z.string().trim().min(1).max(120).optional(),
  generationContext: z.unknown().optional(),
  agentIds: z.array(z.string().trim().min(1)).optional(),
  editable: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  revisionId: z.string().trim().min(1).optional(),
  lastManualEditedAt: z.string().datetime().optional(),
  lastRegeneratedAt: z.string().datetime().optional(),
});

const sceneDraftPatchSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['slide', 'quiz', 'interactive', 'pbl']).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  order: z.number().int().nonnegative().optional(),
  content: z.unknown().optional(),
  actions: z.array(z.unknown()).optional(),
  whiteboards: z.array(z.unknown()).optional(),
  generationContext: z.unknown().optional(),
  locked: z.boolean().optional(),
  draftSource: z.enum(['manual', 'regenerate']).optional(),
  lastManualEditedAt: z.string().datetime().optional(),
  lastRegeneratedAt: z.string().datetime().optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
});

export const patchClassroomSchema = z.object({
  stage: stageDraftPatchSchema.optional(),
  scenes: z.array(sceneDraftPatchSchema).default([]),
  saveMode: z.enum(['draft', 'publish']).default('draft'),
});

export const createClassroomRevisionSchema = z.object({
  source: z.enum(['manual-save', 'pre-regenerate', 'pre-import-apply', 'system']).default('manual-save'),
  summary: z.string().trim().max(1000).optional(),
});

export const listClassroomRevisionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const createClassroomRegenerationJobSchema = z.object({
  targetType: z.enum(['classroom', 'scene', 'selection']),
  targetId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).max(10000),
  regenerateMode: z.enum(['text', 'layout', 'media', 'full']).default('full'),
  preserveManualEdits: z.boolean().default(true),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).default([]),
  memoryIds: z.array(z.string().trim().min(1)).default([]),
  scopeId: optionalScopeSchema.default(DEFAULT_SCOPE_ID),
}).superRefine((value, ctx) => {
  if (value.targetType !== 'classroom' && !value.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'targetId is required when targetType is scene or selection',
      path: ['targetId'],
    });
  }
});

export const applyClassroomRegenerationSchema = z.object({
  createRevision: z.boolean().default(true),
});

export const discardClassroomRegenerationSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export type CreateCourseExportJobInput = z.infer<typeof createCourseExportJobSchema>;
export type CourseImportFormFieldsInput = z.infer<typeof courseImportFormFieldsSchema>;
export type ApplyCourseImportInput = z.infer<typeof applyCourseImportSchema>;
export type PatchClassroomInput = z.infer<typeof patchClassroomSchema>;
export type CreateClassroomRevisionInput = z.infer<typeof createClassroomRevisionSchema>;
export type ListClassroomRevisionsQuery = z.infer<typeof listClassroomRevisionsQuerySchema>;
export type CreateClassroomRegenerationJobInput = z.infer<
  typeof createClassroomRegenerationJobSchema
>;
export type ApplyClassroomRegenerationInput = z.infer<typeof applyClassroomRegenerationSchema>;
export type DiscardClassroomRegenerationInput = z.infer<
  typeof discardClassroomRegenerationSchema
>;
