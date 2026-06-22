import { env } from '../config/env';
import { redis } from '../db/redis';
import { findSaleById } from '../models/sale.model';
import { listOrderEmails } from '../models/order.model';
import { seedSaleState } from '../models/reserve.model';

async function main(): Promise<void> {
  const sale = await findSaleById(env.ACTIVE_SALE_ID);
  if (!sale) {
    throw new Error(`Sale not found in Supabase: ${env.ACTIVE_SALE_ID}`);
  }

  const { startTime, endTime, totalStock } = sale;

  // Load existing buyers from the database. Subtract them from total stock and
  // restore them to the buyers set, so re-seeding neither oversells nor lets a
  // past buyer purchase again.
  const buyers = await listOrderEmails(env.ACTIVE_SALE_ID);
  const placed = buyers.length;
  const currentStock = Math.max(0, totalStock - placed);

  // seedSaleState wants the Redis shape: epoch-ms window + stock count.
  // Postgres returns the times as ISO strings, so convert here.
  await seedSaleState(env.ACTIVE_SALE_ID, {
    startMs: new Date(startTime).getTime(),
    endMs: new Date(endTime).getTime(),
    stock: currentStock,
    buyers,
  });

  console.log(
    `Seeded sale ${env.ACTIVE_SALE_ID} into Redis — stock=${currentStock} (total ${totalStock} − ${placed} placed), buyers re-seeded (${placed}).`,
  );
}

main()
  .catch((err) => {
    console.error('[seed:redis] failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => {
    void redis.quit();
  });
