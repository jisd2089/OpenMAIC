import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { isDeferredImplementationError } from '@/lib/server/deferred-implementation';
import { isServiceError } from '@/lib/server/service-error';

export function apiNotImplemented(feature: string) {
  return apiError(
    API_ERROR_CODES.NOT_IMPLEMENTED,
    501,
    `${feature} is not implemented yet`,
  );
}

export function handleRouteError(error: unknown, fallbackMessage: string) {
  if (isServiceError(error)) {
    return apiError(error.code, error.status, error.message);
  }

  if (isDeferredImplementationError(error)) {
    return apiNotImplemented(error.feature);
  }

  return apiError(
    API_ERROR_CODES.INTERNAL_ERROR,
    500,
    fallbackMessage,
    error instanceof Error ? error.message : String(error),
  );
}
