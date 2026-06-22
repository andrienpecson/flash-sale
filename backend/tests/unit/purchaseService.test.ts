import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initiatePurchase } from '../../src/services/purchase.service';
import { createReserve, releaseReserve, releaseStock } from '../../src/models/reserve.model';
import { insertOrder } from '../../src/models/order.model';

// Mock both data-access layers so this is a pure orchestration test.
// No Redis or Supabase connections are constructed.
vi.mock('../../src/models/reserve.model', () => ({
  createReserve: vi.fn(),
  releaseReserve: vi.fn(),
  releaseStock: vi.fn(),
}));

vi.mock('../../src/models/order.model', () => ({
  insertOrder: vi.fn(),
  countOrders: vi.fn(),
  INSERT_ORDER_UNIQUE_VIOLATION_CODE: '23505',
}));

const mockCreateReserve = vi.mocked(createReserve);
const mockReleaseReserve = vi.mocked(releaseReserve);
const mockReleaseStock = vi.mocked(releaseStock);
const mockInsertOrder = vi.mocked(insertOrder);

const EMAIL = 'buyer@example.com';

beforeEach(() => {
  vi.clearAllMocks();
  mockReleaseReserve.mockResolvedValue(undefined);
  mockReleaseStock.mockResolvedValue(undefined);
});

describe('initiatePurchase', () => {
  it('throws 503 unavailable when the reserve throws (Redis down)', async () => {
    mockCreateReserve.mockRejectedValue(new Error('connection refused'));
    await expect(initiatePurchase(EMAIL)).rejects.toMatchObject({ status: 503, code: 'unavailable' });
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it('throws 503 not_initialized when Redis is unseeded', async () => {
    mockCreateReserve.mockResolvedValue('not_initialized');
    await expect(initiatePurchase(EMAIL)).rejects.toMatchObject({ status: 503, code: 'not_initialized' });
    expect(mockInsertOrder).not.toHaveBeenCalled();
  });

  it.each(['sold_out', 'not_active', 'ended', 'already_purchased'] as const)(
    'passes through %s without a durable write',
    async (status) => {
      mockCreateReserve.mockResolvedValue(status);
      await expect(initiatePurchase(EMAIL)).resolves.toBe(status);
      expect(mockInsertOrder).not.toHaveBeenCalled();
    },
  );

  it('persists the order exactly once on a successful reserve', async () => {
    mockCreateReserve.mockResolvedValue('success');
    mockInsertOrder.mockResolvedValue(undefined);
    await expect(initiatePurchase(EMAIL)).resolves.toBe('success');
    expect(mockInsertOrder).toHaveBeenCalledTimes(1);
    expect(mockInsertOrder).toHaveBeenCalledWith(expect.any(String), EMAIL);
    expect(mockReleaseStock).not.toHaveBeenCalled();
    expect(mockReleaseReserve).not.toHaveBeenCalled();
  });

  it('compensates with releaseStock (keeping the buyer flag) on a 23505 duplicate', async () => {
    mockCreateReserve.mockResolvedValue('success');
    const dupErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockInsertOrder.mockRejectedValue(dupErr);
    await expect(initiatePurchase(EMAIL)).resolves.toBe('already_purchased');
    expect(mockReleaseStock).toHaveBeenCalledOnce();
    expect(mockReleaseReserve).not.toHaveBeenCalled();
  });

  it('fully rolls back and throws 503 persist_failed on a non-duplicate write error', async () => {
    mockCreateReserve.mockResolvedValue('success');
    mockInsertOrder.mockRejectedValue(new Error('db exploded'));
    await expect(initiatePurchase(EMAIL)).rejects.toMatchObject({ status: 503, code: 'persist_failed' });
    expect(mockReleaseReserve).toHaveBeenCalledOnce();
    expect(mockReleaseStock).not.toHaveBeenCalled();
  });
});
