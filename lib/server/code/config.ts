import path from 'path';

export interface CodeSandboxConfig {
  mode: 'local' | 'aio';
  local: {
    workspaceRoot: string;
    allowHostShell: boolean;
  };
  aio: {
    backend: 'docker' | 'provisioner';
    image: string;
    dockerSocketPath: string;
    sandboxHost: string;
    sharedSandboxId: string;
    idleTimeoutSec: number;
    workdirMountPath: string;
    previewBaseUrl: string;
    provisioner: {
      url: string;
      namespace: string;
      kubeconfigPath: string;
      nodeHost: string;
      image: string;
    };
  };
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function getCodeSandboxConfig(): CodeSandboxConfig {
  const mode = process.env.OPENMAIC_CODE_SANDBOX_MODE === 'aio' ? 'aio' : 'local';
  const backend =
    process.env.OPENMAIC_CODE_SANDBOX_AIO_BACKEND === 'provisioner' ? 'provisioner' : 'docker';

  return {
    mode,
    local: {
      workspaceRoot:
        process.env.OPENMAIC_CODE_SANDBOX_LOCAL_WORKSPACE_ROOT || './.openmaic/code-sandbox',
      allowHostShell: process.env.OPENMAIC_CODE_SANDBOX_LOCAL_ALLOW_HOST_SHELL === 'true',
    },
    aio: {
      backend,
      image:
        process.env.OPENMAIC_CODE_SANDBOX_AIO_IMAGE ||
        'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest',
      dockerSocketPath:
        process.env.OPENMAIC_CODE_SANDBOX_AIO_DOCKER_SOCKET || '/var/run/docker.sock',
      sandboxHost:
        process.env.OPENMAIC_CODE_SANDBOX_AIO_SANDBOX_HOST || 'host.docker.internal',
      sharedSandboxId:
        process.env.OPENMAIC_CODE_SANDBOX_AIO_SHARED_SANDBOX_ID || 'sandbox_aio_global',
      idleTimeoutSec: envNumber('OPENMAIC_CODE_SANDBOX_AIO_IDLE_TIMEOUT_SEC', 600),
      workdirMountPath: process.env.OPENMAIC_CODE_SANDBOX_AIO_WORKDIR_MOUNT_PATH || '/workspace',
      previewBaseUrl:
        process.env.OPENMAIC_CODE_SANDBOX_AIO_PREVIEW_BASE_URL ||
        'http://localhost:3000/api/code-preview',
      provisioner: {
        url: process.env.OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL || '',
        namespace:
          process.env.OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NAMESPACE || 'openmaic',
        kubeconfigPath:
          process.env.OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_KUBECONFIG_PATH ||
          '/root/.kube/config',
        nodeHost:
          process.env.OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_NODE_HOST ||
          'host.docker.internal',
        image:
          process.env.OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_IMAGE ||
          'enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest',
      },
    },
  };
}

export function getCodeSandboxWorkspaceRoot(config = getCodeSandboxConfig()) {
  return path.resolve(config.local.workspaceRoot);
}

export function getCodeSandboxAioSharedSandboxId(config = getCodeSandboxConfig()) {
  return config.aio.sharedSandboxId.trim() || 'sandbox_aio_global';
}

export function validateCodeSandboxConfig(config = getCodeSandboxConfig()) {
  if (config.mode !== 'aio') {
    return config;
  }

  if (config.aio.backend === 'provisioner') {
    if (!config.aio.provisioner.url.trim()) {
      throw new Error(
        'OPENMAIC_CODE_SANDBOX_AIO_PROVISIONER_URL is required when backend=provisioner',
      );
    }
    return config;
  }

  if (!config.aio.image.trim()) {
    throw new Error('OPENMAIC_CODE_SANDBOX_AIO_IMAGE is required when backend=docker');
  }
  if (!config.aio.workdirMountPath.trim()) {
    throw new Error(
      'OPENMAIC_CODE_SANDBOX_AIO_WORKDIR_MOUNT_PATH is required when backend=docker',
    );
  }
  if (!config.aio.sharedSandboxId.trim()) {
    throw new Error('OPENMAIC_CODE_SANDBOX_AIO_SHARED_SANDBOX_ID is required when mode=aio');
  }
  return config;
}
