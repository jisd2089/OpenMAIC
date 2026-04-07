import { generateVideo, normalizeVideoOptions } from '@/lib/media/video-providers';
import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '@/lib/media/types';

type LoggerLike = {
  info: (...args: unknown[]) => void;
};

export function normalizeServerVideoGenerationOptions(
  providerId: VideoGenerationConfig['providerId'],
  options: VideoGenerationOptions,
): VideoGenerationOptions {
  return normalizeVideoOptions(providerId, options);
}

export function formatVideoGenerationLogMessage(params: {
  providerId: string;
  model?: string;
  options: VideoGenerationOptions;
}): string {
  const { providerId, model, options } = params;
  return (
    `Generating video: provider=${providerId}, model=${model || 'default'}, ` +
    `prompt="${options.prompt.slice(0, 80)}...", duration=${options.duration ?? 'auto'}, ` +
    `aspect=${options.aspectRatio ?? 'auto'}, resolution=${options.resolution ?? 'auto'}`
  );
}

export async function generateVideoWithLogging(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
  log: LoggerLike,
): Promise<VideoGenerationResult> {
  const normalizedOptions = normalizeServerVideoGenerationOptions(config.providerId, options);
  log.info(
    formatVideoGenerationLogMessage({
      providerId: config.providerId,
      model: config.model,
      options: normalizedOptions,
    }),
  );
  return generateVideo(config, normalizedOptions);
}
