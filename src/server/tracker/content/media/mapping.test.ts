import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/types";
import {
  blogNewColumnsEmpty,
  blogWrite,
  mapBlogRow,
  mediaCategoryFromTracker,
  mediaCategoryToTracker,
  mediaTypeOf,
  publishedAtFor,
  type BlogRow,
} from "./mapping";
import {
  eatDate,
  eatTimestamp,
  groupIdsByOwner,
  indexFiguresByUser,
  isMissingColumnError,
  isMissingFunctionError,
  leaderIdForOwner,
  ownerUserIdOf,
  withOwner,
  nullIfEmpty,
  pickByIds,
} from "./shared";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const FIGURE = "22222222-2222-4222-8222-222222222222";
const INITIATIVE = "33333333-3333-4333-8333-333333333333";

/** Shaped like the 2 live rows: published, linked to an initiative, no gallery/video columns. */
function liveRow(overrides: Partial<BlogRow> = {}): BlogRow {
  return {
    id: "e8535d76-61c8-4158-a120-bb2f2045c402",
    title: "Water reaches Kibera",
    excerpt: "A short excerpt",
    content: "Long body text",
    image_url: "https://example.supabase.co/storage/v1/object/public/initiative-images/x.jpg",
    category: "Community",
    status: "published",
    author_id: AUTHOR,
    author_name: "Hon. Jane",
    created_at: "2026-02-04T10:00:00+00:00",
    updated_at: "2026-02-05T10:00:00+00:00",
    published_at: "2026-02-04T12:51:38.606+00:00",
    read_time: "2 min read",
    tags: [],
    initiative_id: INITIATIVE,
    initiative_name: "Kibera water",
    ...overrides,
  };
}

describe("mediaCategoryFromTracker", () => {
  it("maps the live categories", () => {
    expect(mediaCategoryFromTracker("Community")).toBe("stories");
    expect(mediaCategoryFromTracker("Impact Stories")).toBe("stories");
  });
  it("maps every documented category, case-insensitively", () => {
    expect(mediaCategoryFromTracker("News")).toBe("news");
    expect(mediaCategoryFromTracker("government")).toBe("news");
    expect(mediaCategoryFromTracker("Transparency")).toBe("news");
    expect(mediaCategoryFromTracker("Project Updates")).toBe("project-updates");
    expect(mediaCategoryFromTracker("Leader Updates")).toBe("leader-updates");
    expect(mediaCategoryFromTracker(" Videos ")).toBe("videos");
  });
  it("falls back to news, or videos when the row has a video", () => {
    expect(mediaCategoryFromTracker("Sports")).toBe("news");
    expect(mediaCategoryFromTracker(null)).toBe("news");
    expect(mediaCategoryFromTracker("Sports", "https://youtu.be/x")).toBe("videos");
  });
  it("keeps a known category even when there is a video", () => {
    expect(mediaCategoryFromTracker("Project Updates", "https://youtu.be/x")).toBe("project-updates");
  });
});

describe("mediaCategoryToTracker", () => {
  it("writes the Tracker label", () => {
    expect(mediaCategoryToTracker("news")).toBe("News");
    expect(mediaCategoryToTracker("project-updates")).toBe("Project Updates");
    expect(mediaCategoryToTracker("leader-updates")).toBe("Leader Updates");
    expect(mediaCategoryToTracker("videos")).toBe("Videos");
    expect(mediaCategoryToTracker("stories")).toBe("Impact Stories");
  });
  it("keeps the current Tracker label when it means the same thing", () => {
    expect(mediaCategoryToTracker("stories", "Community")).toBe("Community");
    expect(mediaCategoryToTracker("news", "Government")).toBe("Government");
  });
  it("replaces a label that means something else, or an unknown one", () => {
    expect(mediaCategoryToTracker("news", "Community")).toBe("News");
    expect(mediaCategoryToTracker("news", "Sports")).toBe("News");
  });
});

describe("mediaTypeOf", () => {
  it("derives the type", () => {
    expect(mediaTypeOf({ video_url: "https://youtu.be/x", content: "text" })).toBe("video");
    expect(mediaTypeOf({ video_url: null, content: "text" })).toBe("article");
    expect(mediaTypeOf({ video_url: "  ", content: "  " })).toBe("image");
    expect(mediaTypeOf({ content: "" })).toBe("image");
  });
});

