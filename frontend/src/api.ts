// Typed client for the flash-sale API.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// Mirror of the backend SaleStatus (backend/src/services/sale.service.ts).
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

// The business outcomes of a purchase attempt (backend PurchaseResult).
export type PurchaseStatus =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_active'
  | 'ended';

/**
 * GET /api/sale/status → `{ data: SaleStatus }`, or `{ error: { code, message } }`
 * on failure (e.g. 429 rate_limited).
 *
 * @returns The current sale status.
 * @throws {Error} The API's error message when present (so the caller can
 *   surface it verbatim), falling back to the HTTP status code.
 */
export async function fetchSaleStatus(): Promise<SaleStatus> {
  const res = await fetch(`${API_BASE_URL}/api/sale/status`);
  const body = (await res.json().catch(() => null)) as
    | { data: SaleStatus }
    | { error: { code: string; message: string } }
    | null;

  if (res.ok && body && 'data' in body) {
    return body.data;
  }
  throw new Error(
    body && 'error' in body ? body.error.message : `Sale status request failed (${res.status})`,
  );
}

/**
 * POST /api/purchase with the buyer's identifier. The API returns the outcome in
 * `{ data: { status } }` for the business cases (200/201 and the 409s), and
 * `{ error: { code, message } }` for infrastructure failures (400 bad input,
 * 404, 503). We return the outcome and throw only on a genuine error, so the UI
 * can tell "the sale said no" apart from "the request broke".
 *
 * @param userEmail - The buyer's identifier sent in the request body.
 * @returns The business outcome of the purchase attempt.
 * @throws {Error} The API's error message (or HTTP status) on an infrastructure
 *   failure.
 */
export async function purchase(userEmail: string): Promise<PurchaseStatus> {
  const res = await fetch(`${API_BASE_URL}/api/purchase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userEmail }),
  });

  const body = (await res.json()) as
    | { data: { status: PurchaseStatus } }
    | { error: { code: string; message: string } };

  if ('data' in body) {
    return body.data.status;
  }
  throw new Error(body.error?.message ?? `Purchase failed (${res.status})`);
}
