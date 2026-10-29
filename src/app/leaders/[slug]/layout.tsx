import type { Metadata } from "next";
import type { ReactNode } from "react";
import { leaderMetadata } from "@/server/seo";

type Params = { params: Promise<{ slug: string }> };

/** Server-rendered title, description and image for this leader (the pages render on the client). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return leaderMetadata(decodeURIComponent(slug));
}

export default function LeaderLayout({ children }: { children: ReactNode }) {
  return children;
}
