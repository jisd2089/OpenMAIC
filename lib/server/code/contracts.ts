import { z } from 'zod';
import { CODE_LANGUAGE_CATALOG } from '@/lib/code/runtime-catalog';
import type { CodeLanguage } from '@/lib/code/runtime-catalog';

const languageValues = CODE_LANGUAGE_CATALOG.map((entry) => entry.language) as [
  CodeLanguage,
  ...CodeLanguage[],
];

export const codeSessionScopeSchema = z.object({
  sceneId: z.string().min(1),
  clientSessionId: z.string().min(1),
  view: z.enum(['teacher', 'student']).default('teacher'),
  language: z.enum(languageValues).optional(),
});

export const saveCodeDraftSchema = z.object({
  language: z.enum(languageValues),
  entrypoint: z.string().min(1),
  stdin: z.string().default(''),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(200),
        content: z.string(),
      }),
    )
    .min(1),
});

export const runCodeExecutionSchema = saveCodeDraftSchema;

export const classroomCodeRouteParamsSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  executionId: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
});
