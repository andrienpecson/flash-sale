import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // All test files share one Redis DB (15), so run them one at a time to
    // avoid overwriting each other's keys.
    fileParallelism: false,
    // Env injected before any module under test is imported. src/config/env.ts
    // validates these at import time, so missing values would throw on import.
    //   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — dummies that only satisfy the
    //     required() guard in env.ts; Supabase is mocked in the tests, so these
    //     never hit the network.
    //   ACTIVE_SALE_ID — the sale key the reserve logic and test assertions use.
    //   REDIS_URL — REAL connection, pinned to db index 15 so tests can flushdb
    //     without touching dev data on db 0.
    //   RATE_LIMIT_MAX — cranked high to effectively disable the per-IP limiter,
    //     so the concurrency tests (many parallel POSTs from one IP) don't 429.
    env: {
      SUPABASE_URL: 'http://localhost',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      ACTIVE_SALE_ID: '11111111-1111-1111-1111-111111111111',
      REDIS_URL: 'redis://localhost:6379/15',
      RATE_LIMIT_MAX: '100000', // effectively disable throttling for HTTP tests
    },
  },
});
