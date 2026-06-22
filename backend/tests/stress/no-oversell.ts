import { runStress } from './harness';

const STOCK = Number(process.env.STOCK ?? 100);

runStress({
  title: 'no-oversell (distinct buyers)',
  emailFor: (n) => `buyer-${String(n).padStart(8, '0')}@loadtest.dev`,
  maxSuccess: STOCK,
}).catch((err: unknown) => {
  console.error('[stress] failed:', (err as Error).message);
  process.exitCode = 1;
});
