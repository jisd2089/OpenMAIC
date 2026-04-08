import { DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';

export interface ClassroomTTSProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  isServerConfigured?: boolean;
}

export interface ClassroomTTSSettings {
  ttsEnabled: boolean;
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed?: number;
  ttsProvidersConfig: Record<TTSProviderId, ClassroomTTSProviderConfig>;
}

export interface EffectiveClassroomTTSConfig {
  providerId: TTSProviderId;
  voice: string;
  speed?: number;
  apiKey?: string;
  baseUrl?: string;
  source: 'selected' | 'server-fallback' | 'client-fallback';
}

function isUsableClassroomTTSProvider(
  providerId: TTSProviderId,
  config: ClassroomTTSProviderConfig | undefined,
): boolean {
  if (providerId === 'browser-native-tts') {
    return false;
  }
  return Boolean(config?.isServerConfigured || config?.apiKey?.trim());
}

function resolveVoice(providerId: TTSProviderId, voice: string | undefined): string {
  if (providerId === 'browser-native-tts') {
    return 'default';
  }

  const provider = TTS_PROVIDERS[providerId];
  if (!provider) {
    return DEFAULT_TTS_VOICES[providerId];
  }

  if (voice && provider.voices.some((item) => item.id === voice)) {
    return voice;
  }

  return DEFAULT_TTS_VOICES[providerId] || provider.voices[0]?.id || 'default';
}

function findFallbackProvider(
  configs: Record<TTSProviderId, ClassroomTTSProviderConfig>,
): { providerId: TTSProviderId; source: EffectiveClassroomTTSConfig['source'] } | null {
  for (const providerId of Object.keys(TTS_PROVIDERS) as TTSProviderId[]) {
    if (providerId === 'browser-native-tts') continue;
    if (configs[providerId]?.isServerConfigured) {
      return { providerId, source: 'server-fallback' };
    }
  }

  for (const providerId of Object.keys(TTS_PROVIDERS) as TTSProviderId[]) {
    if (providerId === 'browser-native-tts') continue;
    if (configs[providerId]?.apiKey?.trim()) {
      return { providerId, source: 'client-fallback' };
    }
  }

  return null;
}

export function resolveClassroomTTSConfig(
  settings: ClassroomTTSSettings,
): EffectiveClassroomTTSConfig | null {
  if (!settings.ttsEnabled) {
    return null;
  }

  const selectedConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
  if (isUsableClassroomTTSProvider(settings.ttsProviderId, selectedConfig)) {
    return {
      providerId: settings.ttsProviderId,
      voice: resolveVoice(settings.ttsProviderId, settings.ttsVoice),
      speed: settings.ttsSpeed,
      apiKey: selectedConfig?.apiKey?.trim() || undefined,
      baseUrl: selectedConfig?.baseUrl?.trim() || undefined,
      source: 'selected',
    };
  }

  const fallback = findFallbackProvider(settings.ttsProvidersConfig);
  if (!fallback) {
    return null;
  }

  const fallbackConfig = settings.ttsProvidersConfig[fallback.providerId];
  return {
    providerId: fallback.providerId,
    voice: resolveVoice(fallback.providerId, undefined),
    speed: settings.ttsSpeed,
    apiKey: fallbackConfig?.apiKey?.trim() || undefined,
    baseUrl: fallbackConfig?.baseUrl?.trim() || undefined,
    source: fallback.source,
  };
}
