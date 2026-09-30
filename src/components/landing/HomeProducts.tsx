"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { useFaida } from "@/components/faida/FaidaProvider";

const products = [
  {
    id: "siasa",
    label: "01 / GIS + Project tracking",
    name: "M-Taji Siasa",
    body: "Put every project on the map. Show live locations, milestones, progress and the opportunities each development creates.",
    image: "/home/product-siasa.jpg",
    cta: "Explore M-Taji Siasa",
    href: "/projects",
  },
  {
    id: "adly",
    label: "02 / AI creative + Advertising",
    name: "M-Taji Adly",
    body: "Create targeted ads, AI progress videos and project simulations that make your record and vision easier to understand.",
    image: "/home/product-adly.jpg",
    cta: "Explore M-Taji Adly",
    href: "/adly",
  },
  {
    id: "faida",
    label: "03 / Community engagement",
    name: "M-Taji Faida",
    body: "Keep citizens close to the work with a WhatsApp-powered engagement agent for updates, questions and community feedback.",
    image: "/home/product-faida.jpg",
    cta: "Explore M-Taji Faida",
    href: null,
  },
] as const;

export function HomeProducts() {
  const { openFaida } = useFaida();

  return (
    <CardCarousel
      label="M-Taji products"
      desktop="carousel"
      slideClassName="w-[88%] sm:w-[75%] lg:w-[64%]"
    >
      {products.map((p) => (
        <article
          key={p.id}
          className="flex h-full flex-col overflow-hidden border border-border bg-surface md:flex-row"
        >
          <div className="relative aspect-[4/3] md:aspect-auto md:w-[54%] md:min-h-[300px]">
            <Image
              src={p.image}
              alt={`Illustrative image for ${p.label}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 88vw, 40vw"
            />
            <span className="image-label absolute bottom-3 left-3">
              Illustrative image
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-center p-6 md:p-10">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-brand-red">
              {p.label}
            </p>
            <h3 className="mt-4 text-[1.75rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
              {p.name}
            </h3>
            <p className="mt-4 text-small leading-relaxed text-ink-muted">
              {p.body}
            </p>
            {p.href ? (
              <Link
                href={p.href}
                className="mt-6 inline-flex items-center gap-2 self-start text-small font-bold text-ink transition-colors hover:text-accent"
              >
                {p.cta}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openFaida("connect", "M-Taji Faida")}
                className="mt-6 inline-flex items-center gap-2 self-start text-small font-bold text-ink transition-colors hover:text-accent"
              >
                {p.cta}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </article>
      ))}
    </CardCarousel>
  );
}
