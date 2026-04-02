import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { generateClassroomRequestSchema } from '@/lib/server/generation/contracts';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';

export const maxDuration = 30;

function headerValue(req: NextRequest, key: string): string | undefined {
  const value = req.headers.get(key)?.trim();
  return value ? value : undefined;
}

function headerBoolean(req: NextRequest, key: string): boolean | undefined {
  const value = headerValue(req, key);
  if (!value) return undefined;
  return value === 'true';
}

function headerNumber(req: NextRequest, key: string): number | undefined {
  const value = headerValue(req, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildGenerationInput(req: NextRequest, body: GenerateClassroomInput): GenerateClassroomInput {
  return {
    ...body,
    modelConfig: {
      modelString: headerValue(req, 'x-model'),
      apiKey: headerValue(req, 'x-api-key'),
      baseUrl: headerValue(req, 'x-base-url'),
      providerType: headerValue(req, 'x-provider-type'),
      requiresApiKey: headerBoolean(req, 'x-requires-api-key'),
    },
    mediaConfig: {
      imageProviderId: headerValue(req, 'x-image-provider'),
      imageModel: headerValue(req, 'x-image-model'),
      imageApiKey: headerValue(req, 'x-image-api-key'),
      imageBaseUrl: headerValue(req, 'x-image-base-url'),
      videoProviderId: headerValue(req, 'x-video-provider'),
      videoModel: headerValue(req, 'x-video-model'),
      videoApiKey: headerValue(req, 'x-video-api-key'),
      videoBaseUrl: headerValue(req, 'x-video-base-url'),
    },
    ttsConfig: {
      providerId: headerValue(req, 'x-tts-provider'),
      voice: headerValue(req, 'x-tts-voice'),
      speed: headerNumber(req, 'x-tts-speed'),
      apiKey: headerValue(req, 'x-tts-api-key'),
      baseUrl: headerValue(req, 'x-tts-base-url'),
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(req, generateClassroomRequestSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const body = buildGenerationInput(req, parsed.data);

    const baseUrl = buildRequestOrigin(req);
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, body);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, body, baseUrl));

    return apiSuccess(
      {
        jobId,
        classroomId: job.classroomId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
