import { env } from '../../src/config/env';
import { redis } from '../../src/db/redis';
import { deleteOrdersByEmailLike } from '../../src/models/order.model';
import { clearSaleState } from '../../src/models/reserve.model';

// Wipe the load-test footprint from both stores. The stress tests use
// `@loadtest.dev` emails (easy to filter) and drive the active sale's Redis keys.
async function main(): Promise<void> {
  // Durable store: delete the throwaway order rows (all @loadtest.dev).
  const deleted = await deleteOrdersByEmailLike('%@loadtest.dev');
  console.log(`Deleted ${deleted} @loadtest.dev order row(s) from Supabase.`);
}

main()
  .catch((err: unknown) => {
    console.error('[stress:clean] failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => {
    void redis.quit();
  });
