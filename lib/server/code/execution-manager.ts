import type { ChildProcessWithoutNullStreams } from 'child_process';

const activeExecutions = new Map<string, ChildProcessWithoutNullStreams>();

export function registerActiveExecution(
  executionId: string,
  child: ChildProcessWithoutNullStreams,
) {
  activeExecutions.set(executionId, child);
}

export function getActiveExecution(executionId: string) {
  return activeExecutions.get(executionId) ?? null;
}

export function clearActiveExecution(executionId: string) {
  activeExecutions.delete(executionId);
}

export function stopActiveExecution(executionId: string) {
  const child = activeExecutions.get(executionId);
  if (!child) return false;
  child.kill();
  return true;
}
