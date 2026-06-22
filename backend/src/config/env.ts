import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT) || 3000,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Per-IP rate limit for the public /api surface (in-memory store). Optional with defaults.
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 100,
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  // Pointer to the active flash_sales row; the sale definition itself lives in Supabase.
  ACTIVE_SALE_ID: required('ACTIVE_SALE_ID'),
}