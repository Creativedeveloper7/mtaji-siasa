import type { Product } from "@/types";
import { nullIfEmpty } from "@/server/tracker/content/media/shared";

/**
 * Product <-> public.products (content-mapping.md §10). Pure.
 *
 * - currency: no column; orders and payments are KES, so reads say "KES" and
 *   writes ignore Product.currency.
 * - image: `images[0]`, falling back to the older `image_url`. Writes set both.
 * - visibility: `is_active` decides (RLS and the Tracker MerchPage). The live
 *   row has is_active = false with status = 'active'; it is hidden.
 */

export const PRODUCT_CURRENCY = "KES";

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  /** numeric: PostgREST sends a number, but accept a string too */
  price: number | string | null;
  stock_quantity: number | null;
  image_url: string | null;
  images: string[] | null;
  status: string | null;
  is_active: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  category?: string | null;
  sku?: string | null;
  /** NEW (M1), generated */
  slug?: string | null;
}

export function toPrice(value: number | string | null | undefined): number {
  const price = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function productImage(row: Pick<ProductRow, "images" | "image_url">): string {
  const first = (row.images ?? []).find((url) => typeof url === "string" && url.trim());
  return first ?? row.image_url ?? "";
}

/** Shown on public pages only when this is true. */
export function isProductPublic(row: Pick<ProductRow, "is_active">): boolean {
  return row.is_active === true;
}

export interface ProductRelations {
  slug: string;
  /** from leaderIdForOwner(author_id): "" when the row has no author */
  leaderId?: string;
}

export function mapProductRow(row: ProductRow, rel: ProductRelations): Product {
  return {
    id: row.id,
    slug: rel.slug,
    name: row.name,
    price: toPrice(row.price),
    currency: PRODUCT_CURRENCY,
    image: productImage(row),
    description: row.description ?? "",
    stock: Math.max(0, Math.floor(row.stock_quantity ?? 0)),
    leaderId: rel.leaderId ?? "",
  };
}

/** images[] to write: the cover first, then the Tracker's other photos, without the old cover. */
export function productImages(image: string | undefined, existing: ProductRow | null): string[] {
  const cover = image?.trim() ?? "";
  const previousCover = existing ? productImage(existing) : "";
  const rest = (existing?.images ?? []).filter((url) => url && url !== cover && url !== previousCover);
  return cover ? [cover, ...rest] : rest;
}

/**
 * products columns Siasa writes. author_id is added by the repository on insert.
 * Visibility: insert sets is_active = true, status = 'active'. Update leaves
 * is_active and status alone, so a product hidden in the Tracker stays hidden
 * after a Siasa edit (Siasa has no visibility toggle).
 */
export function productWrite(product: Product, existing: ProductRow | null, now = new Date()): Record<string, unknown> {
  const images = productImages(product.image, existing);
  const write: Record<string, unknown> = {
    name: product.name.trim(),
    description: nullIfEmpty(product.description),
    price: toPrice(product.price),
    stock_quantity: Math.max(0, Math.floor(Number.isFinite(product.stock) ? product.stock : 0)),
    images,
    image_url: images[0] ?? null,
    updated_at: now.toISOString(),
  };
  if (!existing) {
    write.is_active = true;
    write.status = "active";
  }
  return write;
}
