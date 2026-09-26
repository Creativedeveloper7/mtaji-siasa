import type {
  Leader,
  MediaItem,
  Opportunity,
  OpportunityStatus,
  Project,
} from "@/types";

/** Derive opportunity status from explicit field or deadline. */
export function resolveOpportunityStatus(
  opportunity: Opportunity,
  now = Date.now()
): OpportunityStatus {
  if (opportunity.status) return opportunity.status;
  const deadline = new Date(opportunity.deadline).getTime();
  if (Number.isNaN(deadline)) return "open";
  const days = (deadline - now) / 86_400_000;
  if (days < 0) return "closed";
  if (days <= 14) return "closing-soon";
  return "open";
}

type RelatedPool = {
  opportunities: Opportunity[];
  media: MediaItem[];
  projects: Project[];
  leaders: Leader[];
};

function scoreOpportunity(
  candidate: Opportunity,
  source: {
    id?: string;
    category?: string;
    county?: string;
    projectId?: string;
    leaderId?: string;
  }
): number {
  if (candidate.id === source.id) return -Infinity;
  let score = 0;
  if (source.projectId && candidate.projectId === source.projectId) score += 50;
  if (source.leaderId && candidate.leaderId === source.leaderId) score += 25;
  if (source.county && candidate.county === source.county) score += 15;
  if (source.category && candidate.category === source.category) score += 10;
  return score;
}

function scoreMedia(
  candidate: MediaItem,
  source: {
    id?: string;
    category?: string;
    projectId?: string;
    leaderId?: string;
    county?: string;
  },
  projects: Project[]
): number {
  if (candidate.id === source.id) return -Infinity;
  let score = 0;
  if (source.projectId && candidate.projectId === source.projectId) score += 50;
  if (source.leaderId && candidate.leaderId === source.leaderId) score += 25;
  if (source.category && candidate.category === source.category) score += 10;
  if (source.county && candidate.projectId) {
    const project = projects.find((p) => p.id === candidate.projectId);
    if (project?.county === source.county) score += 15;
  }
  return score;
}

/** Rank related opportunities for any content entity. */
export function getRelatedOpportunities(
  pool: RelatedPool,
  source: {
    id?: string;
    category?: string;
    county?: string;
    projectId?: string;
    leaderId?: string;
    relatedIds?: string[];
  },
  limit = 4
): Opportunity[] {
  const direct = (source.relatedIds ?? [])
    .map((id) => pool.opportunities.find((o) => o.id === id))
    .filter((o): o is Opportunity => !!o && o.id !== source.id);

  const scored = pool.opportunities
    .map((o) => ({ o, score: scoreOpportunity(o, source) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.o);

  const seen = new Set<string>();
  const out: Opportunity[] = [];
  for (const item of [...direct, ...scored]) {
    if (seen.has(item.id) || item.id === source.id) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Rank related media/stories for any content entity. */
export function getRelatedMedia(
  pool: RelatedPool,
  source: {
    id?: string;
    category?: string;
    county?: string;
    projectId?: string;
    leaderId?: string;
    relatedIds?: string[];
  },
  limit = 4
): MediaItem[] {
  const direct = (source.relatedIds ?? [])
    .map((id) => pool.media.find((m) => m.id === id))
    .filter((m): m is MediaItem => !!m && m.id !== source.id);

  const scored = pool.media
    .map((m) => ({
      m,
      score: scoreMedia(m, source, pool.projects),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);

  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of [...direct, ...scored]) {
    if (seen.has(item.id) || item.id === source.id) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function getRelatedProject(
  pool: RelatedPool,
  projectId?: string
): Project | undefined {
  if (!projectId) return undefined;
  return pool.projects.find((p) => p.id === projectId);
}

export function getRelatedLeader(
  pool: RelatedPool,
  leaderId?: string
): Leader | undefined {
  if (!leaderId) return undefined;
  return pool.leaders.find((l) => l.id === leaderId);
}

/** Fill optional opportunity detail fields without inventing application URLs. */
export function opportunityDetailDefaults(opportunity: Opportunity): Opportunity {
  return {
    ...opportunity,
    openingDate: opportunity.openingDate ?? "2026-01-10",
    organization:
      opportunity.organization ??
      `Programme office · ${opportunity.county} County`,
    benefits: opportunity.benefits ?? [
      "Structured support through the listed programme",
      "Visibility to local coordinating offices",
      "Updates published on M-Taji Siasa where applicable",
    ],
    requirements: opportunity.requirements ?? [
      "Valid national identification",
      "Proof of residence or registration in the stated area",
      "Documents requested in the application instructions",
    ],
    applicationSteps: opportunity.applicationSteps ?? [
      "Confirm you meet the eligibility criteria",
      "Prepare the required documents",
      "Submit before the published deadline",
      "Monitor communications for shortlisting or next steps",
    ],
  };
}
