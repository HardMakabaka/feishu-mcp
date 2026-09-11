export class FusionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FusionError';
    this.code = code;
    this.details = details;
  }
}
export function invariant(condition, code, message, details) {
  if (!condition) throw new FusionError(code, message, details);
}
export function errorResult(error) {
  return { error: error.code ?? 'INTERNAL_ERROR', message: error.message ?? String(error),
    ...(error.details ? { details: error.details } : {}) };
}
