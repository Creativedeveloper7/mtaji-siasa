import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types";

vi.mock("@/server/tracker/clients", () => ({
  anonClient: () => {
    throw new Error("not used");
  },
  userClient: async () => {
    throw new Error("not used");
  },
  serviceClient: () => {
    throw new Error("not used");
  },
}));

const { createProductRepository } = await import("./repository");
const { fakeContentClients } = await import("@/server/tracker/content/opportunities/fake.test-helpers");
const { ownerUserIdOf } = await import("@/server/tracker/content/media/shared");
type FakeState = import("@/server/tracker/content/opportunities/fake.test-helpers").FakeState;

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const NO_FIGURE = "66666666-6666-4666-8666-666666666666";
const FIG_OWNER = "44444444-4444-4444-8444-444444444444";
const FIG_OTHER = "55555555-5555-4555-8555-555555555555";
const PRODUCT = "77777777-7777-4777-8777-777777777777";
const PRODUCT_NF = "88888888-8888-4888-8888-888888888888";

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT,
    name: "Campaign T-shirt",
    description: "Cotton",
    price: 1200,
    stock_quantity: 10,
    image_url: "https://img/1.jpg",
    images: ["https://img/1.jpg"],
    status: "active",
    is_active: true,
    author_id: OWNER,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function db(userId: string, appRole?: string): FakeState {
  return {
    userId,
    appRole,
    calls: [],
    tables: {
      products: [productRow(), productRow({ id: PRODUCT_NF, name: "Cap", author_id: NO_FIGURE })],
      political_figures: [
        { id: FIG_OWNER, user_id: OWNER, name: "Hon. Owner", created_at: "2025-01-01T00:00:00Z" },
        { id: FIG_OTHER, user_id: OTHER, name: "Hon. Other", created_at: "2025-01-01T00:00:00Z" },
      ],
    },
  };
}

const newProduct = (leaderId: string): Product => ({
  id: "prd-local",
  slug: "",
  name: "Water bottle",
  price: 500,
  currency: "KES",
  image: "",
  description: "",
  stock: 3,
  leaderId,
});

describe("product repository", () => {
  it("exposes the author's user id; leaderId is the figure id or user-<uid>", async () => {
    const repo = createProductRepository(fakeContentClients(db(OWNER)));
    const shirt = await repo.findProduct(PRODUCT);
    expect(ownerUserIdOf(shirt)).toBe(OWNER);
    expect(shirt?.leaderId).toBe(FIG_OWNER);
    const cap = await repo.findProduct(PRODUCT_NF);
    expect(ownerUserIdOf(cap)).toBe(NO_FIGURE);
    expect(cap?.leaderId).toBe(`user-${NO_FIGURE}`);
    expect((await repo.listProductsByLeader(`user-${NO_FIGURE}`)).map((p) => p.id)).toEqual([PRODUCT_NF]);
  });

  it("never changes the author on update, even when leaderId names someone else", async () => {
    const state = db(OWNER);
    const repo = createProductRepository(fakeContentClients(state));
    const current = (await repo.findProduct(PRODUCT)) as Product;
    const saved = await repo.upsertProduct({ ...current, name: "Campaign T-shirt v2", leaderId: FIG_OTHER });
    const update = state.calls.find((call) => call.table === "products" && call.op === "update");
    expect(update?.values).not.toHaveProperty("author_id");
    expect(state.tables.products[0]).toMatchObject({ name: "Campaign T-shirt v2", author_id: OWNER });
    expect(ownerUserIdOf(saved)).toBe(OWNER);
    expect(saved.leaderId).toBe(FIG_OWNER);
  });

  it("keeps the author when an admin edits someone else's product (service client)", async () => {
    const state = db(ADMIN, "admin");
    const clients = fakeContentClients(state);
    const repo = createProductRepository(clients);
    const current = (await repo.findProduct(PRODUCT)) as Product;
    await repo.upsertProduct({ ...current, price: 1500, leaderId: FIG_OTHER });
    expect(state.tables.products[0]).toMatchObject({ price: 1500, author_id: OWNER });
  });

  it("refuses a non-admin creating a product for another leader (403, nothing written)", async () => {
    const state = db(OWNER);
    const repo = createProductRepository(fakeContentClients(state));
    await expect(repo.upsertProduct(newProduct(FIG_OTHER))).rejects.toMatchObject({ status: 403 });
    expect(state.calls.some((call) => call.table === "products" && call.op === "insert")).toBe(false);
    expect(state.tables.products).toHaveLength(2);
  });

  it("refuses a non-admin editing another user's product (403)", async () => {
    const state = db(OTHER);
    const repo = createProductRepository(fakeContentClients(state));
    const current = (await repo.findProduct(PRODUCT)) as Product;
    await expect(repo.upsertProduct({ ...current, price: 1 })).rejects.toMatchObject({ status: 403 });
    expect(state.tables.products[0].price).toBe(1200);
  });

  it("lets the owner create as themselves via their figure id or Phase 1 leader id", async () => {
    const state = db(OWNER);
    const repo = createProductRepository(fakeContentClients(state));
    await repo.upsertProduct(newProduct(FIG_OWNER));
    const own = db(NO_FIGURE);
    await createProductRepository(fakeContentClients(own)).upsertProduct(newProduct(`user-${NO_FIGURE}`));
    expect(state.tables.products.at(-1)).toMatchObject({ name: "Water bottle", author_id: OWNER, is_active: true });
    expect(own.tables.products.at(-1)).toMatchObject({ name: "Water bottle", author_id: NO_FIGURE });
  });

  it("lets an admin create a product for another leader, owned by that leader's user", async () => {
    const state = db(ADMIN, "admin");
    await createProductRepository(fakeContentClients(state)).upsertProduct(newProduct(FIG_OTHER));
    expect(state.tables.products.at(-1)).toMatchObject({ name: "Water bottle", author_id: OTHER });
  });
});
