export const CLASSROOM_NAME_MAX_LENGTH = 30 as const;

export function normalizeClassroomName(name: string): string {
  const trimmed = name.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= CLASSROOM_NAME_MAX_LENGTH) {
    return trimmed;
  }
  return chars.slice(0, CLASSROOM_NAME_MAX_LENGTH).join('').trimEnd();
}
