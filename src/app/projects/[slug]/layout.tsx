import type { Metadata } from "next";
import type { ReactNode } from "react";
import { InitialProjectProvider } from "@/components/project/InitialProject";
import { findPublicProject, projectMetadata } from "@/server/seo";

type Params = { params: Promise<{ slug: string }> };

/** Server-rendered title, description and image for this project. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return projectMetadata(decodeURIComponent(slug));
}

/**
 * The project read on the server, so its server HTML shows the project (not
 * "Loading…") to ad reviewers and crawlers that don't run the client app.
 */
export default async function ProjectLayout({ children, params }: Params & { children: ReactNode }) {
  const { slug } = await params;
  const project = (await findPublicProject(decodeURIComponent(slug))) ?? null;
  return <InitialProjectProvider project={project}>{children}</InitialProjectProvider>;
}
