"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { ImageField } from "@/components/ui/ImageField";
import { SafeImage } from "@/components/ui/SafeImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Product } from "@/types";
import { formatCurrency } from "@/lib/utils";

export default function PoliticianMerchandisePage() {
  const { leader } = usePoliticianProfile();
  const {
    getProductsByLeader,
    upsertProduct,
    deleteProduct,
    upsertLeader,
  } = useContent();
  const [editing, setEditing] = useState<Product | null>(null);

  const rows = useMemo(
    () => (leader ? getProductsByLeader(leader.id) : []),
    [leader, getProductsByLeader]
  );

  if (!leader) return null;

  return (
    <div>
      <AdminHeader
        title="Merchandise"
        description="Products citizens can request via Faida from your public merchandise tab."
        action={
          <Button
            type="button"
            onClick={() =>
              setEditing({
                id: createId("prd"),
                slug: "",
                name: "",
                price: 1000,
                currency: "KES",
                image:
                  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80",
                description: "",
                stock: 10,
                leaderId: leader.id,
              })
            }
          >
            Add product
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No merchandise yet"
          description="Add a product with an image, price, and stock count."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const stock = Number(p.stock) || 0;
            return (
              <article
                key={p.id}
                className="overflow-hidden rounded-lg border border-border bg-surface"
              >
                <div className="relative aspect-[4/3] bg-bg-elevated">
                  <SafeImage
                    src={p.image}
                    alt={p.name}
                    fill
                    className="object-cover"
                    sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                  />
                </div>
                <div className="space-y-1 p-4">
                  <h3 className="text-small font-medium text-ink">{p.name}</h3>
                  <p className="font-mono text-small text-accent">
                    {formatCurrency(p.price, p.currency)}
                  </p>
                  <p className="text-caption text-ink-muted">
                    {stock === 0
                      ? "Out of stock"
                      : `${stock} ${stock === 1 ? "piece" : "pieces"} in stock`}
                  </p>
                  <div className="flex gap-2 pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing(
                          structuredClone({
                            ...p,
                            stock: Number(p.stock) || 0,
                          })
                        )
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!confirm("Delete this product?")) return;
                        deleteProduct(p.id);
                        upsertLeader({
                          ...leader,
                          productIds: leader.productIds.filter(
                            (id) => id !== p.id
                          ),
                        });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AdminDrawer
        open={!!editing}
        title="Product"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth
              onClick={() => {
                if (!editing) return;
                const saved = {
                  ...editing,
                  slug: editing.slug || slugify(editing.name),
                  price: Number(editing.price) || 0,
                  stock: Math.max(0, Math.floor(Number(editing.stock) || 0)),
                  leaderId: leader.id,
                };
                upsertProduct(saved);
                if (!leader.productIds.includes(saved.id)) {
                  upsertLeader({
                    ...leader,
                    productIds: [...leader.productIds, saved.id],
                  });
                }
                setEditing(null);
              }}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <AdminField label="Name">
              <AdminInput
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </AdminField>
            <AdminField label="Price (KES)">
              <AdminInput
                type="number"
                value={editing.price}
                onChange={(e) =>
                  setEditing({ ...editing, price: Number(e.target.value) })
                }
              />
            </AdminField>
            <AdminField label="Pieces in stock">
              <AdminInput
                type="number"
                min={0}
                step={1}
                value={editing.stock}
                onChange={(e) =>
                  setEditing({ ...editing, stock: Number(e.target.value) })
                }
              />
            </AdminField>
            <ImageField
              label="Product image"
              value={editing.image}
              onChange={(image) => setEditing({ ...editing, image })}
              hint="Product photo citizens see on your merchandise tab. Paste a URL or upload from this device."
            />
            <AdminField label="Description">
              <AdminTextarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </AdminField>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
