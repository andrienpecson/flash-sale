import { describe, it, expect, vi } from 'vitest';
import { computeSaleState } from '../../src/services/sale.service';

vi.mock('../../src/db/redis', () => ({ redis: {} }));
vi.mock('../../src/db/supabase', () => ({ supabase: {} }));

describe('computeSaleState', () => {
  const start = new Date('2026-06-23T10:00:00.000Z');
  const end = new Date('2026-06-23T12:00:00.000Z');

  it('is upcoming just before the window opens', () => {
    expect(computeSaleState(new Date('2026-06-23T09:59:59.999Z'), start, end)).toBe('upcoming');
  });

  it('is active inside the window', () => {
    expect(computeSaleState(new Date('2026-06-23T11:00:00.000Z'), start, end)).toBe('active');
  });

  it('is ended just after the window closes', () => {
    expect(computeSaleState(new Date('2026-06-23T12:00:00.001Z'), start, end)).toBe('ended');
  });

  it('treats the exact start instant as active', () => {
    expect(computeSaleState(new Date(start), start, end)).toBe('active');
  });

  it('treats the exact end instant as active', () => {
    expect(computeSaleState(new Date(end), start, end)).toBe('active');
  });
});
