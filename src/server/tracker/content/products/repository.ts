import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "@/types";
import type { ContentRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { assignSlugs, findBySlug, isUuid, rowSlug } from "@/server/tracker/slug";
import {
  defaultContentClients,
  fail,
  figuresForUsers,
  optionalUserClient,
  readRowForWrite,
  requireCaller,
  resolveOwner,
  type ContentClients,
} from "@/server/tracker/content/media/session";
import { groupIdsByOwner, leaderIdForOwner, pickByIds } from "@/server/tracker/content/media/shared";
import { mapProductRow, productWrite, type ProductRow } from "./mapping";

export type ProductRepository = Pick<
  Promisified<ContentRepository>,
  "listProducts" | "findProduct" | "findProductBySlug" | "listProductsByLeader" | "upsertProduct" | "deleteProduct"
>;

/**
 * Product on public.products (content-mapping.md §10).
 *
 * Reads: anon with an explicit `is_active = true` filter (RLS also lets an
 * author see their own inactive rows; public lists must not). findProduct(id)
 * also finds the caller's own inactive product through their session.
 * Writes: caller's session (products_owner_write, author_id = auth.uid());
 * admin edits of another leader's product use the service client. author_id
 * must be the leader's user: settle_payment_to_wallets credits shop revenue to it.
 */
export function createProductRepository(clients: ContentClients = defaultContentClients): ProductRepository {
  async function loadPublic(): Promise<Product[]> {
    const anon = clients.anon();
    const { data, error } = await anon
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) fail("Could not load products", error);
    const rows = (data ?? []) as ProductRow[];
    return mapRows(anon, rows, rows);
  }

  async function findOwnInactive(id: string): Promise<Product | undefined> {
    const client = await optionalUserClient(clients);
    if (!client) return undefined;
    const { data, error } = await client.from("products").select("*").eq("id", id).maybeSingle();
    if (error || !data) return undefined;
    const row = data as ProductRow;
    return (await mapRows(client, [row], [row]))[0];
  }

  async function findProduct(id: string): Promise<Product | undefined> {
    if (!isUuid(id)) return undefined;
    return (await loadPublic()).find((product) => product.id === id) ?? findOwnInactive(id);
  }

  return {
    listProducts: loadPublic,
    findProduct,
    async findProductBySlug(slug) {
      const products = await loadPublic();
      return findBySlug(products, new Map(products.map((product) => [product.id, product.slug])), slug);
    },
    async listProductsByLeader(leaderId) {
      // leaderId is political_figures.id, or the author's user id when they have no figure (leaderIdForOwner).
      return (await loadPublic()).filter((product) => product.leaderId === leaderId);
    },
    async upsertProduct(product) {
      const caller = await requireCaller(clients);
      const existing = await readRowForWrite<ProductRow>(caller, clients, "products", product.id);
      const target = await resolveOwner(caller, clients, existing ? { ownerId: existing.author_id } : null, product.leaderId);
      const write = productWrite(product, existing);
      const result = existing
        ? await target.client.from("products").update(write).eq("id", existing.id).select("*").single()
        : await target.client.from("products").insert({ ...write, author_id: target.ownerId }).select("*").single();
      if (result.error) fail("Could not save the product", result.error);
      const row = result.data as ProductRow;
      return (await findProduct(row.id)) ?? (await mapRows(target.client, [row], [row]))[0];
    },
    async deleteProduct(id) {
      const caller = await requireCaller(clients);
      const existing = await readRowForWrite<ProductRow>(caller, clients, "products", id);
      if (!existing) return false;
      const target = await resolveOwner(caller, clients, { ownerId: existing.author_id }, undefined);
      const { data, error } = await target.client.from("products").delete().eq("id", id).select("id");
      if (error) fail("Could not delete the product", error);
      return (data ?? []).length > 0;
    },
  };
}

async function mapRows(client: SupabaseClient, rows: ProductRow[], slugScope: ProductRow[]): Promise<Product[]> {
  const slugs = assignSlugs(slugScope, (row) => row.name);
  const figures = await figuresForUsers(client, rows.map((row) => row.author_id ?? ""));
  return rows.map((row) =>
    mapProductRow(row, {
      slug: slugs.get(row.id) ?? rowSlug(row.name, row.id),
      leaderId: leaderIdForOwner(row.author_id, figures),
    })
  );
}

/**
 * Links helper for the leaders slice: auth user id -> ids of their active
 * products (Leader.productIds = products.author_id = uid, §3). Pass
 * political_figures.user_id values. Inactive products are left out.
 */
export async function productIdsByAuthor(
  authorIds: string[],
  client: SupabaseClient = defaultContentClients.anon()
): Promise<Map<string, string[]>> {
  const ids = [...new Set(authorIds.filter(isUuid))];
  if (!ids.length) return new Map();
  const { data, error } = await client
    .from("products")
    .select("id, author_id")
    .eq("is_active", true)
    .in("author_id", ids)
    .order("created_at", { ascending: false });
  if (error) fail("Could not load product links", error);
  return groupIdsByOwner((data ?? []) as { id: string; author_id: string | null }[], (row) => row.author_id);
}
