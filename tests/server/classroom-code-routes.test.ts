import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';
import {
  createJsonRequest,
  setupIsolatedWorkspace,
  teardownIsolatedWorkspace,
} from './test-utils';

function buildStage(id: string): Stage {
  return {
    id,
    name: 'Code Classroom',
    description: 'Code runner test classroom',
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
      title: 'Code Scene',
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

async function waitForExecutionResult(input: {
  classroomId: string;
  sessionId: string;
  executionId: string;
}) {
  const executionRoute = await import(
    '@/app/api/classroom/[id]/code-sessions/[sessionId]/executions/[executionId]/route'
  );

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await executionRoute.GET(new Request('http://localhost'), {
      params: Promise.resolve({
        id: input.classroomId,
        sessionId: input.sessionId,
        executionId: input.executionId,
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    if (body.execution.status !== 'queued' && body.execution.status !== 'running') {
      return body.execution;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Execution did not finish in time');
}

describe('classroom code session routes', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    workspaceRoot = await setupIsolatedWorkspace('openmaic-classroom-code-test-');
    const { persistClassroom } = await import('@/lib/server/classroom-storage');
    await persistClassroom(
      {
        id: 'code_course',
        stage: buildStage('code_course'),
        scenes: buildScenes('code_course'),
      },
      'http://localhost',
    );
  });

  afterEach(async () => {
    await teardownIsolatedWorkspace(workspaceRoot);
  });

  it('creates or restores a code session with runtime metadata', async () => {
    const sessionRoute = await import('@/app/api/classroom/[id]/code-sessions/route');

    const response = await sessionRoute.POST(
      createJsonRequest('http://localhost/api/classroom/code_course/code-sessions', 'POST', {
        sceneId: 'scene_1',
        clientSessionId: 'tab_teacher',
        view: 'teacher',
        language: 'javascript',
      }),
      { params: Promise.resolve({ id: 'code_course' }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.session.sceneId).toBe('scene_1');
    expect(body.session.language).toBe('javascript');
    expect(body.session.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'index.js',
        }),
      ]),
    );
    expect(body.runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          language: 'javascript',
        }),
        expect.objectContaining({
          language: 'html',
          previewMode: 'web',
        }),
      ]),
    );
  });

  it('runs javascript code and exposes terminal output through polling', async () => {
    const sessionRoute = await import('@/app/api/classroom/[id]/code-sessions/route');
    const runRoute = await import('@/app/api/classroom/[id]/code-sessions/[sessionId]/run/route');

    const sessionResponse = await sessionRoute.POST(
      createJsonRequest('http://localhost/api/classroom/code_course/code-sessions', 'POST', {
        sceneId: 'scene_1',
        clientSessionId: 'tab_js',
        view: 'teacher',
        language: 'javascript',
      }),
      { params: Promise.resolve({ id: 'code_course' }) },
    );
    const sessionBody = await sessionResponse.json();

    const runResponse = await runRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/code_course/code-sessions/${sessionBody.session.id}/run`,
        'POST',
        {
          language: 'javascript',
          entrypoint: 'index.js',
          stdin: '',
          files: [{ path: 'index.js', content: "console.log('hello code classroom');\n" }],
        },
      ),
      { params: Promise.resolve({ id: 'code_course', sessionId: sessionBody.session.id }) },
    );

    expect(runResponse.status).toBe(200);
    const runBody = await runResponse.json();
    const execution = await waitForExecutionResult({
      classroomId: 'code_course',
      sessionId: sessionBody.session.id,
      executionId: runBody.execution.id,
    });

    expect(execution.status).toBe('succeeded');
    expect(execution.previewMode).toBe('terminal');
    expect(execution.stdout).toContain('hello code classroom');
  });

  it('runs html code and serves preview assets', async () => {
    const sessionRoute = await import('@/app/api/classroom/[id]/code-sessions/route');
    const runRoute = await import('@/app/api/classroom/[id]/code-sessions/[sessionId]/run/route');
    const previewRoute = await import('@/app/api/code-preview/[token]/[[...assetPath]]/route');

    const sessionResponse = await sessionRoute.POST(
      createJsonRequest('http://localhost/api/classroom/code_course/code-sessions', 'POST', {
        sceneId: 'scene_1',
        clientSessionId: 'tab_html',
        view: 'teacher',
        language: 'html',
      }),
      { params: Promise.resolve({ id: 'code_course' }) },
    );
    const sessionBody = await sessionResponse.json();

    const runResponse = await runRoute.POST(
      createJsonRequest(
        `http://localhost/api/classroom/code_course/code-sessions/${sessionBody.session.id}/run`,
        'POST',
        {
          language: 'html',
          entrypoint: 'index.html',
          stdin: '',
          files: [
            {
              path: 'index.html',
              content:
                '<!doctype html><html><body><main>Hello HTML Preview</main></body></html>',
            },
          ],
        },
      ),
      { params: Promise.resolve({ id: 'code_course', sessionId: sessionBody.session.id }) },
    );

    expect(runResponse.status).toBe(200);
    const runBody = await runResponse.json();
    expect(runBody.execution.status).toBe('succeeded');
    expect(runBody.execution.previewUrl).toContain('/api/code-preview/');

    const token = String(runBody.execution.previewUrl).split('/api/code-preview/')[1];
    const previewResponse = await previewRoute.GET(new Request('http://localhost'), {
      params: Promise.resolve({ token }),
    });
    expect(previewResponse.status).toBe(200);
    await expect(previewResponse.text()).resolves.toContain('Hello HTML Preview');
  });
});
