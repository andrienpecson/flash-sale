import { runStress } from './harness';

// ONE ITEM PER USER: every request is the SAME buyer hammering in parallel. At
// most ONE can win (201); the rest come back 200 already_purchased. The email is
// unique PER RUN, so the first request always wins even if you've run this before
// — no re-seed needed.
//   npm run stress:user
const EMAIL = process.env.EMAIL ?? `repeat-buyer-${Date.now()}@loadtest.dev`;

runStress({
  title: 'one-per-user (same buyer)',
  emailFor: () => EMAIL,
  maxSuccess: 1,
}).catch((err: unknown) => {
  console.error('[stress] failed:', (err as Error).message);
  process.exitCode = 1;
});