describe("mapBlogRow", () => {
  it("maps a live row without the NEW columns", () => {
    const item = mapBlogRow(liveRow(), { slug: "water-reaches-kibera", leaderId: FIGURE, relatedMediaIds: [] });
    expect(item).toMatchObject({
      id: "e8535d76-61c8-4158-a120-bb2f2045c402",
      slug: "water-reaches-kibera",
      title: "Water reaches Kibera",
      category: "stories",
      type: "article",
      date: "2026-02-04",
      excerpt: "A short excerpt",
      body: "Long body text",
      leaderId: FIGURE,
      projectId: INITIATIVE,
      author: "Hon. Jane",
      updatedAt: "2026-02-05T10:00:00+00:00",
    });
    expect(item.gallery).toBeUndefined();
    expect(item.videoUrl).toBeUndefined();
  });
  it("uses the Nairobi date and falls back to created_at", () => {
    expect(mapBlogRow(liveRow({ published_at: "2026-03-01T22:30:00Z" }), { slug: "s" }).date).toBe("2026-03-02");
    expect(mapBlogRow(liveRow({ published_at: null }), { slug: "s" }).date).toBe("2026-02-04");
  });
  it("maps gallery and video and turns missing text into empty strings", () => {
    const item = mapBlogRow(
      liveRow({ gallery: ["a.jpg", "", "b.jpg"], video_url: "https://youtu.be/x", excerpt: null, content: null, image_url: null, initiative_id: null }),
      { slug: "s" }
    );
    expect(item.gallery).toEqual(["a.jpg", "b.jpg"]);
    expect(item.videoUrl).toBe("https://youtu.be/x");
    expect(item.type).toBe("video");
    expect(item.excerpt).toBe("");
    expect(item.body).toBe("");
    expect(item.image).toBe("");
    expect(item.projectId).toBeUndefined();
  });
});

describe("publishedAtFor", () => {
  const now = new Date("2026-10-22T08:00:00Z");
  it("publishes now on first save for today or a missing date", () => {
    expect(publishedAtFor("2026-10-22", null, now)).toBe(now.toISOString());
    expect(publishedAtFor(undefined, null, now)).toBe(now.toISOString());
    expect(publishedAtFor("not a date", null, now)).toBe(now.toISOString());
  });
  it("back-dates to a chosen past day at noon Nairobi", () => {
    expect(publishedAtFor("2026-09-01", null, now)).toBe("2026-09-01T09:00:00.000Z");
  });
  it("keeps the stored timestamp when the day is unchanged", () => {
    const existing = liveRow();
    expect(publishedAtFor("2026-02-04", existing, now)).toBe(existing.published_at);
    expect(publishedAtFor(undefined, existing, now)).toBe(existing.published_at);
  });
  it("moves to a new day when the date changes", () => {
    expect(publishedAtFor("2026-02-10", liveRow(), now)).toBe("2026-02-10T09:00:00.000Z");
  });
  it("publishes a Tracker draft (no published_at) now", () => {
    expect(publishedAtFor("2026-10-22", liveRow({ status: "draft", published_at: null }), now)).toBe(now.toISOString());
  });
});

describe("blogWrite", () => {
  const item: MediaItem = {
    id: "med-1",
    slug: "x",
    title: "  New road opened ",
    category: "project-updates",
    type: "article",
    image: "",
    gallery: [" g1.jpg ", ""],
    date: "2026-10-22",
    excerpt: "Excerpt",
    body: "Body",
    videoUrl: "",
    projectId: INITIATIVE,
  };
  const now = new Date("2026-10-22T08:00:00Z");

  it("builds an insert", () => {
    const write = blogWrite(item, { existing: null, ownerName: "Hon. Jane", initiativeName: "Road", now });
    expect(write).toEqual({
      title: "New road opened",
      excerpt: "Excerpt",
      content: "Body",
      image_url: null,
      category: "Project Updates",
      status: "published",
      published_at: now.toISOString(),
      author_name: "Hon. Jane",
      initiative_id: INITIATIVE,
      initiative_name: "Road",
      gallery: ["g1.jpg"],
      video_url: null,
    });
    expect(write).not.toHaveProperty("author_id");
  });
  it("never writes NOT NULL text as null", () => {
    const write = blogWrite({ ...item, excerpt: undefined as unknown as string, body: undefined }, { existing: null, now });
    expect(write.excerpt).toBe("");
    expect(write.content).toBe("");
    expect(write.author_name).toBe("M-Taji");
  });
  it("keeps the stored author name and category label on update", () => {
    const existing = liveRow();
    const write = blogWrite({ ...item, category: "stories", projectId: undefined }, { existing, now });
    expect(write.author_name).toBe("Hon. Jane");
    expect(write.category).toBe("Community");
    expect(write.initiative_id).toBeNull();
    expect(write.initiative_name).toBeNull();
  });
  it("reports whether the NEW columns carry data", () => {
    expect(blogNewColumnsEmpty(blogWrite({ ...item, gallery: [] }, { existing: null, now }))).toBe(true);
    expect(blogNewColumnsEmpty(blogWrite(item, { existing: null, now }))).toBe(false);
    expect(blogNewColumnsEmpty(blogWrite({ ...item, gallery: [], videoUrl: "v" }, { existing: null, now }))).toBe(false);
  });
});

