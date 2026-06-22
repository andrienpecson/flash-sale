import { env } from '../config/env';
import { ApiError } from '../middleware/errorHandler';
import { insertOrder, INSERT_ORDER_UNIQUE_VIOLATION_CODE } from '../models/order.model';
import {
  releaseReserve,
  releaseStock,
  createReserve,
  type ReserveResult,
} from '../models/reserve.model';

export type PurchaseResult =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_active'
  | 'ended';

/**
 * Run one purchase attempt for the active sale: reserve a unit in Redis, then
 * persist the durable order — rolling back the reserve if the write fails. A
 * duplicate detected only at the DB resolves to `already_purchased` (stock
 * returned, buyer kept); any other write failure fully undoes the reserve.
 *
 * @param userEmail - Email of the user attempting to purchase.
 * @returns The purchase outcome.
 * @throws {ApiError} 503 `unavailable` if Redis is unreachable, 503
 *   `not_initialized` if the sale isn't seeded, or 503 `persist_failed` if the
 *   durable write fails for a non-duplicate reason.
 */
export async function initiatePurchase(userEmail: string): Promise<PurchaseResult> {
  // If Redis is unreachable we can't trust the reserve, so reject
  // with a clear 503 instead of a generic 500.
  let createReserveResult: ReserveResult;
  try {
    createReserveResult = await createReserve(env.ACTIVE_SALE_ID, userEmail, Date.now());
  } catch {
    throw new ApiError(
      503,
      'unavailable',
      'Service is temporarily unavailable, please try again.',
    );
  }

  if (createReserveResult === 'not_initialized') {
    throw new ApiError(
      503,
      'not_initialized',
      'Sale is not initialized.',
    );
  } else if (createReserveResult !== 'success') {
    return createReserveResult;
  }

  // Reserve succeeded in Redis; now write the durable order record.
  try {
    await insertOrder(env.ACTIVE_SALE_ID, userEmail);
    return 'success';
  } catch (err) {
    if ((err as { code?: string }).code === INSERT_ORDER_UNIQUE_VIOLATION_CODE) {
      // The request slipped past the Redis dedup check (SADD saw the user as new),
      // yet they already have an order in the database. So only the stock needs
      // correcting in Redis — give the unit back, but keep them flagged as a buyer.
      await releaseStock(env.ACTIVE_SALE_ID);
      return 'already_purchased';
    }
    // Any other error means the durable write genuinely failed and nothing was
    // persisted. Fully undo the reserve (give back the stock AND un-mark the
    // buyer) so Redis stays consistent with the DB and a retry can succeed — then
    // surface a clear error. No partial state: fully reserved + persisted, or not.
    await releaseReserve(env.ACTIVE_SALE_ID, userEmail);
    throw new ApiError(
      503,
      'persist_failed',
      'Could not record your order, please try again.',
    );
  }
}
