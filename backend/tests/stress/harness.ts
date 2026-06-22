import autocannon from 'autocannon';

export interface StressScenario {
  title: string;
  maxSuccess: number;
  emailFor: (n: number) => string;
}

/**
 * Drive an autocannon load test against `POST /api/purchase`, then summarize the
 * run: throughput/latency, a breakdown of purchase outcomes by status code, and
 * a PASS/FAIL verdict. Fails (exit code 1) on oversell (more 201s than the
 * scenario's ceiling) or any 5xx. Tunable via the BASE_URL, CONNECTIONS, and
 * AMOUNT env vars.
 *
 * @param scenario - The load scenario: report title, success ceiling, and a
 *   per-request buyer-email generator.
 * @returns Resolves when the run and reporting finish; the verdict is conveyed
 *   via `process.exitCode` (1 on failure, 0 on pass).
 */
export async function runStress(scenario: StressScenario): Promise<void> {
  const url = process.env.BASE_URL ?? 'http://localhost:3000';
  const connections = Number(process.env.CONNECTIONS ?? 50); // parallel "users"
  const amount = Number(process.env.AMOUNT ?? 2000); // total requests to send

  let n: number = 0;
  const result = await autocannon({
    title: scenario.title,
    url,
    connections,
    amount,
    requests: [
      {
        method: 'POST',
        path: '/api/purchase',
        headers: { 'content-type': 'application/json' },
        // Called before each request — swap in this request's buyer email.
        setupRequest: (req) => {
          req.body = JSON.stringify({ userEmail: scenario.emailFor(n++) });
          return req;
        },
      },
    ],
  });

  // autocannon's standard report: req/sec (throughput) + latency p50/p97.5/p99.
  console.log(autocannon.printResult(result));

  // Map HTTP status codes back to purchase outcomes (autocannon only sees codes).
  const stats = result.statusCodeStats;
  const success = stats?.['201']?.count ?? 0; // reserved + persisted
  const already = stats?.['200']?.count ?? 0; // already_purchased
  const soldOut = stats?.['409']?.count ?? 0; // sold_out / not_active / ended
  const limited = stats?.['429']?.count ?? 0; // rate limited — see below
  const serverErr = result['5xx'];

  console.log('Purchase outcomes:');
  console.log(`  success (201)          : ${success}`);
  console.log(`  already_purchased (200): ${already}`);
  console.log(`  sold_out etc. (409)    : ${soldOut}`);
  console.log(`  rate_limited (429)     : ${limited}`);
  console.log(`  server errors (5xx)    : ${serverErr}`);

  if (limited > 0) {
    console.log(
      '\n⚠️  Got 429s — the per-IP rate limiter throttled the test. Start the\n' +
      '    server with `npm run dev:stress` (same as dev, with the limiter raised).',
    );
  }

  const oversold = success > scenario.maxSuccess;

  if (oversold) {
    console.error(`\n❌ FAIL: ${success} successes exceed the ${scenario.maxSuccess} ceiling — OVERSOLD.`);
  }

  if (serverErr > 0) {
    console.error(`\n❌ FAIL: ${serverErr} server errors (5xx) under load.`);
  }

  if (!oversold && serverErr === 0) {
    console.log(`\n✅ PASS: ${success} success ≤ ${scenario.maxSuccess} ceiling, no server errors.`);
  }

  process.exitCode = oversold || serverErr > 0 ? 1 : 0;
}
