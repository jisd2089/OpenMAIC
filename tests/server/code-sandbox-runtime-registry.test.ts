import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  };
});

describe('aio runtime registry probing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    process.env = {
      ...originalEnv,
      OPENMAIC_CODE_SANDBOX_MODE: 'aio',
      OPENMAIC_CODE_SANDBOX_AIO_BACKEND: 'docker',
      OPENMAIC_CODE_SANDBOX_AIO_IMAGE:
        'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest',
      OPENMAIC_CODE_SANDBOX_AIO_DOCKER_SOCKET: '/var/run/docker.sock',
    };
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    const { resetAioRuntimeProbeCacheForTests } = await import('@/lib/server/code/runtime-registry');
    resetAioRuntimeProbeCacheForTests();
  });

  it('marks aio runtimes unavailable when the sandbox image lacks required commands', async () => {
    execFileSyncMock.mockReturnValue(
      [
        'node=1',
        'tsc=1',
        'python=1',
        'javac=0',
        'java=0',
        'gcc=1',
        'g++=1',
        'go=0',
        'rustc=1',
        'bash=1',
        'php=1',
        'ruby=1',
        'mcs=1',
        'mono=1',
        'kotlinc=1',
        'swiftc=1',
        'scalac=1',
        'scala=1',
      ].join('\n'),
    );

    const { listSupportedCodeRuntimes } = await import('@/lib/server/code/runtime-registry');
    const runtimes = listSupportedCodeRuntimes();

    expect(runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          language: 'java',
          available: false,
          disabledReason: expect.stringContaining('javac, java'),
        }),
        expect.objectContaining({
          language: 'go',
          available: false,
          disabledReason: expect.stringContaining('go'),
        }),
        expect.objectContaining({
          language: 'javascript',
          available: true,
        }),
        expect.objectContaining({
          language: 'csharp',
          available: true,
        }),
        expect.objectContaining({
          language: 'swift',
          available: true,
        }),
      ]),
    );
  });
});
