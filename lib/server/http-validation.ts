import { ZodError, type ZodSchema } from 'zod';

export function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    entries[key] = value;
  }
  return entries;
}

export function parseWithSchema<T>(
  schema: ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: formatZodError(result.error) };
}

export async function parseJsonRequestWithSchema<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await request.json();
    return parseWithSchema(schema, data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: 'Request body must be valid JSON' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse request body',
    };
  }
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}
