import { Request, Response } from 'express';
import { getSaleStatus } from '../services/sale.service';

/**
 * GET /api/sale/status controller: respond with the current sale status wrapped
 * in a `{ data }` envelope.
 *
 * @param _req - Express request (unused).
 * @param res - Express response.
 */
export async function getStatus(_req: Request, res: Response): Promise<void> {
  const saleStatus = await getSaleStatus();
  res.json({ data: saleStatus });
}