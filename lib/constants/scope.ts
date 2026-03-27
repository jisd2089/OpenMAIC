export const DEFAULT_SCOPE_ID = 'default';

export function normalizeScopeId(scopeId?: string | null): string {
  const trimmed = typeof scopeId === 'string' ? scopeId.trim() : '';
  return trimmed || DEFAULT_SCOPE_ID;
}
