import { NextResponse } from 'next/server';

import { getRequestIdFromHeaders, logger } from '@/lib/metrics';

import {
  toApiError,
  type ApiErrorResponse,
  type AppErrorCode,
} from '../domain/errors';

const STATUS_MAP: Partial<Record<AppErrorCode, number>> = {
  validation_failed: 400,
  missing_required_field: 400,
  invalid_format: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  no_match: 404,
  no_valid_candidate: 404,
  session_full: 409,
  rate_limited: 429,
  budget_exceeded: 429,
  search_failed: 500,
  inventory_failed: 500,
  identify_failed: 500,
  identify_sets_failed: 500,
  identify_supersets_failed: 500,
  minifig_meta_failed: 500,
  catalog_version_failed: 500,
  mapping_fix_failed: 500,
  webhook_signature_invalid: 400,
  webhook_processing_failed: 500,
  unknown_error: 500,
};

export type ErrorResponseOptions = {
  message?: string;
  status?: number;
  details?: Record<string, unknown>;
  headers?: HeadersInit;
  /** Request ID for distributed tracing. Extracted from request headers if provided. */
  requestId?: string;
};

/**
 * Create a standardized error response with proper status code and logging.
 *
 * @example
 * // Basic usage
 * return errorResponse('validation_failed');
 *
 * // With request ID for tracing
 * const requestId = request.headers.get('x-request-id');
 * return errorResponse('not_found', { requestId, message: 'Set not found' });
 */
export function errorResponse(
  code: AppErrorCode,
  options?: ErrorResponseOptions
): NextResponse<ApiErrorResponse> {
  const status = options?.status ?? STATUS_MAP[code] ?? 500;
  const requestId = options?.requestId ?? undefined;

  logger.warn('api.error', {
    code,
    status,
    requestId,
    details: options?.details,
  });

  const errorBody = toApiError(code, options?.message, options?.details);

  // Include requestId in response body if available
  const responseBody: ApiErrorResponse = requestId
    ? { ...errorBody, requestId }
    : errorBody;

  // Build response headers, always including request ID if available
  const responseHeaders: Record<string, string> = {};
  if (requestId) {
    responseHeaders['x-request-id'] = requestId;
  }

  // Merge with any additional headers from options
  const finalHeaders =
    options?.headers || Object.keys(responseHeaders).length > 0
      ? { ...responseHeaders, ...(options?.headers ?? {}) }
      : undefined;

  return NextResponse.json(responseBody, {
    status,
    ...(finalHeaders ? { headers: finalHeaders } : {}),
  });
}

/**
 * Helper to extract request ID from a NextRequest for use with errorResponse.
 *
 * @example
 * export async function GET(req: NextRequest) {
 *   const requestId = getRequestId(req);
 *   // ...
 *   return errorResponse('not_found', { requestId });
 * }
 */
export function getRequestId(
  request: { headers: Headers } | Headers
): string | undefined {
  const headers = 'headers' in request ? request.headers : request;
  return getRequestIdFromHeaders(headers) ?? undefined;
}
