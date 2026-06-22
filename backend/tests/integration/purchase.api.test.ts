import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock the durable layer; the reserve still runs against REAL Redis. This exercises
// routes → controller status-map → service → response envelope without a live DB.
vi.mock('../../src/models/order.model', () => ({
  insertOrder: vi.fn(),
  countOrders: vi.fn(),
  INSERT_ORDER_UNIQUE_VIOLATION_CODE: '23505',
}));

import { createApp } from '../../src/app';
import { insertOrder } from '../../src/models/order.model';
import { getRemainingStock } from '../../src/models/reserve.model';
import { redis, seedWindow, flushTestDb, buyersKey, SALE_ID } from '../helpers/redis';

const app = createApp();
const mockInsertOrder = vi.mocked(insertOrder);

const HOUR = 60 * 60 * 1000;
const post = (body: object) => request(app).post('/api/purchase').send(body);

beforeEach(async () => {
  await flushTestDb();
  vi.clearAllMocks();
  mockInsertOrder.mockResolvedValue(undefined);
});
afterAll(async () => {
  await redis.quit();
});

describe('POST /api/purchase', () => {
  it('201 success for a new buyer, and persists the order', async () => {
    await seedWindow({ stock: 5 });
    const res = await post({ userEmail: 'new@example.com' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { status: 'success' } });
    expect(mockInsertOrder).toHaveBeenCalledWith(SALE_ID, 'new@example.com');
  });

  it('200 already_purchased on a duplicate (caught by the Redis dedup, no 2nd write)', async () => {
    await seedWindow({ stock: 5 });
    await post({ userEmail: 'dup@example.com' });
    const res = await post({ userEmail: 'dup@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'already_purchased' } });
    expect(mockInsertOrder).toHaveBeenCalledTimes(1); // only the first attempt wrote
  });

  it('409 sold_out when stock is exhausted', async () => {
    await seedWindow({ stock: 0 });
    const res = await post({ userEmail: 'late@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ data: { status: 'sold_out' } });
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it('400 invalid_user_email when userEmail is missing', async () => {
    await seedWindow({ stock: 5 });
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_user_email');
  });

  it('200 already_purchased when the DB reports a 23505 the Redis dedup missed', async () => {
    await seedWindow({ stock: 5 });
    mockInsertOrder.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const res = await post({ userEmail: 'racer@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'already_purchased' } });
  });

  it('503 persist_failed when the durable write fails for any other reason', async () => {
    await seedWindow({ stock: 5 });
    mockInsertOrder.mockRejectedValueOnce(new Error('db exploded'));
    const res = await post({ userEmail: 'unlucky@example.com' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('persist_failed');
  });
});

describe('POST /api/purchase — sale window', () => {
  it('409 not_active before the window opens', async () => {
    const now = Date.now();
    await seedWindow({ stock: 5, startMs: now + HOUR, endMs: now + 2 * HOUR });
    const res = await post({ userEmail: 'early@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ data: { status: 'not_active' } });
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it('409 ended after the window closes', async () => {
    const now = Date.now();
    await seedWindow({ stock: 5, startMs: now - 2 * HOUR, endMs: now - HOUR });
    const res = await post({ userEmail: 'toolate@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ data: { status: 'ended' } });
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it('503 not_initialized when no sale is seeded in Redis', async () => {
    // beforeEach flushes the test DB, so with no seedWindow the keys are absent.
    const res = await post({ userEmail: 'cold@example.com' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('not_initialized');
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });
});

// The two headline guarantees, driven end-to-end through the endpoint: many
// simultaneous POSTs, asserting the response mix and the resulting Redis state. The
// atomic SADD/DECR inside createReserve are what make these hold under the collision.
describe('POST /api/purchase — under concurrency', () => {
  it('no oversell: exactly `stock` buyers get 201, the rest 409 sold_out', async () => {
    const STOCK = 5;
    const ATTEMPTS = 50;
    await seedWindow({ stock: STOCK });

    const responses = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) => post({ userEmail: `buyer-${i}@example.com` })),
    );
    const statuses = responses.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(STOCK); // exactly stock winners
    expect(statuses.filter((s) => s === 409)).toHaveLength(ATTEMPTS - STOCK); // rest sold_out
    expect(await getRemainingStock(SALE_ID)).toBe(0); // never negative
    expect(await redis.scard(buyersKey)).toBe(STOCK); // winners == claimed units
    expect(mockInsertOrder).toHaveBeenCalledTimes(STOCK); // one durable write per winner
  });

  it('one per user: the same email fired in parallel gets exactly one 201', async () => {
    const STOCK = 50;
    const ATTEMPTS = 30;
    await seedWindow({ stock: STOCK });

    const responses = await Promise.all(
      Array.from({ length: ATTEMPTS }, () => post({ userEmail: 'same@example.com' })),
    );
    const statuses = responses.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(1); // one success
    expect(statuses.filter((s) => s === 200)).toHaveLength(ATTEMPTS - 1); // rest already_purchased
    expect(await redis.scard(buyersKey)).toBe(1); // exactly one buyer recorded
    expect(await getRemainingStock(SALE_ID)).toBe(STOCK - 1); // exactly one unit claimed
    expect(mockInsertOrder).toHaveBeenCalledTimes(1);
  });
});
