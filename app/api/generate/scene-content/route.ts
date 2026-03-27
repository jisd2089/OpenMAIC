/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions - use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import type { KnowledgeVideoReference } from '@/lib/kb/reference';
import { sceneContentRequestSchema } from '@/lib/server/generation/contracts';
import {
  buildGenerationRetrievalContext,
  getKnowledgeVideoReferencesForGeneration,
} from '@/lib/server/generation-retrieval';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(req, sceneContentRequestSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const body = parsed.data;
    const {
      outline: rawOutline,
      allOutlines: _allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId: _stageId,
      agents,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      scopeId?: string;
      knowledgeVideoReferences?: KnowledgeVideoReference[];
      knowledgeBaseIds?: string[];
      memoryIds?: string[];
      enableKnowledgeRetrieval?: boolean;
      enableMemoryRetrieval?: boolean;
      preferKnowledgeVideos?: boolean;
    };

    // Ensure outline has language from stageInfo (fallback for older outlines)
    const outline: SceneOutline = {
      ...rawOutline,
      language: rawOutline.language || (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN',
    };

    // ── Model resolution from request headers ──
    const { model: languageModel, modelInfo, modelString } = resolveModelFromHeaders(req);

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'scene-content',
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'scene-content',
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};
    const retrievalContext =
      body.enableKnowledgeRetrieval ||
      body.enableMemoryRetrieval ||
      (body.memoryIds && body.memoryIds.length > 0)
        ? await buildGenerationRetrievalContext({
            query: [
              effectiveOutline.title,
              effectiveOutline.description,
              ...(effectiveOutline.keyPoints || []),
            ]
              .filter(Boolean)
              .join('\n'),
            scopeId: body.scopeId,
            knowledgeBaseIds: body.knowledgeBaseIds,
            memoryIds: body.memoryIds,
            enableKnowledgeRetrieval: body.enableKnowledgeRetrieval,
            enableMemoryRetrieval: body.enableMemoryRetrieval,
            preferKnowledgeVideos: body.preferKnowledgeVideos,
          })
        : undefined;
    const knowledgeVideoReferences =
      body.knowledgeVideoReferences ||
      (body.knowledgeBaseIds && body.knowledgeBaseIds.length > 0
        ? await getKnowledgeVideoReferencesForGeneration({
            query: [
              effectiveOutline.title,
              effectiveOutline.description,
              ...(effectiveOutline.keyPoints || []),
            ]
              .filter(Boolean)
              .join('\n'),
            knowledgeBaseIds: body.knowledgeBaseIds,
            preferKnowledgeVideos: body.preferKnowledgeVideos,
          })
        : []);

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    const content = await generateSceneContent(
      effectiveOutline,
      aiCall,
      assignedImages,
      imageMapping,
      effectiveOutline.type === 'pbl' ? languageModel : undefined,
      hasVision,
      generatedMediaMapping,
      agents,
      knowledgeVideoReferences,
      retrievalContext,
    );

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
      );
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline, retrievalContext, knowledgeVideoReferences });
  } catch (error) {
    log.error('Scene content generation error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
