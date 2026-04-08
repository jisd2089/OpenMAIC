import { randomUUID } from 'crypto';
import { execFileSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';
import { getCodeLanguageCatalogEntry } from '@/lib/code/runtime-catalog';
import { createLogger } from '@/lib/logger';
import {
  getCodeSandboxConfig,
  getCodeSandboxWorkspaceRoot,
  type CodeSandboxConfig,
  validateCodeSandboxConfig,
} from '@/lib/server/code/config';
import { clearActiveExecution, registerActiveExecution } from '@/lib/server/code/execution-manager';
import { SERVER_CODE_RUNTIMES } from '@/lib/server/code/runtime-registry';
import {
  codeSessionDir,
  codeSessionOutputsDir,
  codeSessionWorkspaceDir,
  listPersistedCodeSessions,
  listExecutionArtifacts,
  readCodeExecution,
  writeCodeSession,
  writeCodeExecution,
  writeSessionFiles,
} from '@/lib/server/code/storage';
import type { PersistedCodeExecution, PersistedCodeSession } from '@/lib/server/code/types';

const log = createLogger('CodeSandbox');
const EXECUTION_TIMEOUT_MS = 60_000;
const AIO_SANDBOX_CONTAINER_PREFIX = 'openmaic-sandbox';
let idleJanitorTimer: NodeJS.Timeout | null = null;

export interface ClassroomCodeSandboxProvider {
  readonly mode: 'local' | 'aio';
  prepareSession?(input: {
    classroomId: string;
    session: PersistedCodeSession;
    origin?: string;
  }): Promise<void>;
  releaseSession?(input: {
    classroomId: string;
    session: PersistedCodeSession;
  }): Promise<void>;
  runSession(input: {
    classroomId: string;
    session: PersistedCodeSession;
    origin: string;
  }): Promise<PersistedCodeExecution>;
}

interface ExecutionStep {
  command: string;
  args: string[];
}

async function ensureCleanDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

function buildPreviewToken(classroomId: string, sessionId: string, executionId: string) {
  return Buffer.from(JSON.stringify({ classroomId, sessionId, executionId }), 'utf8').toString(
    'base64url',
  );
}

function joinPosix(...segments: string[]) {
  return path.posix.join(...segments);
}

function normalizePreviewBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

function buildPreviewUrl(input: {
  mode: 'local' | 'aio';
  config: CodeSandboxConfig;
  origin: string;
  token: string;
}) {
  const baseUrl =
    input.mode === 'aio'
      ? normalizePreviewBaseUrl(input.config.aio.previewBaseUrl)
      : `${input.origin}/api/code-preview`;
  return `${baseUrl}/${input.token}`;
}

function buildExecutionRecord(input: {
  classroomId: string;
  session: PersistedCodeSession;
  executionId: string;
  status: PersistedCodeExecution['status'];
  previewMode: PersistedCodeExecution['previewMode'];
  previewUrl?: string | null;
  previewToken?: string | null;
}) {
  return {
    id: input.executionId,
    classroomId: input.classroomId,
    sessionId: input.session.id,
    language: input.session.language,
    entrypoint: input.session.entrypoint,
    status: input.status,
    exitCode: null,
    stdout: '',
    stderr: '',
    previewMode: input.previewMode,
    previewUrl: input.previewUrl ?? null,
    previewToken: input.previewToken ?? null,
    artifacts: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  } satisfies PersistedCodeExecution;
}

async function createHtmlPreviewExecution(input: {
  classroomId: string;
  session: PersistedCodeSession;
  origin: string;
  mode: 'local' | 'aio';
  config: CodeSandboxConfig;
}): Promise<PersistedCodeExecution> {
  const executionId = randomUUID();
  const outputsDir = path.join(codeSessionOutputsDir(input.classroomId, input.session.id), executionId);
  await ensureCleanDir(outputsDir);
  await writeSessionFiles(input.classroomId, input.session.id, input.session.files);

  for (const file of input.session.files) {
    const sourcePath = path.join(codeSessionWorkspaceDir(input.classroomId, input.session.id), file.path);
    const targetPath = path.join(outputsDir, file.path);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
  }

  const token = buildPreviewToken(input.classroomId, input.session.id, executionId);
  const execution: PersistedCodeExecution = {
    ...buildExecutionRecord({
      classroomId: input.classroomId,
      session: input.session,
      executionId,
      status: 'succeeded',
      previewMode: 'web',
      previewUrl: buildPreviewUrl({
        mode: input.mode,
        config: input.config,
        origin: input.origin,
        token,
      }),
      previewToken: token,
    }),
    exitCode: 0,
    artifacts: await listExecutionArtifacts(input.classroomId, input.session.id, executionId),
    finishedAt: new Date().toISOString(),
  };
  await writeCodeExecution(execution);
  return execution;
}

function buildDockerHostValue(socketPath: string) {
  if (!socketPath) return null;
  if (socketPath.startsWith('unix://') || socketPath.startsWith('tcp://') || socketPath.startsWith('npipe://')) {
    return socketPath;
  }
  if (socketPath.startsWith('\\\\.\\pipe\\')) {
    return `npipe://${socketPath.replaceAll('\\', '/')}`;
  }
  if (path.isAbsolute(socketPath)) {
    return `unix://${socketPath}`;
  }
  return null;
}

function getCurrentContainerId() {
  let hostname = '';
  try {
    hostname = readFileSync('/etc/hostname', 'utf8').trim();
  } catch {
    hostname = process.env.HOSTNAME?.trim() || '';
  }
  if (!hostname) return null;
  return /^[a-f0-9]{12,64}$/i.test(hostname) ? hostname : null;
}

function sandboxContainerName(sandboxId: string) {
  return `${AIO_SANDBOX_CONTAINER_PREFIX}-${sandboxId}`;
}

function getDockerCommandEnv(socketPath: string) {
  const dockerHost = buildDockerHostValue(socketPath);
  return dockerHost ? { ...process.env, DOCKER_HOST: dockerHost } : process.env;
}

function runDockerControlCommand(args: string[], config: CodeSandboxConfig) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: getDockerCommandEnv(config.aio.dockerSocketPath),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isDockerContainerRunning(containerName: string, config: CodeSandboxConfig) {
  try {
    const output = runDockerControlCommand(
      ['inspect', '-f', '{{.State.Running}}', containerName],
      config,
    );
    return output.toLowerCase() === 'true';
  } catch {
    return false;
  }
}

function getDockerContainerHealth(containerName: string, config: CodeSandboxConfig) {
  try {
    const output = runDockerControlCommand(
      ['inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', containerName],
      config,
    );
    return output.toLowerCase();
  } catch {
    return null;
  }
}

async function waitForDockerContainerHealthy(
  containerName: string,
  config: CodeSandboxConfig,
  timeoutMs = 20_000,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const health = getDockerContainerHealth(containerName, config);
    if (health === null || health === 'none' || health === 'healthy') {
      return true;
    }
    if (health === 'unhealthy') {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

function isTerminalExecutionStatus(status: PersistedCodeExecution['status']) {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'timed_out' ||
    status === 'stopped'
  );
}

export async function sweepIdleAioSandboxSessions(config = validateCodeSandboxConfig(getCodeSandboxConfig())) {
  if (config.mode !== 'aio' || config.aio.backend !== 'docker') {
    return;
  }
  if (config.aio.idleTimeoutSec <= 0) {
    return;
  }

  const sessions = await listPersistedCodeSessions();
  const cutoff = Date.now() - config.aio.idleTimeoutSec * 1000;
  for (const session of sessions) {
    if (session.providerMode !== 'aio' || !session.sandboxId) {
      continue;
    }

    const updatedAt = Date.parse(session.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt > cutoff) {
      continue;
    }

    const lastExecution = session.lastExecutionId
      ? await readCodeExecution(session.classroomId, session.id, session.lastExecutionId)
      : null;
    const sessionCanRecycle =
      session.status === 'released' ||
      session.status === 'ready' ||
      (session.status === 'running' && !!lastExecution && isTerminalExecutionStatus(lastExecution.status));

    if (!sessionCanRecycle) {
      continue;
    }

    if (session.status === 'running' && lastExecution && isTerminalExecutionStatus(lastExecution.status)) {
      await writeCodeSession({
        ...session,
        status: 'ready',
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

function ensureIdleAioJanitorStarted(config: CodeSandboxConfig) {
  if (config.mode !== 'aio' || config.aio.backend !== 'docker' || config.aio.idleTimeoutSec <= 0) {
    return;
  }
  if (idleJanitorTimer) {
    return;
  }
  const intervalMs = Math.max(30_000, Math.min(config.aio.idleTimeoutSec * 500, 300_000));
  idleJanitorTimer = setInterval(() => {
    void sweepIdleAioSandboxSessions(config).catch((error) => {
      log.warn('Idle AIO sandbox sweep failed:', error);
    });
  }, intervalMs);
  idleJanitorTimer.unref?.();
}

export function resetIdleAioJanitorForTests() {
  if (idleJanitorTimer) {
    clearInterval(idleJanitorTimer);
    idleJanitorTimer = null;
  }
}

async function runExecutionInBackground(input: {
  classroomId: string;
  session: PersistedCodeSession;
  executionId: string;
  previewMode: PersistedCodeExecution['previewMode'];
  buildCommands: () => ExecutionStep[];
  runStep: (
    step: ExecutionStep,
    handlers: {
      onStdout: (chunk: string) => void;
      onStderr: (chunk: string) => void;
      executionId: string;
      stdin: string;
    },
  ) => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}) {
  const outputsDir = path.join(codeSessionOutputsDir(input.classroomId, input.session.id), input.executionId);
  await ensureCleanDir(outputsDir);
  await writeSessionFiles(input.classroomId, input.session.id, input.session.files);

  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  const runningExecution: PersistedCodeExecution = {
    ...buildExecutionRecord({
      classroomId: input.classroomId,
      session: input.session,
      executionId: input.executionId,
      status: 'running',
      previewMode: input.previewMode,
    }),
  };
  await writeCodeExecution(runningExecution);

  for (const step of input.buildCommands()) {
    const stepResult = await input.runStep(step, {
      onStdout: (chunk) => {
        stdout += chunk;
      },
      onStderr: (chunk) => {
        stderr += chunk;
      },
      executionId: input.executionId,
      stdin: input.session.stdin,
    });

    if (stepResult.signal === 'SIGTERM') {
      const current = await readCodeExecution(input.classroomId, input.session.id, input.executionId);
      if (current?.status === 'stopped') {
        return;
      }
      await writeCodeExecution({
        ...runningExecution,
        status: 'timed_out',
        stdout,
        stderr,
        exitCode: null,
        artifacts: await listExecutionArtifacts(input.classroomId, input.session.id, input.executionId),
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    exitCode = stepResult.code;
    if (exitCode !== 0) {
      const current = await readCodeExecution(input.classroomId, input.session.id, input.executionId);
      if (current?.status === 'stopped') {
        return;
      }
      await writeCodeExecution({
        ...runningExecution,
        status: 'failed',
        stdout,
        stderr,
        exitCode,
        artifacts: await listExecutionArtifacts(input.classroomId, input.session.id, input.executionId),
        finishedAt: new Date().toISOString(),
      });
      return;
    }
  }

  await writeCodeExecution({
    ...runningExecution,
    status: 'succeeded',
    stdout,
    stderr,
    exitCode,
    artifacts: await listExecutionArtifacts(input.classroomId, input.session.id, input.executionId),
    finishedAt: new Date().toISOString(),
  });
}

async function spawnCommandStep(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdin: string;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
  executionId: string;
}) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...(input.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    registerActiveExecution(input.executionId, child);
    let killedByTimeout = false;
    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill();
    }, EXECUTION_TIMEOUT_MS);

    if (input.stdin) {
      child.stdin.write(input.stdin);
    }
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      input.onStdout(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      input.onStderr(chunk.toString());
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      clearActiveExecution(input.executionId);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearActiveExecution(input.executionId);
      if (killedByTimeout) {
        resolve({ code: null, signal: 'SIGTERM' });
        return;
      }
      resolve({ code, signal });
    });
  });
}

class LocalCodeSandboxProvider implements ClassroomCodeSandboxProvider {
  readonly mode = 'local' as const;

  constructor(private readonly config: CodeSandboxConfig) {}

  async runSession(input: {
    classroomId: string;
    session: PersistedCodeSession;
    origin: string;
  }) {
    const entry = getCodeLanguageCatalogEntry(input.session.language);
    if (entry.previewMode === 'web') {
      return createHtmlPreviewExecution({
        ...input,
        mode: this.mode,
        config: this.config,
      });
    }
    if (input.session.language === 'shell' && !this.config.local.allowHostShell) {
      throw new Error(
        'Shell runtime is disabled. Set OPENMAIC_CODE_SANDBOX_LOCAL_ALLOW_HOST_SHELL=true to enable it.',
      );
    }

    const executionId = randomUUID();
    const execution = buildExecutionRecord({
      classroomId: input.classroomId,
      session: input.session,
      executionId,
      status: 'queued',
      previewMode: entry.previewMode,
    });
    await writeCodeExecution(execution);

    const workspaceDir = codeSessionWorkspaceDir(input.classroomId, input.session.id);
    const outputsDir = path.join(codeSessionOutputsDir(input.classroomId, input.session.id), executionId);

    void runExecutionInBackground({
      classroomId: input.classroomId,
      session: input.session,
      executionId,
      previewMode: entry.previewMode,
      buildCommands: () =>
        SERVER_CODE_RUNTIMES[input.session.language].buildCommands({
          workspaceDir,
          outputsDir,
          entrypoint: input.session.entrypoint,
          sandboxMode: this.mode,
        }),
      runStep: (step, handlers) =>
        spawnCommandStep({
          command: step.command,
          args: step.args,
          cwd: workspaceDir,
          stdin: handlers.stdin,
          onStdout: handlers.onStdout,
          onStderr: handlers.onStderr,
          executionId: handlers.executionId,
        }),
    }).catch(async (error) => {
      log.error('Background local code execution failed', error);
      const current = await readCodeExecution(input.classroomId, input.session.id, executionId);
      if (current?.status === 'stopped') {
        return;
      }
      await writeCodeExecution({
        ...execution,
        status: 'failed',
        stderr: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      });
    });

    return execution;
  }
}

class DockerAioCodeSandboxProvider implements ClassroomCodeSandboxProvider {
  readonly mode = 'aio' as const;

  constructor(private readonly config: CodeSandboxConfig) {}

  private getSessionPaths(input: { classroomId: string; sessionId: string; sandboxId: string }) {
    const hostWorkspaceRoot = getCodeSandboxWorkspaceRoot(this.config);
    const hostSessionDir = codeSessionDir(input.classroomId, input.sessionId);
    const currentContainerId = getCurrentContainerId();
    const containerRootDir = currentContainerId
      ? hostWorkspaceRoot.replaceAll('\\', '/')
      : this.config.aio.workdirMountPath;
    const containerSessionDir = joinPosix(
      containerRootDir,
      'classrooms',
      input.classroomId,
      'code',
      'sessions',
      input.sessionId,
    );

    return {
      hostWorkspaceRoot,
      hostSessionDir,
      currentContainerId,
      containerRootDir,
      containerSessionDir,
      containerName: sandboxContainerName(input.sandboxId),
      containerWorkspaceDir: joinPosix(containerSessionDir, 'workspace'),
    };
  }

  private async ensureSandboxContainer(input: {
    classroomId: string;
    session: PersistedCodeSession;
  }) {
    if (!input.session.sandboxId) {
      throw new Error('AIO sandbox session is missing sandboxId');
    }

    const paths = this.getSessionPaths({
      classroomId: input.classroomId,
      sessionId: input.session.id,
      sandboxId: input.session.sandboxId,
    });

    if (isDockerContainerRunning(paths.containerName, this.config)) {
      const health = getDockerContainerHealth(paths.containerName, this.config);
      if (health !== 'unhealthy') {
        return paths;
      }
      try {
        runDockerControlCommand(['stop', paths.containerName], this.config);
        log.warn(`Recycling unhealthy AIO sandbox container ${paths.containerName}`);
      } catch (error) {
        log.warn(`Failed to stop unhealthy AIO sandbox container ${paths.containerName}:`, error);
      }
    }

    if (isDockerContainerRunning(paths.containerName, this.config)) {
      return paths;
    }

    await writeSessionFiles(input.classroomId, input.session.id, input.session.files);

    const args = [
      'run',
      '-d',
      '--rm',
      '--name',
      paths.containerName,
      '--security-opt',
      'seccomp=unconfined',
      '--add-host',
      'host.docker.internal:host-gateway',
      '--shm-size=1g',
      ...(paths.currentContainerId
        ? ['--volumes-from', paths.currentContainerId]
        : ['-v', `${paths.hostWorkspaceRoot}:${paths.containerRootDir}`]),
      this.config.aio.image,
    ];

    try {
      runDockerControlCommand(args, this.config);
      void waitForDockerContainerHealthy(paths.containerName, this.config).then((healthy) => {
        if (healthy) {
          log.info(`AIO sandbox container ${paths.containerName} is healthy`);
          return;
        }
        log.warn(`AIO sandbox container ${paths.containerName} did not become healthy in time`);
      });
      log.info(`Started AIO sandbox container ${paths.containerName}`);
    } catch (error) {
      if (!isDockerContainerRunning(paths.containerName, this.config)) {
        throw error;
      }
    }

    return paths;
  }

  async prepareSession(input: {
    classroomId: string;
    session: PersistedCodeSession;
    origin?: string;
  }) {
    await this.ensureSandboxContainer(input);
  }

  async releaseSession(input: { classroomId: string; session: PersistedCodeSession }) {
    void input.classroomId;
    void input.session;
  }

  async runSession(input: {
    classroomId: string;
    session: PersistedCodeSession;
    origin: string;
  }) {
    const entry = getCodeLanguageCatalogEntry(input.session.language);
    if (entry.previewMode === 'web') {
      return createHtmlPreviewExecution({
        ...input,
        mode: this.mode,
        config: this.config,
      });
    }

    const executionId = randomUUID();
    const execution = buildExecutionRecord({
      classroomId: input.classroomId,
      session: input.session,
      executionId,
      status: 'queued',
      previewMode: entry.previewMode,
    });
    await writeCodeExecution(execution);

    const paths = await this.ensureSandboxContainer(input);
    const containerOutputsDir = joinPosix(paths.containerSessionDir, 'outputs', executionId);

    void runExecutionInBackground({
      classroomId: input.classroomId,
      session: input.session,
      executionId,
      previewMode: entry.previewMode,
      buildCommands: () =>
        SERVER_CODE_RUNTIMES[input.session.language].buildCommands({
          workspaceDir: paths.containerWorkspaceDir,
          outputsDir: containerOutputsDir,
          entrypoint: input.session.entrypoint,
          sandboxMode: this.mode,
        }),
      runStep: (step, handlers) =>
        spawnCommandStep({
          command: 'docker',
          args: [
            'exec',
            '-i',
            '-w',
            paths.containerWorkspaceDir,
            paths.containerName,
            step.command,
            ...step.args,
          ],
          cwd: process.cwd(),
          env: getDockerCommandEnv(this.config.aio.dockerSocketPath),
          stdin: handlers.stdin,
          onStdout: handlers.onStdout,
          onStderr: handlers.onStderr,
          executionId: handlers.executionId,
        }),
    }).catch(async (error) => {
      log.error('Background docker code execution failed', error);
      const current = await readCodeExecution(input.classroomId, input.session.id, executionId);
      if (current?.status === 'stopped') {
        return;
      }
      await writeCodeExecution({
        ...execution,
        status: 'failed',
        stderr: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      });
    });

    return execution;
  }
}

class ProvisionerAioCodeSandboxProvider implements ClassroomCodeSandboxProvider {
  readonly mode = 'aio' as const;

  constructor(private readonly config: CodeSandboxConfig) {}

  async runSession(_input: {
    classroomId: string;
    session: PersistedCodeSession;
    origin: string;
  }): Promise<PersistedCodeExecution> {
    throw new Error(
      `Provisioner sandbox backend is not implemented yet. Configure OPENMAIC_CODE_SANDBOX_AIO_BACKEND=docker or OPENMAIC_CODE_SANDBOX_MODE=local. Current provisioner URL: ${this.config.aio.provisioner.url}`,
    );
  }
}

let providerSingleton: ClassroomCodeSandboxProvider | null = null;

export function resetCodeSandboxProviderForTests() {
  providerSingleton = null;
  resetIdleAioJanitorForTests();
}

export function getClassroomCodeSandboxProvider(): ClassroomCodeSandboxProvider {
  if (providerSingleton) return providerSingleton;
  const config = validateCodeSandboxConfig(getCodeSandboxConfig());
  if (config.mode === 'local') {
    providerSingleton = new LocalCodeSandboxProvider(config);
    return providerSingleton;
  }

  providerSingleton =
    config.aio.backend === 'docker'
      ? new DockerAioCodeSandboxProvider(config)
      : new ProvisionerAioCodeSandboxProvider(config);
  ensureIdleAioJanitorStarted(config);
  return providerSingleton;
}
