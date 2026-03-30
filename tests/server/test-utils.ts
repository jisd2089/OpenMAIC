import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { NextRequest } from 'next/server';

const originalCwd = process.cwd();

export async function setupIsolatedWorkspace(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  process.chdir(root);
  return root;
}

export async function teardownIsolatedWorkspace(root: string): Promise<void> {
  const { resetDatabaseClientForTests } = await import('@/lib/server/db/client');
  await resetDatabaseClientForTests();
  process.chdir(originalCwd);
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
}

export function createJsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export function createInvalidJsonRequest(url: string, method: string, body: string): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
}

export function createGetRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: 'GET' }));
}

export function createFormRequest(url: string, method: string, formData: FormData): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      body: formData,
    }),
  );
}
