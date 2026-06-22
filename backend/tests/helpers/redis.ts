// Shared test helpers for the integration + concurrency suites that run against a
// REAL Redis. vitest.config.ts points REDIS_URL at db index 15, so everything here
// is isolated from dev data (db 0). Built on the production `seedSaleState`.
import { env } from '../../src/config/env';
import { redis } from '../../src/db/redis';
import { seedSaleState } from '../../src/models/reserve.model';

export { redis };

export const SALE_ID = env.ACTIVE_SALE_ID;
export const stockKey = `sale:${SALE_ID}:stock`;
export const buyersKey = `sale:${SALE_ID}:buyers`;
export const configKey = `sale:${SALE_ID}:config`;

const HOUR_MS = 60 * 60 * 1000;

interface SeedOptions {
  stock: number;
  startMs?: number;
  endMs?: number;
}

/**
 * Seed the active sale into Redis. Defaults to an OPEN window (straddling now);
 * pass startMs/endMs to make it upcoming or already ended.
 *
 * @param options - Seed options.
 * @param options.stock - Initial remaining-stock count.
 * @param options.startMs - Window start in epoch ms (defaults to one hour ago).
 * @param options.endMs - Window end in epoch ms (defaults to one hour from now).
 */
export async function seedWindow({ stock, startMs, endMs }: SeedOptions): Promise<void> {
  const now = Date.now();
  await seedSaleState(SALE_ID, {
    stock,
    startMs: startMs ?? now - HOUR_MS,
    endMs: endMs ?? now + HOUR_MS,
  });
}

/**
 * Wipe the isolated test DB between tests. Safe: only touches db 15, never db 0.
 */
export async function flushTestDb(): Promise<void> {
  await redis.flushdb();
}
