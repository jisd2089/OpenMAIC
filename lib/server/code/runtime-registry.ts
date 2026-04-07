import path from 'path';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import type { CodeLanguage, CodePreviewMode } from '@/lib/code/runtime-catalog';
import { CODE_LANGUAGE_CATALOG, getCodeLanguageCatalogEntry } from '@/lib/code/runtime-catalog';
import { getCodeSandboxConfig, type CodeSandboxConfig } from '@/lib/server/code/config';

export interface ServerCodeRuntimeSpec {
  language: CodeLanguage;
  label: string;
  defaultFileName: string;
  previewMode: CodePreviewMode;
  requiredCommands?: string[];
  buildCommands: (context: {
    workspaceDir: string;
    outputsDir: string;
    entrypoint: string;
    sandboxMode?: CodeSandboxConfig['mode'];
  }) => Array<{
    command: string;
    args: string[];
    outputFile?: string;
  }>;
}

function tscCliPath() {
  return require.resolve('typescript/bin/tsc');
}

function shouldUseMonoCsharpRuntime(sandboxMode?: CodeSandboxConfig['mode']) {
  if (sandboxMode === 'aio') {
    return true;
  }
  return process.platform !== 'win32' && commandExists('mcs') && commandExists('mono');
}

export const SERVER_CODE_RUNTIMES: Record<CodeLanguage, ServerCodeRuntimeSpec> = {
  javascript: {
    ...getCodeLanguageCatalogEntry('javascript'),
    requiredCommands: [process.execPath],
    buildCommands: ({ workspaceDir, entrypoint, sandboxMode }) => [
      {
        command: sandboxMode === 'aio' ? 'node' : process.execPath,
        args: [path.join(workspaceDir, entrypoint)],
      },
    ],
  },
  typescript: {
    ...getCodeLanguageCatalogEntry('typescript'),
    requiredCommands: [process.execPath],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint, sandboxMode }) => {
      const compiledDir = path.join(outputsDir, 'compiled');
      const entry = path.join(workspaceDir, entrypoint);
      const compiledEntry = path.join(compiledDir, entrypoint.replace(/\.ts$/, '.js'));
      return [
        {
          command: sandboxMode === 'aio' ? 'tsc' : process.execPath,
          args: [
            ...(sandboxMode === 'aio' ? [] : [tscCliPath()]),
            '--outDir',
            compiledDir,
            '--module',
            'commonjs',
            '--target',
            'ES2020',
            '--esModuleInterop',
            entry,
          ],
        },
        {
          command: sandboxMode === 'aio' ? 'node' : process.execPath,
          args: [compiledEntry],
        },
      ];
    },
  },
  html: {
    ...getCodeLanguageCatalogEntry('html'),
    requiredCommands: [],
    buildCommands: () => [],
  },
  python: {
    ...getCodeLanguageCatalogEntry('python'),
    requiredCommands: ['python'],
    buildCommands: ({ workspaceDir, entrypoint }) => [
      { command: 'python', args: [path.join(workspaceDir, entrypoint)] },
    ],
  },
  java: {
    ...getCodeLanguageCatalogEntry('java'),
    requiredCommands: ['javac', 'java'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const source = path.join(workspaceDir, entrypoint);
      const className = path.basename(entrypoint, '.java');
      return [
        {
          command: 'javac',
          args: ['-d', outputsDir, source],
        },
        {
          command: 'java',
          args: ['-cp', outputsDir, className],
        },
      ];
    },
  },
  c: {
    ...getCodeLanguageCatalogEntry('c'),
    requiredCommands: ['gcc'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const output = path.join(outputsDir, process.platform === 'win32' ? 'main.exe' : 'main');
      return [
        {
          command: 'gcc',
          args: [path.join(workspaceDir, entrypoint), '-o', output],
        },
        {
          command: output,
          args: [],
        },
      ];
    },
  },
  cpp: {
    ...getCodeLanguageCatalogEntry('cpp'),
    requiredCommands: ['g++'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const output = path.join(outputsDir, process.platform === 'win32' ? 'main.exe' : 'main');
      return [
        {
          command: 'g++',
          args: [path.join(workspaceDir, entrypoint), '-o', output],
        },
        {
          command: output,
          args: [],
        },
      ];
    },
  },
  go: {
    ...getCodeLanguageCatalogEntry('go'),
    requiredCommands: ['go'],
    buildCommands: ({ workspaceDir, entrypoint }) => [
      { command: 'go', args: ['run', path.join(workspaceDir, entrypoint)] },
    ],
  },
  rust: {
    ...getCodeLanguageCatalogEntry('rust'),
    requiredCommands: ['rustc'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const output = path.join(outputsDir, process.platform === 'win32' ? 'main.exe' : 'main');
      return [
        {
          command: 'rustc',
          args: [path.join(workspaceDir, entrypoint), '-o', output],
        },
        {
          command: output,
          args: [],
        },
      ];
    },
  },
  shell: {
    ...getCodeLanguageCatalogEntry('shell'),
    requiredCommands: [process.platform === 'win32' ? 'powershell' : 'bash'],
    buildCommands: ({ workspaceDir, entrypoint }) => [
      {
        command: process.platform === 'win32' ? 'powershell' : 'bash',
        args:
          process.platform === 'win32'
            ? ['-File', path.join(workspaceDir, entrypoint)]
            : [path.join(workspaceDir, entrypoint)],
      },
    ],
  },
  php: {
    ...getCodeLanguageCatalogEntry('php'),
    requiredCommands: ['php'],
    buildCommands: ({ workspaceDir, entrypoint }) => [
      { command: 'php', args: [path.join(workspaceDir, entrypoint)] },
    ],
  },
  ruby: {
    ...getCodeLanguageCatalogEntry('ruby'),
    requiredCommands: ['ruby'],
    buildCommands: ({ workspaceDir, entrypoint }) => [
      { command: 'ruby', args: [path.join(workspaceDir, entrypoint)] },
    ],
  },
  csharp: {
    ...getCodeLanguageCatalogEntry('csharp'),
    requiredCommands: ['csc'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint, sandboxMode }) => {
      const output = path.join(outputsDir, 'Program.exe');
      const useMono = shouldUseMonoCsharpRuntime(sandboxMode);
      return [
        {
          command: useMono ? 'mcs' : 'csc',
          args: [useMono ? `-out:${output}` : `/out:${output}`, path.join(workspaceDir, entrypoint)],
        },
        {
          command: useMono ? 'mono' : output,
          args: useMono ? [output] : [],
        },
      ];
    },
  },
  kotlin: {
    ...getCodeLanguageCatalogEntry('kotlin'),
    requiredCommands: ['kotlinc', 'java'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const output = path.join(outputsDir, 'main.jar');
      return [
        {
          command: 'kotlinc',
          args: [path.join(workspaceDir, entrypoint), '-include-runtime', '-d', output],
        },
        {
          command: 'java',
          args: ['-jar', output],
        },
      ];
    },
  },
  swift: {
    ...getCodeLanguageCatalogEntry('swift'),
    requiredCommands: ['swiftc'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const output = path.join(outputsDir, process.platform === 'win32' ? 'main.exe' : 'main');
      return [
        {
          command: 'swiftc',
          args: [path.join(workspaceDir, entrypoint), '-o', output],
        },
        {
          command: output,
          args: [],
        },
      ];
    },
  },
  scala: {
    ...getCodeLanguageCatalogEntry('scala'),
    requiredCommands: ['scalac', 'scala'],
    buildCommands: ({ workspaceDir, outputsDir, entrypoint }) => {
      const className = path.basename(entrypoint, '.scala');
      return [
        {
          command: 'scalac',
          args: ['-d', outputsDir, path.join(workspaceDir, entrypoint)],
        },
        {
          command: 'scala',
          args: ['-cp', outputsDir, className],
        },
      ];
    },
  },
};

