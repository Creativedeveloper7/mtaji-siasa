import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Opportunity, OpportunityApplication } from "@/types";
import type { AuthSession } from "@/types/auth";
import type { ApplicationRepository, ContentRepository } from "@/server/repositories";

/**
 * Tracker mode: an admin sees every application (listAll) and must be able
 * to review any of them, although row-level security hides them from the
 * admin's own client. Withdrawing stays with the applicant.
 */

const APPLICANT = "11111111-1111-4111-8111-111111111111";
const PUBLISHER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const APP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const state = vi.hoisted(() => ({
  tracker: true,
  applications: null as unknown as ApplicationRepository,
  content: null as unknown as ContentRepository,
}));

vi.mock("@/server", () => ({
  usesTracker: () => state.tracker,
  getRepositories: () => ({ applications: state.applications, content: state.content }),
}));

const { reviewApplication, withdrawApplication } = await import("@/server/applications/service");

const application: OpportunityApplication = {
  id: APP_ID,
  opportunityId: OPP_ID,
  applicantId: APPLICANT,
  fullName: "Jane",
  email: "jane@example.com",
  phone: "+254700000000",
  message: "I would like to apply for this role.",
  status: "submitted",
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};

const opportunity = {
  id: OPP_ID,
  slug: "road-jobs",
  title: "Road jobs",
  category: "jobs",
  deadline: "2026-12-01",
  ownerUserId: PUBLISHER,
} as unknown as Opportunity;

function session(userId: string, role: AuthSession["role"]): AuthSession {
  return { userId, email: "x@example.com", fullName: "X", role };
}

let calls: string[];
let rows: Map<string, OpportunityApplication>;

beforeEach(() => {
  state.tracker = true;
  calls = [];
  rows = new Map([[APP_ID, { ...application }]]);
  state.content = { findOpportunity: async () => opportunity, listOpportunities: async () => [opportunity] } as never;
  state.applications = {
    list: async () => [],
    // RLS: the user's client sees only the applicant's (and the publisher's) rows.
    find: async () => {
      calls.push("find");
      return undefined;
    },
    upsert: async (item: OpportunityApplication) => {
      calls.push("upsert");
      return item;
    },
    delete: async () => {
      calls.push("delete");
      return true;
    },
    findAsAdmin: async (id: string) => {
      calls.push("findAsAdmin");
      return rows.get(id);
    },
    reviewAsAdmin: async (item: OpportunityApplication) => {
      calls.push("reviewAsAdmin");
      rows.set(item.id, item);
      return item;
    },
  } as ApplicationRepository;
});

describe("Tracker mode: admin review of applications", () => {
  it("lets an admin review any application through the admin store methods", async () => {
    const result = await reviewApplication(session(ADMIN, "admin"), APP_ID, { status: "accepted", reviewNote: "Welcome" });
    expect(result).toMatchObject({ ok: true, status: 200, body: { item: { id: APP_ID, status: "accepted" } } });
    expect(calls).toEqual(["findAsAdmin", "reviewAsAdmin"]);
    expect(rows.get(APP_ID)).toMatchObject({ status: "accepted", reviewNote: "Welcome" });
  });

  it("keeps the user's client for everyone else", async () => {
    expect(await reviewApplication(session(PUBLISHER, "leader"), APP_ID, { status: "accepted" })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(calls).toEqual(["find"]);
  });

  it("lets a store refusal reach the response with its status", async () => {
    state.applications.findAsAdmin = async () => {
      throw Object.assign(new Error("Only admins can see this."), { status: 403 });
    };
    expect(await reviewApplication(session(ADMIN, "admin"), APP_ID, { status: "accepted" })).toEqual({
      ok: false,
      status: 403,
      error: "Only admins can see this.",
    });
  });

  it("keeps withdrawing for the applicant only, even for an admin", async () => {
    state.applications.find = async () => ({ ...application });
    expect(await withdrawApplication(session(ADMIN, "admin"), APP_ID)).toMatchObject({ ok: false, status: 403 });
    expect(await withdrawApplication(session(APPLICANT, "citizen"), APP_ID)).toMatchObject({ ok: true });
    expect(calls).toEqual(["delete"]);
  });
});
