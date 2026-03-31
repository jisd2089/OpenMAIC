import { beforeEach, describe, expect, it, vi } from 'vitest';

let yamlOverride: string | null = null;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const isYaml = (p: unknown) => typeof p === 'string' && p.endsWith('server-providers.yml');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
      readFileSync: (p: string, ...args: unknown[]) =>
        isYaml(p)
          ? (yamlOverride ?? '')
          : (actual.readFileSync as (...innerArgs: unknown[]) => unknown)(p, ...args),
    },
    existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
    readFileSync: (p: string, ...args: unknown[]) =>
      isYaml(p)
        ? (yamlOverride ?? '')
        : (actual.readFileSync as (...innerArgs: unknown[]) => unknown)(p, ...args),
  };
});

describe('resolveModel', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    yamlOverride = null;
  });

  it('uses the first server-configured provider/model when no explicit model is provided', async () => {
    yamlOverride = `
providers:
  qwen:
    apiKey: sk-qwen
    models:
      - qwen-max
`;

    const { resolveModel } = await import('@/lib/server/resolve-model');

    const result = resolveModel({});
    expect(result.modelString).toBe('qwen:qwen-max');
    expect(result.apiKey).toBe('sk-qwen');
  });

  it('falls back to the built-in first model when the server provider does not restrict models', async () => {
    yamlOverride = `
providers:
  anthropic:
    apiKey: sk-anthropic
`;

    const { resolveModel } = await import('@/lib/server/resolve-model');

    const result = resolveModel({});
    expect(result.modelString.startsWith('anthropic:')).toBe(true);
    expect(result.apiKey).toBe('sk-anthropic');
  });

  it('still respects DEFAULT_MODEL when explicitly configured', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'openai:gpt-4o-mini');
    yamlOverride = `
providers:
  qwen:
    apiKey: sk-qwen
    models:
      - qwen-max
`;

    const { resolveModel } = await import('@/lib/server/resolve-model');

    const result = resolveModel({});
    expect(result.modelString).toBe('openai:gpt-4o-mini');
  });
});