describe("shared helpers", () => {
  it("picks the OLDEST figure per user (the session's rule) and derives leaderId", () => {
    const figures = indexFiguresByUser([
      { id: "newer", user_id: AUTHOR, name: "Added later", created_at: "2026-01-01" },
      { id: FIGURE, user_id: AUTHOR, name: "First", created_at: "2025-01-01" },
      { id: "seeded", user_id: null, name: "No account" },
    ]);
    expect(figures.get(AUTHOR)?.id).toBe(FIGURE);
    expect(figures.size).toBe(1);
    expect(leaderIdForOwner(AUTHOR, figures)).toBe(FIGURE);
    // No figure: the Phase 1 leader id, never the bare uid.
    expect(leaderIdForOwner("44444444-4444-4444-8444-444444444444", figures)).toBe(
      "user-44444444-4444-4444-8444-444444444444"
    );
    expect(leaderIdForOwner(null, figures)).toBeUndefined();
  });
  it("breaks created_at ties by id, like compareFigures", () => {
    const figures = indexFiguresByUser([
      { id: "b-figure", user_id: AUTHOR, name: "B", created_at: "2025-01-01" },
      { id: "a-figure", user_id: AUTHOR, name: "A", created_at: "2025-01-01" },
    ]);
    expect(figures.get(AUTHOR)?.id).toBe("a-figure");
  });
  it("exposes the owner's auth user id on a record", () => {
    const owned = withOwner({ id: "x" }, AUTHOR);
    expect(ownerUserIdOf(owned)).toBe(AUTHOR);
    expect(ownerUserIdOf(withOwner({ id: "y" }, null))).toBeUndefined();
    expect(ownerUserIdOf({ id: "z" })).toBeUndefined();
  });
  it("converts dates to and from Nairobi time", () => {
    expect(eatDate("2026-10-21T21:30:00Z")).toBe("2026-10-22");
    expect(eatDate(null)).toBe("");
    expect(eatDate("garbage")).toBe("");
    expect(eatTimestamp("2026-11-30")).toBe("2026-11-30T20:59:59.000Z");
    expect(eatTimestamp("2026-11-30T10:00:00Z")).toBe("2026-11-30T10:00:00.000Z");
    expect(eatTimestamp("")).toBeNull();
    expect(eatTimestamp("nope")).toBeNull();
  });
  it("normalises text, picks and groups ids", () => {
    expect(nullIfEmpty("  ")).toBeNull();
    expect(nullIfEmpty(" a ")).toBe("a");
    expect(pickByIds([{ id: "a" }, { id: "b" }, { id: "c" }], ["c", "a"]).map((x) => x.id)).toEqual(["a", "c"]);
    const grouped = groupIdsByOwner(
      [{ id: "1", o: "u1" }, { id: "2", o: null }, { id: "3", o: "u1" }],
      (row) => row.o
    );
    expect(grouped.get("u1")).toEqual(["1", "3"]);
    expect(grouped.size).toBe(1);
  });
  it("recognises missing-migration errors", () => {
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'gallery' column of 'blogs'" }, ["gallery"])).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: 'column "video_url" does not exist' }, ["gallery", "video_url"])).toBe(true);
    expect(isMissingColumnError({ code: "23502", message: "null value in column \"title\"" }, ["gallery"])).toBe(false);
    expect(isMissingColumnError(null, ["gallery"])).toBe(false);
    expect(isMissingFunctionError({ code: "PGRST202", message: "Could not find the function public.poll_results" })).toBe(true);
    expect(isMissingFunctionError({ code: "P0001", message: "poll closed" })).toBe(false);
  });
});
