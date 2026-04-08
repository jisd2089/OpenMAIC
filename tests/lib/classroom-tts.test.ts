import { describe, expect, it } from 'vitest';
import { resolveClassroomTTSConfig } from '@/lib/audio/classroom-tts';

describe('resolveClassroomTTSConfig', () => {
  it('keeps the selected provider when it is directly usable', () => {
    const result = resolveClassroomTTSConfig({
      ttsEnabled: true,
      ttsProviderId: 'qwen-tts',
      ttsVoice: 'Cherry',
      ttsSpeed: 1,
      ttsProvidersConfig: {
        'openai-tts': { apiKey: '', baseUrl: '' },
        'azure-tts': { apiKey: '', baseUrl: '' },
        'glm-tts': { apiKey: '', baseUrl: '' },
        'qwen-tts': { apiKey: 'local-key', baseUrl: 'https://example.com' },
        'elevenlabs-tts': { apiKey: '', baseUrl: '' },
        'browser-native-tts': { apiKey: '', baseUrl: '' },
      },
    });

    expect(result).toMatchObject({
      providerId: 'qwen-tts',
      voice: 'Cherry',
      source: 'selected',
      apiKey: 'local-key',
      baseUrl: 'https://example.com',
    });
  });

  it('falls back from browser-native to the first server-configured provider', () => {
    const result = resolveClassroomTTSConfig({
      ttsEnabled: true,
      ttsProviderId: 'browser-native-tts',
      ttsVoice: 'default',
      ttsSpeed: 1,
      ttsProvidersConfig: {
        'openai-tts': { apiKey: '', baseUrl: '', isServerConfigured: true },
        'azure-tts': { apiKey: '', baseUrl: '' },
        'glm-tts': { apiKey: '', baseUrl: '' },
        'qwen-tts': { apiKey: '', baseUrl: '' },
        'elevenlabs-tts': { apiKey: '', baseUrl: '' },
        'browser-native-tts': { apiKey: '', baseUrl: '' },
      },
    });

    expect(result).toMatchObject({
      providerId: 'openai-tts',
      source: 'server-fallback',
    });
  });

  it('returns null when no non-browser classroom TTS is available', () => {
    const result = resolveClassroomTTSConfig({
      ttsEnabled: true,
      ttsProviderId: 'browser-native-tts',
      ttsVoice: 'default',
      ttsSpeed: 1,
      ttsProvidersConfig: {
        'openai-tts': { apiKey: '', baseUrl: '' },
        'azure-tts': { apiKey: '', baseUrl: '' },
        'glm-tts': { apiKey: '', baseUrl: '' },
        'qwen-tts': { apiKey: '', baseUrl: '' },
        'elevenlabs-tts': { apiKey: '', baseUrl: '' },
        'browser-native-tts': { apiKey: '', baseUrl: '' },
      },
    });

    expect(result).toBeNull();
  });
});
