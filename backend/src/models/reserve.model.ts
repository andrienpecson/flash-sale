import { redis } from '../db/redis';

//  Redis Keys:
//    sale:{id}:stock   integer counter — remaining stock
//    sale:{id}:buyers  SET of buyer emails — per-user dedup
//    sale:{id}:config  hash { start, end } in epoch ms — sale window
const stockKey = (saleId: string) => `sale:${saleId}:stock`;
const buyersKey = (saleId: string) => `sale:${saleId}:buyers`;
const configKey = (saleId: string) => `sale:${saleId}:config`;

export type ReserveResult =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_active'
  | 'ended'
  | 'not_initialized';

export interface SaleStateSeed {
  startMs: number;
  endMs: number;
  stock: number;
  buyers?: string[]; // emails to repopulate the dedup set (already-purchased users)
};

/**
 * Atomically reserve one unit for a buyer: validates the sale window, dedups the
 * buyer against the buyers set, then decrements stock — rolling back if that
 * would oversell. This is the core no-oversell / one-per-user path.
 *
 * @param saleId - ID of the sale to reserve against.
 * @param userEmail - Email of the buyer attempting to reserve.
 * @param nowMs - Current time in epoch ms, compared against the sale window.
 * @returns The reservation outcome.
 */
export async function createReserve(
  saleId: string,
  userEmail: string,
  nowMs: number,
): Promise<ReserveResult> {
  const [start, end] = await redis.hmget(configKey(saleId), 'start', 'end');

  if (start === null) {
    return 'not_initialized';
  }

  if (nowMs < Number(start)) {
    return 'not_active';
  }

  if (nowMs > Number(end)) {
    return 'ended';
  }

  // Check if the user is already reserved buyer.
  const added = await redis.sadd(buyersKey(saleId), userEmail);
  if (added === 0) {
    return 'already_purchased';
  }

  const remaining = await redis.decr(stockKey(saleId));
  if (remaining < 0) {
    await redis.multi()
      .incr(stockKey(saleId)) // redis.decr set the stocks to -1, set value back to zero
      .srem(buyersKey(saleId), userEmail) // remove user from the reserved buyers.
      .exec();
    return 'sold_out';
  }

  return 'success';
}

/**
 * Give back the stock unit and remove the user from the buyers set.
 *
 * @param saleId - ID of the sale to release against.
 * @param userEmail - Email of the buyer to remove from the buyers set.
 */
export async function releaseReserve(saleId: string, userEmail: string): Promise<void> {
  await redis.multi()
    .incr(stockKey(saleId))
    .srem(buyersKey(saleId), userEmail).exec();
}

/**
 * Give back only the stock unit, leaving the buyer in the dedup set.
 *
 * @param saleId - ID of the sale to return a unit to.
 */
export async function releaseStock(saleId: string): Promise<void> {
  await redis.incr(stockKey(saleId));
}

/**
 * Remaining stock from the hot counter.
 *
 * @param saleId - ID of the sale to read stock for.
 * @returns The remaining units (clamped at 0), or null when the key is absent
 *   (cold / Redis down) so callers can fall back to a durable count.
 */
export async function getRemainingStock(saleId: string): Promise<number | null> {
  const value = await redis.get(stockKey(saleId));
  return value === null ? null : Math.max(0, Number(value));
}

/**
 * Initialize (or reset) the sale state in Redis. This is the one-time setup step
 * run by `npm run seed:redis` — not something the server does at runtime. It
 * overwrites the stock counter, (re)writes the window config, and clears the
 * buyers set — then re-seeds it from `buyers` (the already-purchased emails) so
 * re-seeding a live sale keeps per-user dedup accurate.
 *
 * @param saleId - ID of the sale to seed.
 * @param seed - Sale state to write.
 * @param seed.startMs - Window start in epoch ms.
 * @param seed.endMs - Window end in epoch ms.
 * @param seed.stock - Initial remaining-stock count.
 * @param seed.buyers - Emails to repopulate the dedup set (already-purchased users).
 */
export async function seedSaleState(
  saleId: string,
  { startMs, endMs, stock, buyers }: SaleStateSeed,
): Promise<void> {
  const tx = redis
    .multi()
    .set(stockKey(saleId), String(stock))
    .hset(configKey(saleId), { start: startMs, end: endMs })
    .del(buyersKey(saleId)); // drop any stale buyers before re-seeding

  if (buyers && buyers.length > 0) {
    tx.sadd(buyersKey(saleId), ...buyers);
  }
  
  await tx.exec();
}

/**
 * Remove all Redis state for a sale (stock counter, buyers set, window config).
 * Used by `npm run stress:clean` to wipe the load-test footprint; the sale then
 * reads as `not_initialized` until the next `seed:redis` re-primes it.
 *
 * @param saleId - ID of the sale to clear.
 */
export async function clearSaleState(saleId: string): Promise<void> {
  await redis.del(stockKey(saleId), buyersKey(saleId), configKey(saleId));
}
