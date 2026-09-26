"use client";

import type { Product } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { FaidaCTA } from "@/components/faida/FaidaCTA";
import { SafeImage } from "@/components/ui/SafeImage";

interface ProductCardProps {
  product: Product;
  leaderName?: string;
}

export function ProductCard({ product, leaderName }: ProductCardProps) {
  const stock = Number(product.stock) || 0;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="relative aspect-square bg-bg-elevated">
        <SafeImage
          src={product.image}
          alt={product.name}
          fill
          className="object-cover"
          sizes="(max-width:768px) 50vw, 25vw"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-small font-medium text-ink">{product.name}</h3>
        <p className="mt-1 font-mono text-small text-accent">
          {formatCurrency(product.price, product.currency)}
        </p>
        <p className="mt-1 text-caption text-ink-muted">
          {stock === 0
            ? "Out of stock"
            : `${stock} ${stock === 1 ? "piece" : "pieces"} in stock`}
        </p>
        <div className="mt-4">
          <FaidaCTA
            intent="connect"
            contextLabel={`${product.name}${leaderName ? ` · ${leaderName}` : ""}`}
            label="Request via Faida"
            size="sm"
            variant="outline"
            fullWidth
          />
        </div>
      </div>
    </article>
  );
}
