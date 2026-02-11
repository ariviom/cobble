export type AppErrorCode =
  // Validation
  | 'validation_failed'
  | 'missing_required_field'
  | 'invalid_format'
  // Auth
  | 'unauthorized'
  | 'forbidden'
  // Rate limiting / budgets
  | 'rate_limited'
  | 'budget_exceeded'
  // Resource
  | 'not_found'
  | 'no_match'
  | 'no_valid_candidate'
  | 'session_full'
  // External service errors
  | 'external_service_error'
  | 'brickognize_failed'
  | 'rebrickable_failed'
  | 'rebrickable_circuit_open'
  | 'bricklink_circuit_open'
  // Internal errors
  | 'search_failed'
  | 'inventory_failed'
  | 'identify_failed'
  | 'identify_sets_failed'
  | 'identify_supersets_failed'
  | 'minifig_meta_failed'
  | 'catalog_version_failed'
  | 'mapping_fix_failed'
  | 'webhook_signature_invalid'
  | 'webhook_processing_failed'
  | 'unknown_error'
  // Allow future string codes without breaking the type.
  | (string & {});

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;

  constructor(code: AppErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

type ErrorPayload = {
  error?: string;
  message?: string;
};

export type ApiErrorResponse = {
  error: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

export function toApiError(
  code: AppErrorCode,
  message?: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    error: code,
    message: message ?? code.replace(/_/g, ' '),
    ...(details ? { details } : {}),
  };
}

export async function throwAppErrorFromResponse(
  res: Response,
  fallbackCode: AppErrorCode
): Promise<never> {
  let code: AppErrorCode = fallbackCode;
  let message: string | undefined;

  try {
    const data = (await res.json()) as ErrorPayload;
    if (typeof data?.error === 'string' && data.error.length > 0) {
      code = data.error as AppErrorCode;
    }
    if (typeof data?.message === 'string' && data.message.length > 0) {
      message = data.message;
    }
  } catch {
    // Ignore JSON parse failures; fall back to status text.
  }

  if (!message) {
    message = res.statusText || String(code);
  }

  throw new AppError(code, message, res.status);
}
