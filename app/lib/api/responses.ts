import { NextResponse } from 'next/server';

import { logger } from '@/lib/metrics';

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
  rate_limited: 429,
  budget_exceeded: 429,
  search_failed: 500,
  inventory_failed: 500,
  identify_failed: 500,
  unknown_error: 500,
};

export function errorResponse(
  code: AppErrorCode,
  options?: { message?: string; status?: number; details?: Record<string, unknown> }
): NextResponse<ApiErrorResponse> {
  const status = options?.status ?? STATUS_MAP[code] ?? 500;
  logger.warn('api.error', { code, status, details: options?.details });
  return NextResponse.json(toApiError(code, options?.message, options?.details), {
    status,
  });
}

