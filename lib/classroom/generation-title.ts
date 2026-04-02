export function extractGenerationTitle(requirement: string): string {
  const trimmed = requirement.trim();
  if (trimmed.length <= 500) {
    return trimmed;
  }
  return `${trimmed.substring(0, 500).trim()}...`;
}
