import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Supabase is mocked at the model boundary; the remaining-stock counter is read from
// REAL Redis so we can exercise both the hot-counter path and the durable fallback.
vi.mock('../../src/models/sale.model', () => ({ findSaleById: vi.fn() }));
vi.mock('../../src/models/order.model', () => ({
  countOrders: vi.fn(),
  insertOrder: vi.fn(),
  INSERT_ORDER_UNIQUE_VIOLATION_CODE: '23505',
}));

import { createApp } from '../../src/app';
import { findSaleById } from '../../src/models/sale.model';
import { countOrders } from '../../src/models/order.model';
import { redis, seedWindow, flushTestDb, SALE_ID } from '../helpers/redis';

const app = createApp();
const mockFindSaleById = vi.mocked(findSaleById);
const mockCountOrders = vi.mocked(countOrders);

const HOUR = 60 * 60 * 1000;
const getStatus = () => request(app).get('/api/sale/status');

function saleRecord(
  { phase = 'open', totalStock = 10 }: { phase?: 'open' | 'upcoming' | 'ended'; totalStock?: number } = {},
) {
  const now = Date.now();
  // Example windows if now were 2026-06-24 12:00:
  //   open:     11:00 → 13:00  (now is inside)
  //   upcoming: 13:00 → 14:00  (starts after now)
  //   ended:    10:00 → 11:00  (ended before now)
  const window = {
    open: { start: now - HOUR, end: now + HOUR },
    upcoming: { start: now + HOUR, end: now + 2 * HOUR },
    ended: { start: now - 2 * HOUR, end: now - HOUR },
  }[phase];

  return {
    id: SALE_ID,
    productName: 'Shoes',
    productDescription: 'A limited pair of shoes.',
    startTime: new Date(window.start).toISOString(),
    endTime: new Date(window.end).toISOString(),
    totalStock,
  };
}

beforeEach(async () => {
  await flushTestDb();
  vi.clearAllMocks();
  mockCountOrders.mockResolvedValue(0);
});
afterAll(async () => {
  await redis.quit();
});

describe('GET /api/sale/status', () => {
  it('reports state=active and the live counter while the window is open', async () => {
    mockFindSaleById.mockResolvedValue(saleRecord({ phase: 'open' }));
    await seedWindow({ stock: 7 });
    const res = await getStatus();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ state: 'active', remainingStock: 7, soldOut: false });
  });

  it('reports state=upcoming before the window opens', async () => {
    mockFindSaleById.mockResolvedValue(saleRecord({ phase: 'upcoming' }));
    await seedWindow({ stock: 5 });
    const res = await getStatus();
    expect(res.body.data.state).toBe('upcoming');
  });

  it('reports state=ended after the window closes', async () => {
    mockFindSaleById.mockResolvedValue(saleRecord({ phase: 'ended' }));
    await seedWindow({ stock: 5 });
    const res = await getStatus();
    expect(res.body.data.state).toBe('ended');
  });

  // Cold Redis (flushed in beforeEach, never seeded): unavailable + durable fallback.
  it('reports state=unavailable and the durable stock fallback when Redis is cold', async () => {
    mockFindSaleById.mockResolvedValue(saleRecord({ totalStock: 10 }));
    mockCountOrders.mockResolvedValue(3);
    const res = await getStatus();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ state: 'unavailable', remainingStock: 7 }); // 10 - 3
    expect(mockCountOrders).toHaveBeenCalledWith(SALE_ID);
  });
});
