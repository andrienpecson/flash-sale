import { supabase } from '../db/supabase';

export interface SaleRecord {
  id: string;
  productName: string;
  productDescription: string | null;
  startTime: string;
  endTime: string;
  totalStock: number;
};

/**
 * Load a sale's definition (window, total stock, product) from Supabase,
 * flattening the joined product relation.
 *
 * @param saleId - ID of the sale to load.
 * @returns The normalized sale record, or null when no row matches.
 * @throws If the Supabase query fails.
 */
export async function findSaleById(saleId: string): Promise<SaleRecord | null> {
  const { data, error } = await supabase
    .from('flash_sales')
    .select('id, start_time, end_time, total_stock, products ( name, description )')
    .eq('id', saleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load sale ${saleId}: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  // Supabase types the joined relation loosely; normalize one-to-one vs array.
  const { id, products, start_time, end_time, total_stock } = data;
  const product = Array.isArray(products) ? products[0] : products;

  return {
    id,
    productName: product?.name ?? 'Unknown product',
    productDescription: product?.description ?? null,
    startTime: start_time,
    endTime: end_time,
    totalStock: total_stock,
  };
}
