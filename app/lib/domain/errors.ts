export type AppErrorCode =
  | 'search_failed'
  | 'inventory_failed'
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



