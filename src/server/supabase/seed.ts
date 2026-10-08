import { createSeedAdlyContent } from "@/data/adly";
import { createSeedContent, createSeedUsers, type PlatformContent } from "@/lib/store";
import { hashPassword } from "@/server/auth/password";
import type { SeedCounts } from "@/server/domain";
import { rpc, type SupabaseCall } from "@/server/supabase/rpc";
import type { Poll } from "@/types";
import type { AdlyContent } from "@/types/adly";

function without<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

function call(label: string, fn: string, args: Record<string, unknown>): { label: string; call: SupabaseCall } {
  return { label, call: { kind: "rpc", fn, args } };
}

const leaderLinks = ["projectIds", "opportunityIds", "mediaIds", "pollIds", "productIds"];
const projectLinks = ["leaderIds", "opportunityIds", "mediaIds"];
const mediaLinks = ["relatedOpportunityIds", "relatedMediaIds"];
const opportunityLinks = ["relatedMediaIds"];

export function scopePoll(poll: Poll): Poll {
  return {
    ...poll,
    options: poll.options.map((option) => ({
      ...option,
      id: option.id.startsWith(`${poll.id}-`) ? option.id : `${poll.id}-${option.id}`,
    })),
  };
}

export function contentSeedPhases(content = createSeedContent()): { label: string; call: SupabaseCall }[][] {
  return [
    content.leaders.map((item) => call(`leader ${item.id}`, "upsert_leader", { doc: without(item, leaderLinks) })),
    content.projects.map((item) => call(`project ${item.id}`, "upsert_project", { doc: without(item, projectLinks) })),
    content.milestones.map((item) => call(`milestone ${item.id}`, "upsert_milestone", { doc: item })),
    content.media.map((item) => call(`media ${item.id}`, "upsert_media", { doc: without(item, mediaLinks) })),
    content.opportunities.map((item) =>
      call(`opportunity ${item.id}`, "upsert_opportunity", { doc: without(item, opportunityLinks) })
    ),
    content.polls.map((item) => call(`poll ${item.id}`, "upsert_poll", { doc: scopePoll(item) })),
    content.products.map((item) => call(`product ${item.id}`, "upsert_product", { doc: item })),
    content.media.map((item) => call(`media ${item.id}`, "upsert_media", { doc: item })),
    content.opportunities.map((item) => call(`opportunity ${item.id}`, "upsert_opportunity", { doc: item })),
    content.leaders.map((item) => call(`leader ${item.id}`, "upsert_leader", { doc: item })),
    content.projects.map((item) => call(`project ${item.id}`, "upsert_project", { doc: item })),
  ];
}

export function contentSeedCalls(content = createSeedContent()): { label: string; call: SupabaseCall }[] {
  return contentSeedPhases(content).flat();
}

export function userSeedCalls(): { label: string; call: SupabaseCall }[] {
  return createSeedUsers().map((account) => {
    const { password, ...doc } = account;
    return call(`user ${account.email}`, "upsert_user", {
      doc,
      p_password_hash: hashPassword(password),
    });
  });
}

export function adlySeedPhases(adly = createSeedAdlyContent()): { label: string; call: SupabaseCall }[][] {
  return [
    adly.creatives.map((item) => call(`creative ${item.id}`, "upsert_creative", { doc: item })),
    adly.campaigns.map((item) => call(`campaign ${item.id}`, "upsert_campaign", { doc: item })),
    [
      ...adly.policyReviews.map((item) => call(`policy review ${item.id}`, "upsert_policy_review", { doc: item })),
      ...adly.posters.map((item) => call(`poster ${item.id}`, "upsert_poster", { doc: item })),
      ...adly.timelapses.map((item) =>
        call(`timelapse ${item.id}`, "upsert_timelapse", { doc: without(item, ["milestones"]) })
      ),
      ...adly.simulations.map((item) => call(`simulation ${item.id}`, "upsert_simulation", { doc: item })),
    ],
    adly.insights.map((item) => call(`insight ${item.id}`, "upsert_insight", { doc: item })),
  ];
}

export function adlySeedCalls(adly = createSeedAdlyContent()): { label: string; call: SupabaseCall }[] {
  return adlySeedPhases(adly).flat();
}

async function runSteps(steps: { label: string; call: SupabaseCall }[]): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < steps.length) {
      const current = index;
      index += 1;
      const step = steps[current];
      if (!step || step.call.kind !== "rpc") return;
      try {
        await rpc(step.call.fn, step.call.args);
      } catch (error) {
        const message = error instanceof Error ? error.message : "seed failed";
        throw new Error(`${step.label}: ${message}`);
      }
    }
  }
  const width = Math.min(6, steps.length);
  await Promise.all(Array.from({ length: width }, () => worker()));
}

export async function seedSupabase(): Promise<void> {
  const content = createSeedContent();
  const adly = createSeedAdlyContent();
  const counts = await rpc<SeedCounts>("counts");
  if (
    counts.leaders >= content.leaders.length &&
    counts.users >= createSeedUsers().length &&
    counts.projects >= content.projects.length &&
    counts.campaigns >= adly.campaigns.length &&
    counts.timelapses >= adly.timelapses.length &&
    counts.insights >= adly.insights.length
  ) {
    return;
  }
  for (const phase of contentSeedPhases(content)) await runSteps(phase);
  await runSteps(userSeedCalls());
  for (const phase of adlySeedPhases(adly)) await runSteps(phase);
}

export function seedContentShape(): PlatformContent {
  return createSeedContent();
}

export function seedAdlyShape(): AdlyContent {
  return createSeedAdlyContent();
}
