import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSModelConfig } from '@/lib/audio/types';
import type { TTSGenerationResult } from '@/lib/audio/tts-providers';

type LoggerLike = {
  info: (...args: unknown[]) => void;
};

export function formatTTSGenerationLogMessage(params: {
  providerId: string;
  voice: string;
  audioId?: string;
  text: string;
}): string {
  const { providerId, voice, audioId, text } = params;
  return `Generating TTS: provider=${providerId}, voice=${voice}, audioId=${audioId || 'n/a'}, textLen=${text.length}`;
}

export async function generateTTSWithLogging(
  config: TTSModelConfig,
  text: string,
  log: LoggerLike,
  audioId?: string,
): Promise<TTSGenerationResult> {
  log.info(
    formatTTSGenerationLogMessage({
      providerId: config.providerId,
      voice: config.voice,
      audioId,
      text,
    }),
  );
  return generateTTS(config, text);
}
