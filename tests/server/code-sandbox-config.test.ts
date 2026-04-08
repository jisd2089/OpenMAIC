import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  createJsonRequest,
  setupIsolatedWorkspace,
  teardownIsolatedWorkspace,
} from './test-utils';

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  };
});

function buildStage(id: string): Stage {
  return {
    id,
    name: 'Sandbox Config Course',
    description: 'Sandbox config test classroom',
    language: 'zh-CN',
    style: 'professional',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function buildScenes(stageId: string): Scene[] {
  return [
    {
      id: 'scene_1',
      stageId,
      type: 'slide',
      title: 'Sandbox Scene',
      order: 0,
      content: {
        type: 'slide',
        canvas: {
          id: 'slide_1',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#2563eb'],
            fontColor: '#111827',
            fontName: 'Microsoft YaHei',
          },
          elements: [],
        },
      },
      actions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

describe('code sandbox configuration', () => {
  let workspaceRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    process.env = { ...originalEnv };
    workspaceRoot = await setupIsolatedWorkspace('openmaic-code-sandbox-config-test-');
    const { persistClassroom } = await import('@/lib/server/classroom-storage');
    await persistClassroom(
      {
        id: 'sandbox_course',
        stage: buildStage('sandbox_course'),
        scenes: buildScenes('sandbox_course'),
      },
      'http://localhost',
    );
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    const { resetCodeSandboxProviderForTests } = await import('@/lib/server/code/provider');
    resetCodeSandboxProviderForTests();
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('stores code sessions under the configured workspace root', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_LOCAL_WORKSPACE_ROOT = './custom-sandbox-root';
    const { createOrRestoreCodeSession } = await import('@/lib/server/code/service');
    const { codeSessionJsonPath } = await import('@/lib/server/code/storage');

    const { session } = await createOrRestoreCodeSession({
      classroomId: 'sandbox_course',
      sceneId: 'scene_1',
      clientSessionId: 'teacher_tab',
      view: 'teacher',
      language: 'javascript',
    });

    expect(codeSessionJsonPath('sandbox_course', session.id)).toBe(
      path.resolve(
        'custom-sandbox-root',
        'classrooms',
        'sandbox_course',
        'code',
        'sessions',
        session.id,
        'meta',
        'session.json',
      ),
    );
  });

  it('disables shell runtime unless allowHostShell=true', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_LOCAL_ALLOW_HOST_SHELL = 'false';
    const sessionRoute = await import('@/app/api/classroom/[id]/code-sessions/route');
    const runRoute = await import('@/app/api/classroom/[id]/code-sessions/[sessionId]/run/route');

    const sessionResponse = await sessionRoute.POST(
      createJsonRequest('http://localhost/api/classroom/sandbox_course/code-sessions', 'POST', {
        sceneId: 'scene_1',
        clientSessionId: 'shell_tab',
        view: 'teacher',
        language: 'shell',
      }),
      { params: Promise.resolve({ id: 'sandbox_course' }) },
    );
    const sessionBody = await sessionResponse.json();

    const runResponse = await runRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/sandbox_course/code-sessions/${sessionBody.session.id}/run`,
        'POST',
        {
          language: 'shell',
          entrypoint: 'script.sh',
          stdin: '',
          files: [{ path: 'script.sh', content: "echo 'blocked'\n" }],
        },
      ),
      { params: Promise.resolve({ id: 'sandbox_course', sessionId: sessionBody.session.id }) },
    );

    expect(runResponse.status).toBe(500);
    await expect(runResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining('disabled by configuration'),
    });
  });

  it('marks disabled runtimes as unavailable in the session bootstrap payload', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_LOCAL_ALLOW_HOST_SHELL = 'false';
    const sessionRoute = await import('@/app/api/classroom/[id]/code-sessions/route');

    const response = await sessionRoute.POST(
      createJsonRequest('http://localhost/api/classroom/sandbox_course/code-sessions', 'POST', {
        sceneId: 'scene_1',
        clientSessionId: 'runtime_list_tab',
        view: 'teacher',
        language: 'javascript',
      }),
      { params: Promise.resolve({ id: 'sandbox_course' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          language: 'shell',
          available: false,
          disabledReason: expect.stringContaining('disabled'),
        }),
      ]),
    );
  });

  it('uses aio provider mode when aio docker mode is configured', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_MODE = 'aio';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_BACKEND = 'docker';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_IMAGE =
      'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest';
    const dockerRunCalls: string[] = [];
    execFileSyncMock.mockImplementation((command, args) => {
      const joined = [command, ...(args as string[])].join(' ');
      if (joined.includes('inspect -f {{.State.Running}}')) {
        throw new Error('container not found');
      }
      if (joined.includes('docker run -d --rm --name')) {
        dockerRunCalls.push(joined);
        return 'sandbox-container-id';
      }
      return '';
    });

    const { createOrRestoreCodeSession } = await import('@/lib/server/code/service');
    const { session } = await createOrRestoreCodeSession({
      classroomId: 'sandbox_course',
      sceneId: 'scene_1',
      clientSessionId: 'aio_tab',
      view: 'teacher',
      language: 'javascript',
    });

    expect(session.providerMode).toBe('aio');
    expect(session.sandboxId).toBe('sandbox_aio_global');
    expect(dockerRunCalls).toHaveLength(1);
    expect(dockerRunCalls[0]).toContain('--name openmaic-sandbox-sandbox_aio_global');
    expect(dockerRunCalls[0]).toContain('--security-opt seccomp=unconfined');
    expect(dockerRunCalls[0]).toContain('--add-host host.docker.internal:host-gateway');
    expect(dockerRunCalls[0]).toContain('--shm-size=1g');
  });

  it('reuses one shared aio sandbox container across browser sessions', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_MODE = 'aio';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_BACKEND = 'docker';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_IMAGE = 'openmaic-sandbox:20260404';
    const dockerRunCalls: string[] = [];
    const runningStates = ['false', 'false', 'true'];
    execFileSyncMock.mockImplementation((command, args) => {
      const joined = [command, ...(args as string[])].join(' ');
      if (joined.includes('inspect -f {{.State.Running}} openmaic-sandbox-sandbox_aio_global')) {
        return runningStates.shift() ?? 'true';
      }
      if (
        joined.includes(
          'inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} openmaic-sandbox-sandbox_aio_global',
        )
      ) {
        return 'healthy';
      }
      if (joined.includes('docker run -d --rm --name openmaic-sandbox-sandbox_aio_global')) {
        dockerRunCalls.push(joined);
        return 'sandbox-container-id';
      }
      return '';
    });

    const { createOrRestoreCodeSession } = await import('@/lib/server/code/service');
    const first = await createOrRestoreCodeSession({
      classroomId: 'sandbox_course',
      sceneId: 'scene_1',
      clientSessionId: 'aio_tab_1',
      view: 'teacher',
      language: 'javascript',
    });
    const second = await createOrRestoreCodeSession({
      classroomId: 'sandbox_course',
      sceneId: 'scene_1',
      clientSessionId: 'aio_tab_2',
      view: 'teacher',
      language: 'javascript',
    });

    expect(first.session.sandboxId).toBe('sandbox_aio_global');
    expect(second.session.sandboxId).toBe('sandbox_aio_global');
    expect(dockerRunCalls).toHaveLength(1);
  });

  it('rejects invalid provisioner configuration instead of silently falling back', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_MODE = 'aio';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_BACKEND = 'provisioner';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL = '';

    const { createOrRestoreCodeSession } = await import('@/lib/server/code/service');

    await expect(
      createOrRestoreCodeSession({
        classroomId: 'sandbox_course',
        sceneId: 'scene_1',
        clientSessionId: 'invalid_provisioner_tab',
        view: 'teacher',
        language: 'javascript',
      }),
    ).rejects.toThrow('OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL is required');
  });

  it('recycles unhealthy aio sandbox containers before reusing the session', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_MODE = 'aio';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_BACKEND = 'docker';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_IMAGE =
      'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest';
    const dockerCalls: string[] = [];
    let inspectRunningCount = 0;
    execFileSyncMock.mockImplementation((command, args) => {
      const joined = [command, ...(args as string[])].join(' ');
      dockerCalls.push(joined);
      if (joined.includes('inspect -f {{.State.Running}}')) {
        inspectRunningCount += 1;
        return inspectRunningCount === 1 ? 'true' : 'false';
      }
      if (joined.includes('inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')) {
        return 'unhealthy';
      }
      if (joined.includes('docker stop openmaic-sandbox-sandbox_aio_global')) {
        return 'stopped';
      }
      if (joined.includes('docker run -d --rm --name openmaic-sandbox-sandbox_aio_global')) {
        return 'sandbox-container-id';
      }
      return '';
    });

    const { createOrRestoreCodeSession } = await import('@/lib/server/code/service');
    const { session } = await createOrRestoreCodeSession({
      classroomId: 'sandbox_course',
      sceneId: 'scene_1',
      clientSessionId: 'aio_unhealthy_tab',
      view: 'teacher',
      language: 'javascript',
    });

    expect(session.providerMode).toBe('aio');
    expect(dockerCalls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('inspect -f {{.State.Running}} openmaic-sandbox-sandbox_aio_global'),
        expect.stringContaining(
          'inspect -f {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} openmaic-sandbox-sandbox_aio_global',
        ),
        expect.stringContaining('docker stop openmaic-sandbox-sandbox_aio_global'),
        expect.stringContaining('docker run -d --rm --name openmaic-sandbox-sandbox_aio_global'),
      ]),
    );
  });

  it('normalizes stale aio session state without stopping the shared sandbox container', async () => {
    process.env.OPENMAIC_CODE_SANDBOX_MODE = 'aio';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_BACKEND = 'docker';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_IMAGE = 'openmaic-sandbox:20260404';
    process.env.OPENMAIC_CODE_SANDBOX_AIO_IDLE_TIMEOUT_SEC = '60';

    const staleTimestamp = new Date(Date.now() - 10 * 60_000).toISOString();
    const { writeCodeExecution, writeCodeSession, readCodeSession } = await import(
      '@/lib/server/code/storage'
    );
    await writeCodeSession({
      id: 'idle_timeout_tab',
      classroomId: 'sandbox_course',
      sceneId: 'scene_1',
      clientSessionId: 'idle_timeout_tab',
      view: 'teacher',
      providerMode: 'aio',
      sandboxId: 'sandbox_aio_global',
      language: 'javascript',
      entrypoint: 'index.js',
      stdin: '',
      files: [{ path: 'index.js', content: "console.log('idle');\n" }],
      status: 'running',
      lastExecutionId: 'exec_idle_terminal',
      createdAt: staleTimestamp,
      updatedAt: staleTimestamp,
    });
    await writeCodeExecution({
      id: 'exec_idle_terminal',
      classroomId: 'sandbox_course',
      sessionId: 'idle_timeout_tab',
      language: 'javascript',
      entrypoint: 'index.js',
      status: 'succeeded',
      exitCode: 0,
      stdout: 'idle\n',
      stderr: '',
      previewMode: 'terminal',
      previewUrl: null,
      previewToken: null,
      artifacts: [],
      startedAt: staleTimestamp,
      finishedAt: staleTimestamp,
    });

    const { sweepIdleAioSandboxSessions } = await import('@/lib/server/code/provider');
    await sweepIdleAioSandboxSessions();

    const session = await readCodeSession('sandbox_course', 'idle_timeout_tab');
    expect(session?.status).toBe('ready');
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});
