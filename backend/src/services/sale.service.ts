import { env } from '../config/env';
import { findSaleById } from '../models/sale.model';
import { countOrders } from '../models/order.model';
import { getRemainingStock } from '../models/reserve.model';

export type SaleState = 'upcoming' | 'active' | 'ended' | 'unavailable';

export interface SaleStatus {
  saleId: string;
  productName: string;
  productDescription: string | null;
  state: SaleState;
  startTime: string;
  endTime: string;
  totalStock: number;
  remainingStock: number;
  soldOut: boolean;
};

/**
 * Classify a sale's window state from its start/end bounds. Exported for unit
 * tests of the window boundaries; the window is inclusive at both ends
 * (now == start and now == end both count as `active`).
 *
 * @param now - The instant to classify.
 * @param start - Window start.
 * @param end - Window end.
 * @returns `upcoming` before the window, `ended` after it, otherwise `active`.
 */
export function computeSaleState(now: Date, start: Date, end: Date): SaleState {
  if (now < start) {
    return 'upcoming';
  }

  if (now > end) {
    return 'ended';
  }

  return 'active';
}

/**
 * Build the public status of the active sale: its definition plus a live
 * remaining-stock count. Prefers the hot Redis counter; falls back to a durable
 * count (totalStock − orders) when Redis is cold, reporting state `unavailable`
 * so the durable fallback can't make an unseeded sale look live.
 *
 * @returns The assembled sale status.
 * @throws If the active sale can't be found in Supabase.
 */
export async function getSaleStatus(): Promise<SaleStatus> {
  const sale = await findSaleById(env.ACTIVE_SALE_ID);

  if (!sale) {
    throw new Error(`Active sale not found: ${env.ACTIVE_SALE_ID}`);
  }

  const { id, startTime, endTime, totalStock, productName, productDescription } = sale;

  // Prefer the hot Redis counter (kept exact by the atomic reserve); fall back
  // to a durable count for display when Redis is cold.
  const remainingFromRedis = await getRemainingStock(id);
  const initialized = remainingFromRedis !== null;
  const remainingStock = remainingFromRedis ?? Math.max(0, totalStock - (await countOrders(id)));

  // Redis is the source of truth for whether the sale is open (seed-once model).
  // Not seeded ⇒ no purchase can succeed, so don't let the durable fallback make
  // the sale look live — report it as unavailable.
  const state: SaleState = initialized
    ? computeSaleState(new Date(), new Date(startTime), new Date(endTime))
    : 'unavailable';

  return {
    saleId: id,
    productName,
    productDescription,
    state,
    startTime,
    endTime,
    totalStock,
    remainingStock,
    soldOut: remainingStock <= 0,
  };
}