export interface CodeRuntimeAvailability {
  language: CodeLanguage;
  label: string;
  defaultFileName: string;
  previewMode: CodePreviewMode;
  available: boolean;
  disabledReason: string | null;
}

const aioRuntimeProbeCache = new Map<string, Map<string, boolean> | null>();

export function resetAioRuntimeProbeCacheForTests() {
  aioRuntimeProbeCache.clear();
}

function commandExists(command: string) {
  if (path.isAbsolute(command)) {
    return existsSync(command);
  }

  const pathValue = process.env.PATH || '';
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);
  const pathext =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .filter(Boolean)
      : [''];

  for (const dir of pathEntries) {
    if (process.platform === 'win32') {
      const hasExtension = /\.[^./\\]+$/.test(command);
      const candidates = hasExtension
        ? [path.join(dir, command)]
        : pathext.map((ext) => path.join(dir, `${command}${ext.toLowerCase()}`));
      if (candidates.some((candidate) => existsSync(candidate))) {
        return true;
      }
      continue;
    }

    if (existsSync(path.join(dir, command))) {
      return true;
    }
  }

  return false;
}

function buildDockerHostValue(socketPath: string) {
  if (!socketPath) return null;
  if (
    socketPath.startsWith('unix://') ||
    socketPath.startsWith('tcp://') ||
    socketPath.startsWith('npipe://')
  ) {
    return socketPath;
  }
  if (path.isAbsolute(socketPath)) {
    return process.platform === 'win32' ? `npipe://${socketPath.replaceAll('\\', '/')}` : `unix://${socketPath}`;
  }
  return null;
}

function getAioRequiredCommands(entry: ServerCodeRuntimeSpec): string[] {
  switch (entry.language) {
    case 'javascript':
      return ['node'];
    case 'typescript':
      return ['tsc', 'node'];
    case 'shell':
      return ['bash'];
    case 'csharp':
      return ['mcs', 'mono'];
    default:
      return entry.requiredCommands ?? [];
  }
}

