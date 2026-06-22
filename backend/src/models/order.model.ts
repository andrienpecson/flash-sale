import { supabase } from '../db/supabase';

/**
 * Count of durable orders for this sale. Used as the cold fallback for remaining
 * stock (totalStock − countOrders) when the Redis hot counter is unavailable.
 *
 * @param saleId - ID of the sale to count orders for.
 * @returns The number of persisted orders (0 when none).
 * @throws If the Supabase query fails.
 */
export async function countOrders(saleId: string): Promise<number> {
  const { count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('sale_id', saleId);

  if (error) {
    throw new Error(`Failed to count orders for sale ${saleId}: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Emails of every user with a durable order for this sale. Used by
 * `npm run seed:redis` to repopulate Redis's buyer-dedup set after a flush, so
 * users who already purchased can't reserve a second unit on re-seed.
 *
 * @param saleId - ID of the sale to list buyer emails for.
 * @returns The buyer email from each order row.
 * @throws If the Supabase query fails.
 */
export async function listOrderEmails(saleId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('user_email')
    .eq('sale_id', saleId);

  if (error) {
    throw new Error(`Failed to list order emails for sale ${saleId}: ${error.message}`);
  }
  return (data ?? []).map((row) => row.user_email);
}

// 23505 = Postgres unique_violation on orders (sale_id, user_email).
export const INSERT_ORDER_UNIQUE_VIOLATION_CODE = '23505';

/**
 * Durably persist a winning purchase as an order row.
 *
 * @param saleId - ID of the sale the order belongs to.
 * @param userEmail - Email of the purchasing user.
 * @throws An `Error & { code?: string }` on failure; `code` carries the Postgres
 *   error code, so the service can tell a duplicate
 *   ({@link INSERT_ORDER_UNIQUE_VIOLATION_CODE}) from a genuine write failure.
 */
export async function insertOrder(saleId: string, userEmail: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .insert({ sale_id: saleId, user_email: userEmail });

  if (error) {
    // Preserve the Postgres error code (e.g. '23505' unique_violation on the
    // (sale_id, user_email) constraint) so the service can distinguish a
    // duplicate from a genuine write failure.
    const wrapped = new Error(
      `Failed to insert order for user ${userEmail}: ${error.message}`,
    ) as Error & { code?: string };
    wrapped.code = error.code;
    throw wrapped;
  }
}

/**
 * Delete orders whose user_email matches a SQL LIKE pattern. Used by
 * `npm run stress:clean` to purge load-test rows (pattern '%@loadtest.dev').
 *
 * @param pattern - SQL LIKE pattern matched against user_email.
 * @returns The number of rows removed.
 * @throws If the Supabase delete fails.
 */
export async function deleteOrdersByEmailLike(pattern: string): Promise<number> {
  const { data, error } = await supabase
    .from('orders')
    .delete()
    .like('user_email', pattern)
    .select('id'); // return the deleted rows so we can count them

  if (error) {
    throw new Error(`Failed to delete orders matching ${pattern}: ${error.message}`);
  }
  return data?.length ?? 0;
}
