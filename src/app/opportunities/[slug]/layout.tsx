import type { Metadata } from "next";
import type { ReactNode } from "react";
import { InitialOpportunityProvider } from "@/components/opportunities/InitialOpportunity";
import { findPublicOpportunity, opportunityMetadata } from "@/server/seo";

type Params = { params: Promise<{ slug: string }> };

/** Server-rendered title, description and image for this opportunity (X's ad review reads these). */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return opportunityMetadata(decodeURIComponent(slug));
}

/**
 * The opportunity read on the server, so its server HTML shows the listing
 * (not "Loading…") to ad reviewers and crawlers that don't run the client app.
 */
export default async function OpportunityLayout({ children, params }: Params & { children: ReactNode }) {
  const { slug } = await params;
  const opportunity = (await findPublicOpportunity(decodeURIComponent(slug))) ?? null;
  return <InitialOpportunityProvider opportunity={opportunity}>{children}</InitialOpportunityProvider>;
}
