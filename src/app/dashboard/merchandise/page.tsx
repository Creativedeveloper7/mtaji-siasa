"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { ImageField } from "@/components/ui/ImageField";
import { SafeImage } from "@/components/ui/SafeImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useSaveAction } from "@/components/admin/useSaveAction";
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
  } = useContent();
  const [editing, setEditing] = useState<Product | null>(null);
  const { saving, error, setError, notice, setNotice, run, remove } = useSaveAction();

  const open = (item: Product) => {
    setError("");
    setEditing(item);
  };

  const rows = useMemo(
    () => (leader ? getProductsByLeader(leader.id) : []),
    [leader, getProductsByLeader]
  );

  if (!leader) return null;

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Add a name before saving.");
      return;
    }
    const result = await run(() =>
      upsertProduct({
        ...editing,
        slug: editing.slug || slugify(editing.name),
        price: Number(editing.price) || 0,
        stock: Math.max(0, Math.floor(Number(editing.stock) || 0)),
        leaderId: leader.id,
      })
    );
    if (result?.ok) setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Merchandise"
        description="Products citizens can request via Faida from your public merchandise tab."
        action={
          <Button
            type="button"
            onClick={() =>
              open({
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

      {notice && (
        <AdminNotice
          className="mb-4"
          tone={notice.tone}
          messages={notice.messages}
          onDismiss={() => setNotice(null)}
        />
      )}
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
                        open(
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
                      disabled={saving}
                      onClick={() => {
                        if (!confirm("Delete this product?")) return;
                        void remove(() => deleteProduct(p.id));
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
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        footer={
          <div className="flex gap-2">
            <Button type="button" fullWidth disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={saving}
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
            {error && <AdminNotice messages={error} />}
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
