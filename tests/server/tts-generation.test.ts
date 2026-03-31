import { describe, expect, it } from 'vitest';
import { formatTTSGenerationLogMessage } from '@/lib/server/tts-generation';

describe('server tts generation helpers', () => {
  it('formats the generation log message consistently', () => {
    const message = formatTTSGenerationLogMessage({
      providerId: 'qwen-tts',
      voice: 'Cherry',
      audioId: 'tts_scene_1',
      text: '链表是一种线性数据结构。',
    });

    expect(message).toContain('provider=qwen-tts');
    expect(message).toContain('voice=Cherry');
    expect(message).toContain('audioId=tts_scene_1');
    expect(message).toContain('textLen=12');
  });
});
