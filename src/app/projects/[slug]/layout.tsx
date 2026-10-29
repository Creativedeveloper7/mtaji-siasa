import type { Metadata } from "next";
import type { ReactNode } from "react";
import { projectMetadata } from "@/server/seo";

type Params = { params: Promise<{ slug: string }> };

/** Server-rendered title, description and image for this project (the page itself renders on the client). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return projectMetadata(decodeURIComponent(slug));
}

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return children;
}
