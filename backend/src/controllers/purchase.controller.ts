import { Request, Response } from 'express';
import { ApiError } from '../middleware/errorHandler';
import {
  type PurchaseResult,
  initiatePurchase
} from '../services/purchase.service';

type PurchaseBody = {
  userEmail: string;
};

const STATUS_CODE: Record<PurchaseResult, number> = {
  success: 201,
  already_purchased: 200,
  sold_out: 409,
  not_active: 409,
  ended: 409,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate and normalize the request's userEmail (trims, then checks shape).
 *
 * @param value - The raw `userEmail` from the request body.
 * @returns The trimmed, validated email.
 * @throws {ApiError} 400 `invalid_user_email` when missing or malformed.
 */
function parseUserEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError(
      400,
      'invalid_user_email',
      'userEmail is required and must be a valid email address',
    );
  }
  return email;
}

/**
 * POST /api/purchase controller: validate the buyer email, run the purchase, and
 * respond with the mapped HTTP status and a `{ data: { status } }` envelope.
 *
 * @param req - Express request; expects `{ userEmail }` in the JSON body.
 * @param res - Express response.
 */
export async function handlePurchase(req: Request, res: Response): Promise<void> {
  const userEmail = parseUserEmail((req.body as PurchaseBody)?.userEmail);
  const result = await initiatePurchase(userEmail);
  res.status(STATUS_CODE[result]).json({ data: { status: result } });
}