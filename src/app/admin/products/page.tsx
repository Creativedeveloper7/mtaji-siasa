"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ImageField } from "@/components/ui/ImageField";
import { SafeImage } from "@/components/ui/SafeImage";
import {
  AdminDrawer,
  AdminField,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminSelect,
  AdminTable,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { useSaveAction } from "@/components/admin/useSaveAction";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Product } from "@/types";
import { LoadingState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";

const emptyProduct = (leaderId = ""): Product => ({
  id: createId("prd"),
  slug: "",
  name: "",
  price: 1000,
  currency: "KES",
  image:
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80",
  description: "",
  stock: 10,
  leaderId,
});

export default function AdminProductsPage() {
  const { content, ready, upsertProduct, deleteProduct } = useContent();
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const { saving, error, setError, notice, setNotice, run, remove } = useSaveAction();

  const open = (item: Product) => {
    setError("");
    setEditing(item);
  };

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return content.products.filter(
      (p) => !q || p.name.toLowerCase().includes(q)
    );
  }, [content.products, query]);

  if (!ready) return <LoadingState />;

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
      })
    );
    if (result?.ok) setEditing(null);
  };

  return (
    <div>
      <AdminHeader
        title="Merchandise"
        description="Products shown on leader merchandise pages."
        action={
          <Button
            type="button"
            onClick={() =>
              open(emptyProduct(content.leaders[0]?.id || ""))
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
      <div className="mb-4 max-w-sm">
        <AdminInput placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <AdminTable headers={["Product", "Leader", "Price", "Stock", ""]}>
        {rows.map((p) => {
          const leader = content.leaders.find((l) => l.id === p.leaderId);
          const stock = Number(p.stock) || 0;
          return (
            <tr key={p.id}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                    <SafeImage
                      src={p.image}
                      alt={p.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                  <span className="text-ink">{p.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {leader ? `${leader.honorific} ${leader.name}` : p.leaderId}
              </td>
              <td className="px-4 py-3 font-mono text-accent">
                {formatCurrency(p.price, p.currency)}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {stock === 0 ? "Out of stock" : `${stock} pcs`}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
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
                    if (confirm("Delete this product?")) void remove(() => deleteProduct(p.id));
                  }}
                >
                  Delete
                </Button>
              </td>
            </tr>
          );
        })}
      </AdminTable>

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
            <Button type="button" variant="secondary" fullWidth disabled={saving} onClick={() => setEditing(null)}>
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
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    slug: editing.slug || slugify(e.target.value),
                  })
                }
              />
            </AdminField>
            <AdminField label="Leader">
              <AdminSelect
                value={editing.leaderId}
                onChange={(e) =>
                  setEditing({ ...editing, leaderId: e.target.value })
                }
              >
                {content.leaders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.honorific} {l.name}
                  </option>
                ))}
              </AdminSelect>
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
