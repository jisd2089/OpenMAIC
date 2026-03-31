import { describe, expect, it } from 'vitest';
import {
  formatVideoGenerationLogMessage,
  normalizeServerVideoGenerationOptions,
} from '@/lib/server/video-generation';

describe('server video generation helpers', () => {
  it('normalizes video options against provider capabilities', () => {
    const normalized = normalizeServerVideoGenerationOptions('seedance', {
      prompt: 'Animate a linked list diagram',
      aspectRatio: '21:9',
      duration: 99,
      resolution: '4k' as never,
    });

    expect(normalized.aspectRatio).toBe('21:9');
    expect(normalized.duration).toBe(5);
    expect(normalized.resolution).toBe('480p');
  });

  it('formats the generation log message consistently', () => {
    const message = formatVideoGenerationLogMessage({
      providerId: 'seedance',
      model: 'doubao-seedance-1-5-pro-251215',
      options: {
        prompt: 'Animate a linked list diagram',
        duration: 5,
        aspectRatio: '16:9',
        resolution: '720p',
      },
    });

    expect(message).toContain('provider=seedance');
    expect(message).toContain('model=doubao-seedance-1-5-pro-251215');
    expect(message).toContain('duration=5');
    expect(message).toContain('aspect=16:9');
    expect(message).toContain('resolution=720p');
  });
});
