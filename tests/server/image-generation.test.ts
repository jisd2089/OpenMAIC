import { describe, expect, it } from 'vitest';
import {
  formatImageGenerationLogMessage,
  normalizeImageGenerationOptions,
} from '@/lib/server/image-generation';

describe('server image generation helpers', () => {
  it('normalizes aspect ratio to explicit dimensions before generation', () => {
    const normalized = normalizeImageGenerationOptions({
      prompt: 'A diagram of a linked list',
      aspectRatio: '16:9',
    });

    expect(normalized.width).toBe(1024);
    expect(normalized.height).toBe(576);
  });

  it('preserves explicit dimensions when they are already provided', () => {
    const normalized = normalizeImageGenerationOptions({
      prompt: 'A diagram of a linked list',
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
    });

    expect(normalized.width).toBe(1280);
    expect(normalized.height).toBe(720);
  });

  it('formats the generation log message consistently', () => {
    const message = formatImageGenerationLogMessage({
      providerId: 'qwen-image',
      model: 'qwen-image-max',
      options: {
        prompt: 'A diagram of a singly linked list',
        width: 1024,
        height: 576,
      },
    });

    expect(message).toContain('provider=qwen-image');
    expect(message).toContain('model=qwen-image-max');
    expect(message).toContain('size=1024x576');
    expect(message).toContain('prompt="A diagram of a singly linked list...');
  });
});
