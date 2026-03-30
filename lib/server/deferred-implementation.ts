export class DeferredImplementationError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`${feature} is not implemented yet`);
    this.name = 'DeferredImplementationError';
    this.feature = feature;
  }
}

export function isDeferredImplementationError(
  error: unknown,
): error is DeferredImplementationError {
  return error instanceof DeferredImplementationError;
}
