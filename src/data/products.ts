import type { Product } from "@/types";

export const products: Product[] = [
  {
    id: "prd-001",
    slug: "njehia-delivery-tee",
    name: "Delivery Not Promises Tee",
    price: 1500,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80",
    description: "Soft cotton tee with restrained ward mark.",
    stock: 48,
    leaderId: "ldr-001",
  },
  {
    id: "prd-002",
    slug: "njehia-cap",
    name: "Thika Town Cap",
    price: 1200,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&q=80",
    description: "Structured cap with embroidered wordmark.",
    stock: 32,
    leaderId: "ldr-001",
  },
  {
    id: "prd-003",
    slug: "njehia-tote",
    name: "Visible Development Tote",
    price: 900,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1590874103328-eac38a67437a?w=800&q=80",
    description: "Canvas tote for community events and volunteer days.",
    stock: 60,
    leaderId: "ldr-001",
  },
  {
    id: "prd-004",
    slug: "otieno-polo",
    name: "Kisumu Central Polo",
    price: 2200,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80",
    description: "Clean polo with subtle constituency embroidery.",
    stock: 24,
    leaderId: "ldr-002",
  },
  {
    id: "prd-005",
    slug: "hassan-hoodie",
    name: "Coast Forward Hoodie",
    price: 3500,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80",
    description: "Premium fleece with aspirant movement mark.",
    stock: 18,
    leaderId: "ldr-003",
  },
  {
    id: "prd-006",
    slug: "hassan-pin",
    name: "Movement Lapel Pin",
    price: 500,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80",
    description: "Minimal enamel pin for supporters.",
    stock: 120,
    leaderId: "ldr-003",
  },
  {
    id: "prd-007",
    slug: "mwangi-scarf",
    name: "Safe Routes Scarf",
    price: 1800,
    currency: "KES",
    image:
      "https://images.unsplash.com/photo-1520903920245-00d892cb46ff?w=800&q=80",
    description: "Lightweight scarf in movement colours.",
    stock: 40,
    leaderId: "ldr-005",
  },
];

export function getProductsByIds(ids: string[]) {
  return products.filter((p) => ids.includes(p.id));
}

export function getProductsByLeader(leaderId: string) {
  return products.filter((p) => p.leaderId === leaderId);
}
