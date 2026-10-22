import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  isProductPublic,
  mapProductRow,
  productImage,
  productImages,
  productWrite,
  toPrice,
  type ProductRow,
} from "./mapping";

/** Shaped like the live row: inactive with status 'active', no images, price 500.00, stock 0. */
function liveRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "2f1bec7b-ba8f-499c-a7d4-7f9e41b7ac5f",
    name: "Campaign T-shirt",
    description: null,
    price: 500,
    stock_quantity: 0,
    image_url: null,
    images: [],
    status: "active",
    is_active: false,
    author_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

describe("visibility", () => {
  it("trusts is_active over status", () => {
    expect(isProductPublic(liveRow())).toBe(false);
    expect(isProductPublic(liveRow({ is_active: true, status: "archived" }))).toBe(true);
  });
});

describe("mapProductRow", () => {
  it("maps the live inactive row with no image", () => {
    expect(mapProductRow(liveRow(), { slug: "campaign-t-shirt", leaderId: "fig" })).toEqual({
      id: "2f1bec7b-ba8f-499c-a7d4-7f9e41b7ac5f",
      slug: "campaign-t-shirt",
      name: "Campaign T-shirt",
      price: 500,
      currency: "KES",
      image: "",
      description: "",
      stock: 0,
      leaderId: "fig",
    });
  });
  it("reads numeric price sent as a string and clamps bad values", () => {
    expect(toPrice("500.00")).toBe(500);
    expect(toPrice("abc")).toBe(0);
    expect(toPrice(-3)).toBe(0);
    expect(toPrice(null)).toBe(0);
    expect(mapProductRow(liveRow({ price: "1250.50", stock_quantity: null }), { slug: "s" })).toMatchObject({
      price: 1250.5,
      stock: 0,
      leaderId: "",
    });
  });
  it("prefers images[0] and falls back to image_url", () => {
    expect(productImage({ images: ["a.jpg", "b.jpg"], image_url: "old.jpg" })).toBe("a.jpg");
    expect(productImage({ images: [], image_url: "old.jpg" })).toBe("old.jpg");
    expect(productImage({ images: null, image_url: null })).toBe("");
  });
});

describe("productImages", () => {
  it("puts the cover first and keeps the other Tracker photos", () => {
    const existing = liveRow({ images: ["old.jpg", "side.jpg"] });
    expect(productImages("new.jpg", existing)).toEqual(["new.jpg", "side.jpg"]);
    expect(productImages("side.jpg", existing)).toEqual(["side.jpg"]);
    expect(productImages("old.jpg", existing)).toEqual(["old.jpg", "side.jpg"]);
  });
  it("drops the old cover when the image is cleared", () => {
    expect(productImages("", liveRow({ images: ["old.jpg", "side.jpg"] }))).toEqual(["side.jpg"]);
    expect(productImages("", liveRow({ images: [], image_url: "legacy.jpg" }))).toEqual([]);
    expect(productImages(undefined, null)).toEqual([]);
  });
});

describe("productWrite", () => {
  const product: Product = {
    id: "prd-1",
    slug: "s",
    name: " Cap ",
    price: 800,
    currency: "USD",
    image: "cap.jpg",
    description: "",
    stock: 12.7,
    leaderId: "fig",
  };
  const now = new Date("2026-10-22T08:00:00Z");

  it("builds an insert: active, both image columns, no currency", () => {
    expect(productWrite(product, null, now)).toEqual({
      name: "Cap",
      description: null,
      price: 800,
      stock_quantity: 12,
      images: ["cap.jpg"],
      image_url: "cap.jpg",
      updated_at: now.toISOString(),
      is_active: true,
      status: "active",
    });
  });
  it("leaves visibility alone on update, so a hidden product stays hidden", () => {
    const write = productWrite(product, liveRow(), now);
    expect(write).not.toHaveProperty("is_active");
    expect(write).not.toHaveProperty("status");
    expect(write).not.toHaveProperty("author_id");
  });
  it("writes a null image_url and non-negative stock when empty", () => {
    const write = productWrite({ ...product, image: "", stock: -4, price: Number.NaN }, null, now);
    expect(write.image_url).toBeNull();
    expect(write.images).toEqual([]);
    expect(write.stock_quantity).toBe(0);
    expect(write.price).toBe(0);
  });
});
