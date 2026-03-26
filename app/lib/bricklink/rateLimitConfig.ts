import 'server-only';

export const BL_RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
export const BL_RATE_LIMIT_IP =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;
export const BL_RATE_LIMIT_USER =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE_USER ?? '', 10) || 60;

/** Stricter per-IP limit for routes that make BrickLink API calls (quota-sensitive). */
export const BL_RATE_LIMIT_IP_STRICT =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE_STRICT ?? '', 10) || 30;
