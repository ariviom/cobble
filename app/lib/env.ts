import 'server-only';

/**
 * Read a required environment variable or throw.
 *
 * Throws at call time (not import time) so missing vars are surfaced
 * when the code path that needs them actually runs.
 */
export function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