function getLocalRequiredCommands(entry: ServerCodeRuntimeSpec): string[] {
  if (entry.language === 'csharp' && process.platform !== 'win32') {
    if (commandExists('mcs') && commandExists('mono')) {
      return ['mcs', 'mono'];
    }
    return ['csc'];
  }
  return entry.requiredCommands ?? [];
}

function probeAioImageCommands(config: CodeSandboxConfig): Map<string, boolean> | null {
  if (config.aio.backend !== 'docker') {
    return null;
  }

  const commands = Array.from(
    new Set(
      CODE_LANGUAGE_CATALOG.flatMap((catalogEntry) =>
        getAioRequiredCommands(SERVER_CODE_RUNTIMES[catalogEntry.language]),
      ).filter(Boolean),
    ),
  );
  if (commands.length === 0) {
    return new Map();
  }

  const cacheKey = `${config.aio.image}::${config.aio.dockerSocketPath}`;
  if (aioRuntimeProbeCache.has(cacheKey)) {
    return aioRuntimeProbeCache.get(cacheKey) ?? null;
  }

  const dockerHost = buildDockerHostValue(config.aio.dockerSocketPath);
  const env = dockerHost ? { ...process.env, DOCKER_HOST: dockerHost } : process.env;
  const probeScript = commands
    .map((command) => `if command -v '${command}' >/dev/null 2>&1; then echo '${command}=1'; else echo '${command}=0'; fi`)
    .join('; ');

  try {
    const stdout = execFileSync(
      'docker',
      ['run', '--rm', '--entrypoint', 'sh', config.aio.image, '-lc', probeScript],
      {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const commandMap = new Map<string, boolean>();
    for (const line of stdout.split(/\r?\n/)) {
      const [command, rawValue] = line.trim().split('=');
      if (!command) continue;
      commandMap.set(command, rawValue === '1');
    }
    aioRuntimeProbeCache.set(cacheKey, commandMap);
    return commandMap;
  } catch {
    aioRuntimeProbeCache.set(cacheKey, null);
    return null;
  }
}

function localRuntimeAvailability(
  entry: ServerCodeRuntimeSpec,
  config: CodeSandboxConfig,
): CodeRuntimeAvailability {
  if (entry.language === 'shell' && !config.local.allowHostShell) {
    return {
      language: entry.language,
      label: entry.label,
      defaultFileName: entry.defaultFileName,
      previewMode: entry.previewMode,
      available: false,
      disabledReason: 'Local shell execution is disabled by configuration.',
    };
  }

  const missingCommands = getLocalRequiredCommands(entry).filter((command) => !commandExists(command));
  if (missingCommands.length > 0) {
    return {
      language: entry.language,
      label: entry.label,
      defaultFileName: entry.defaultFileName,
      previewMode: entry.previewMode,
      available: false,
      disabledReason: `Missing runtime command: ${missingCommands.join(', ')}`,
    };
  }

  return {
    language: entry.language,
    label: entry.label,
    defaultFileName: entry.defaultFileName,
    previewMode: entry.previewMode,
    available: true,
    disabledReason: null,
  };
}

function aioRuntimeAvailability(
  entry: ServerCodeRuntimeSpec,
  config: CodeSandboxConfig,
): CodeRuntimeAvailability {
  const requiredCommands = getAioRequiredCommands(entry);
  if (requiredCommands.length === 0) {
    return {
      language: entry.language,
      label: entry.label,
      defaultFileName: entry.defaultFileName,
      previewMode: entry.previewMode,
      available: true,
      disabledReason: null,
    };
  }

  const probe = probeAioImageCommands(config);
  if (!probe) {
    return {
      language: entry.language,
      label: entry.label,
      defaultFileName: entry.defaultFileName,
      previewMode: entry.previewMode,
      available: false,
      disabledReason: 'Unable to verify runtime availability in the configured AIO sandbox image.',
    };
  }

  const missingCommands = requiredCommands.filter((command) => !probe.get(command));
  if (missingCommands.length > 0) {
    return {
      language: entry.language,
      label: entry.label,
      defaultFileName: entry.defaultFileName,
      previewMode: entry.previewMode,
      available: false,
      disabledReason: `Missing sandbox runtime command: ${missingCommands.join(', ')}`,
    };
  }

  return {
    language: entry.language,
    label: entry.label,
    defaultFileName: entry.defaultFileName,
    previewMode: entry.previewMode,
    available: true,
    disabledReason: null,
  };
}

export function listSupportedCodeRuntimes(config = getCodeSandboxConfig()) {
  return CODE_LANGUAGE_CATALOG.map((entry) => ({
    ...(config.mode === 'local'
      ? localRuntimeAvailability(SERVER_CODE_RUNTIMES[entry.language], config)
      : aioRuntimeAvailability(SERVER_CODE_RUNTIMES[entry.language], config)),
  }));
}

export function getCodeRuntimeAvailability(language: CodeLanguage, config = getCodeSandboxConfig()) {
  return listSupportedCodeRuntimes(config).find((entry) => entry.language === language) ?? null;
}
