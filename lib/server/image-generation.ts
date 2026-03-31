import { aspectRatioToDimensions, generateImage } from '@/lib/media/image-providers';
import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@/lib/media/types';

type LoggerLike = {
  info: (...args: unknown[]) => void;
};

export function normalizeImageGenerationOptions(
  options: ImageGenerationOptions,
): ImageGenerationOptions {
  const normalized: ImageGenerationOptions = { ...options };

  if (!normalized.width && !normalized.height && normalized.aspectRatio) {
    const dims = aspectRatioToDimensions(normalized.aspectRatio);
    normalized.width = dims.width;
    normalized.height = dims.height;
  }

  return normalized;
}

export function formatImageGenerationLogMessage(params: {
  providerId: string;
  model?: string;
  options: ImageGenerationOptions;
}): string {
  const { providerId, model, options } = params;
  return (
    `Generating image: provider=${providerId}, model=${model || 'default'}, ` +
    `prompt="${options.prompt.slice(0, 80)}...", size=${options.width ?? 'auto'}x${options.height ?? 'auto'}`
  );
}

export async function generateImageWithLogging(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
  log: LoggerLike,
): Promise<ImageGenerationResult> {
  const normalizedOptions = normalizeImageGenerationOptions(options);
  log.info(
    formatImageGenerationLogMessage({
      providerId: config.providerId,
      model: config.model,
      options: normalizedOptions,
    }),
  );
  return generateImage(config, normalizedOptions);
}
