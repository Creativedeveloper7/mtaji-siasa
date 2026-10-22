# Siasa → Tracker content mapping

Field-level mapping from Siasa's domain model (`src/types`, `src/server/domain.ts`)
to the live Tracker `public` schema (project `jdddchjbglilkfrlenci`). Read with
[tracker-backend.md](./tracker-backend.md). Schema facts were read from the live
catalog on 2026-10-22. Tracker code references are paths in the M-taji-Tracker repo.

Conventions used below:

- `uid(leader)` means `political_figures.user_id` of the leader's row. Every owned
  Tracker row (initiative, opportunity, blog, poll, product, wallet, ad campaign)
  hangs off an **auth user**, not off `political_figures.id`.
- `Leader.id` / `AuthSession.leaderId` = `political_figures.id`.
- All Siasa ids become Tracker uuids. Siasa's `prj-001` style ids exist only in the
  memory adapter.
- "anon" / "user" / "service" = `anonClient()` / `userClient()` / `serviceClient()`.
- **NEW** marks a column or object that does not exist yet. Its SQL is in §17.

---

## 1. Live row counts (2026-10-22)

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| political_figures | 8 | | wallets | 12 |
| changemakers | 9 | | wallet_transactions | 28 |
| initiatives | 9 | | withdrawals | 1 |
| milestones | 2 | | payments | 16 |
| opportunities | 3 | | adly_campaigns | 49 |
| opportunity_applications | 0 | | ad_campaign_messages | 189 |
| blogs | 2 | | ad_recommendations | 211 |
| blog_posts | 0 | | ad_channel_stats | 25 |
| microblog_posts | 0 | | ad_publish_audit | 81 |
| polls / poll_options / poll_votes | 1 / 4 / 1 | | user_profiles / profiles | 21 / 21 |
| products | 1 | | social_accounts | 3 |
| contact_submissions | 0 | | fundraising_campaigns | 2 |

Storage buckets: `initiative-images` (public), `adly-creative-media` (private,
folder = `auth.uid()`), `verification-documents` (private). No `media` bucket.

---

## 2. Slugs

Only `blog_posts.slug` exists (unique partial index; 0 rows). Every other Siasa slug
is derived. The Tracker already derives two slugs in code, and Siasa must produce
the same strings so shared links work in both apps:

| Entity | Tracker formula | Fallback when empty |
|---|---|---|
| Leader | `slugifyProfileName(name, id)` (`src/lib/publicProfileUrl.ts`) | `id.slice(0, 8)` |
| Project | `slugify(title, id)` (`src/services/domain/initiativesRepository.ts`) | full `id` |

Both are `lower → replace(/[^a-z0-9]+/g, "-") → trim leading/trailing "-"`, with
**no length cap**. Siasa's `slugify()` in `src/lib/store.ts` adds `.slice(0, 80)`;
the tracker adapter must not use it for derived slugs, or long titles stop matching.

Recommendation:

1. **One slug function** in the tracker adapter, identical to the Tracker's. Use it
   for leaders, projects, opportunities, media, polls, products (fallback
   `id.slice(0, 8)` for all except projects, which use the full id like the Tracker).
2. **Collisions** (two rows, same base slug): the route slug becomes
   `${base}-${id.slice(0, 8)}`. Lookup tries exact slug first, then, if the input
   ends in `-[0-9a-f]{8}`, the base slug filtered by `id::text like '<8hex>%'`.
   Today all live leader names and initiative titles slug uniquely.
3. **Also accept a raw uuid** on every `[slug]` route. Tracker share links use
   `/p/{uuid}` (legacy) and `/projects/{uuid}`.
4. **Efficient lookup**: add a stored generated `slug` column plus btree index on
   `political_figures`, `initiatives`, `opportunities`, `blogs`, `polls`,
   `products` (§17 M1). The expression mirrors the JS formula, so it never drifts
   from what either app renders. Until M1 ships, the adapter may select the
   public rows and match in memory (all tables are < 50 rows), which is exactly
   what the Tracker does today.
5. Slugs change when a title changes (same as the Tracker). Siasa's stored,
   hand-picked slugs (e.g. `thika-local-supplier`) are not preserved; they are
   sample data only.

Caveat: for non-ASCII letters, JS `toLowerCase` and Postgres `lower()` can differ
(é is then stripped either way, so results match for Latin text).

---

## 3. Leader → `political_figures`

**Ownership:** `political_figures.user_id` (nullable, unique). 3 of 8 live rows have
no user (seeded profiles), so profile fields must live on `political_figures`, not
on `profiles` (no `profiles` row exists without a user).

**Link arrays**, all derived, never stored:

| Siasa | Derivation |
|---|---|
| `projectIds` | `initiatives` where `changemaker_id = (select id from changemakers where user_id = uid)` **∪** `political_figures.commissioned_projects` (Tracker `listForAccount` does the same union). Public readers only see published/active/completed. |
| `opportunityIds` | `opportunities.author_id = uid` |
| `mediaIds` | `blogs.author_id = uid` (status published for public) |
| `pollIds` | `polls.owner_id = uid` |
| `productIds` | `products.author_id = uid` |

Leaders with `user_id is null` own nothing except `commissioned_projects`.

| Siasa field | Tracker column | Transform |
|---|---|---|
| id | `id` | uuid |
| slug | derived / `slug` (M1) | §2 |
| name | `name` (NOT NULL) | as is |
| honorific | **NEW** `honorific text` | e.g. `Hon.`, `H.E.` |
| position (free text) | **NEW** `office_title text`; read fallback `manifesto->>'office_label'`, then `formatPosition(position)` | Tracker signup writes `manifesto.office_label`, but `buildManifestoPayload` drops that key on the next manifesto save, so it cannot be the store. |
| (enum, required) | `position` NOT NULL, check `president, deputy_president, governor, deputy_governor, senator, mp, woman_representative, mca` | Derived from `office_title` on write, see table below |
| type | `status` | write: `aspirant` → `'aspirant'`; `elected` → keep the current value if it is `active` or `seeking_reelection`, else `'active'`. read: `'aspirant'` → `aspirant`; `active`, `seeking_reelection`, `inactive` → `elected`; `former` → hide from public lists |
| county / constituency / ward | `county` / `constituency` / `ward` | as is (null for empty) |
| photo | **NEW** `profile_image_url text` | The Tracker mapper already reads `figure.profile_image_url` (`politicianMapper.ts`), which is the same meaning. Upload to `initiative-images` under `<uid>/…`. |
| coverImage | **NEW** `cover_image_url text` | |
| shortBio | **NEW** `short_bio text` | |
| bio | **NEW** `bio text` | `profiles.bio` exists but needs a user row; on read fall back to `profiles.bio` when the figure has a user |
| achievements[] | **NEW** `achievements text[] not null default '{}'` | |
| social | **NEW** `social_links jsonb not null default '{}'` with keys `x, instagram, facebook, tiktok, whatsapp, website` | Same key set as `profiles.social_links` (unused, all `{}`). `social_accounts` only allows facebook/instagram/x/youtube/tiktok and is per user, so it is not used. |
| vision.statement | `manifesto->>'hero_title'` | The Tracker shows `hero_title` as the manifesto page title. Write it through. |
| vision.manifesto[] | `manifesto->>'text'` | write: `join("\n\n")`; read: split on blank lines and drop empty items |
| vision.priorities[], proposedProjects[], expectedImpact[] | **NEW** `vision jsonb` = `{priorities, proposedProjects, expectedImpact}` | Not in `manifesto`: Tracker manifesto saves rebuild the object from known keys and would drop them. |
| (Tracker-only) | `term_start`, `term_end` NOT NULL, `term_years` | on create: today and today + 5y, `term_years = 5` (same as Tracker `signupService`). Never touched on update. |
| (Tracker-only) | `manifesto` keys `party, focus_areas, targets, uploaded_at, summary, main_themes` | Read-modify-write: when Siasa updates `hero_title` / `text`, keep every other key. Insert default `{text:'', focus_areas:[], targets:[], uploaded_at:now}`. |

`office_title` → `position` (first match wins, case-insensitive, on the free text):

| Pattern | position |
|---|---|
| `deputy president` | deputy_president |
| `president` | president |
| `deputy governor` | deputy_governor |
| `governor` | governor |
| `senator` | senator |
| `wom(a\|e)n rep` | woman_representative |
| `\bmca\b\|county assembly\|ward rep` | mca |
| `\bmp\b\|member of parliament\|national assembly` | mp |
| no match | keep the existing value on update; on create reject with "Name the office, e.g. MCA, MP, Governor" |

M2 alternatively widens the check with `'other'` so no free text is rejected. That
changes a constraint the Tracker owns, so it is listed as optional.

**Clients**

| Operation | Client | Why |
|---|---|---|
| Public list / by slug | anon | Policy `status = 'active'` only. **RLS gap:** `aspirant` and `seeking_reelection` rows are invisible to anon. M3 adds a read policy. |
| Own profile edit | user | `Users can manage their own political figure profile` (ALL, `auth.uid() = user_id`) |
| Admin create a leader without an account; admin edit someone else's row | service | No RLS rule lets an admin write another user's row. Today the `Allow creating political figures (testing)` policy lets **anyone** insert (with check `true`); Siasa must not depend on it, and M9 drops it. |
| Signed-in leader creating their own row | user | Insert with `user_id = auth.uid()` passes the owner policy once the testing policy is gone. |

---

## 4. Project → `initiatives` (+ `changemakers`)

**Ownership:** `initiatives.changemaker_id → changemakers.id`, where
`changemakers.user_id` = owner. Before the first insert, ensure a changemakers row
exists (`select id … where user_id = uid`, else insert `{user_id, name}`; this is
the Tracker's `ensureChangemaker`). `changemakers.email` is unique, so leave it null.

**Link arrays:**

| Siasa | Derivation |
|---|---|
| `leaderIds` | `[owner figure]` = `political_figures where user_id = changemakers.user_id` **∪** figures `where commissioned_projects @> array[initiative.id]`. Can be **empty**: 4 of 9 live initiatives belong to non-politician changemakers. Siasa list and detail pages must accept `leaderIds: []`, and `saveProject`'s "needs at least one leader" check applies only to Siasa writes. |
| `milestoneIds` | `milestones where initiative_id` order by `target_date` |
| `opportunityIds` | `opportunities where initiative_id` (published, or own) |
| `mediaIds` | `blogs where initiative_id` (published, or own) |

Co-leaders: adding leader B to A's project means appending to B's
`commissioned_projects`. B's row is writable only by B, so admin co-linking needs
the service client. A leader can link only themself.

| Siasa field | Tracker column | Transform |
|---|---|---|
| id | `id` | uuid |
| slug | derived / `slug` (M1) | §2, fallback full id |
| name | `title` | |
| description | `description` NOT NULL; `short_description` | write `short_description = description.slice(0, 240)` (Tracker create does this) |
| category | derived from `category` | see the category table below |
| subcategory | `category` (one of the 58 check values) | Siasa UI: replace the free-text input with a select of Tracker `PROJECT_CATEGORIES` labels (`src/lib/projectCategories.ts`). Store the `value`, show the `label`. For importing free text, map keywords (road→roads, water/borehole→water, health→health, market→trade, youth→youth, school→education, bridge→bridges, housing→housing), else `infrastructure` or `other` by the Siasa category. |
| location (text) | `location.specific_area` | read: `[specific_area unless it is numeric or "lat, lng"-like, constituency, county + " County"]` joined with ", " |
| county | `location.county` | |
| (unused today) | `location.constituency`, `location.ward` | write when known |
| status | `status` | see the status table below |
| progress | **NEW** `progress_percent smallint` (0–100) | read fallback: `round(100 × completed / total milestones)`, else 0. Tracker `completion_percentage` is **funding** (`raised / target`) and must not be shown as build progress. |
| image | `reference_images[0]` | write: put `image` first and keep the other Tracker photos (max 5, `MAX_PROJECT_IMAGES`) |
| startDate | **NEW** `start_date date` | read fallback `created_at::date` |
| expectedCompletion | `expected_completion date` | |
| geo.center | `location.coordinates {lat, lng}` | **Required by the Tracker.** Reject `KENYA_MAP_CENTER (-0.0236, 37.9062)` and `NAIROBI_CBD (-1.286389, 36.817223)` like `hasUsableProjectPin`. |
| geo.boundary | `location.geofence [{lat, lng}]` | write: Polygon `coordinates[0]` is `[lng, lat]` → `{lat, lng}`, drop the closing duplicate, need ≥ 3 points. read: reverse, and close the ring. |
| requiresOpportunities | derived | `exists(opportunities where initiative_id = id and listing_status = 'published')`. Do not store it in `opportunity_preferences`, which holds a different meaning (`acceptProposals`/`acceptAmbassadors`/`acceptContentCreators`). |
| (Tracker-only) | `target_amount` NOT NULL default 0, `raised_amount`, `payment_details`, `satellite_snapshots`, `project_duration` | never written by Siasa. `raised_amount` is set by a trigger. |

ProjectCategory ↔ `initiatives.category`:

| Siasa | Tracker values |
|---|---|
| `infrastructure` | `infrastructure, roads, bridges, transport, energy, electricity, broadband, water, sanitation, waste_management, irrigation, housing, urban_planning, health` |
| `non-infrastructure` | every other value |

On write, `category` is implied by the chosen subcategory. If a client sends only
`category`, default to `infrastructure` or `other`.

ProjectStatus ↔ `initiatives.status` (check: `draft, published, active, completed, stalled`):

| Siasa → Tracker (write) | Tracker → Siasa (read) |
|---|---|
| planned → `published` | draft → not listed publicly (owner sees it as `planned`) |
| in-progress → `active` | published → `in-progress` when any milestone is `in_progress`/`completed` or `start_date ≤ today`, else `planned`. The Tracker creates every live project as `published` (8 of 9 rows). |
| completed → `completed` | active → `in-progress` |
| on-hold → `stalled` | completed → `completed` |
| | stalled → `on-hold` |

**RLS gap:** public read allows only `published, active, completed`, so an
on-hold (stalled) project disappears from public pages. M4 adds `stalled` to a new
public read policy.

**Clients:** public list and by-slug use anon. Owner create, update, and delete use
user (policies check `changemakers.user_id = auth.uid()`). Admin edits of others'
initiatives use service.

---

## 5. ProjectMilestone → `milestones`

**Ownership:** through the initiative (policy `Users can manage milestones for their initiatives`).

| Siasa | Tracker | Transform |
|---|---|---|
| id | `id` | |
| projectId | `initiative_id` | |
| number | derived | 1-based index ordered by `target_date, created_at` |
| date | `target_date` NOT NULL | |
| title | `title` | |
| description | `description` | null for empty |
| status | `status` | see the table below |
| image | **NEW** `image_url text` | |

MilestoneStatus ↔ `milestones.status` (check: `pending, in_progress, completed, delayed, cancelled`):

| Write | Read |
|---|---|
| completed → `completed` and set `completed_at = now()` (clear it otherwise, like Tracker `updateMilestone`) | completed → completed |
| current → `in_progress` | in_progress, delayed → current |
| upcoming → `pending` | pending → upcoming |
| | cancelled → leave out of the timeline (still counted for nothing) |

**Clients:** anon read works only while the parent is published, active, or completed;
owner writes use user.

---

## 6. Opportunity → `opportunities`

**Ownership:** `author_id = uid`. `leaderId` is derived:
`political_figures.id where user_id = author_id` (undefined for org or citizen
authors, and for the 1 live row with a null author). `projectId` ↔ `initiative_id`.

| Siasa | Tracker | Transform |
|---|---|---|
| id | `id` | |
| slug | derived / `slug` (M1) | |
| title | `title` | |
| category | `kind` + `category` | see the table below |
| organization | `organization` | |
| location | `location text` | |
| county | **NEW** `county text` | read fallback: linked `initiatives.location.county`, else the last comma part of `location` without " County" |
| deadline | `deadline date` | nullable in the Tracker. Show "Rolling" when null. |
| eligibility | `eligibility` | |
| description | `description` | |
| image | **NEW** `image_url text` | read fallback: the linked initiative's `reference_images[0]` |
| projectId | `initiative_id` | |
| status | `listing_status` (`published`/`closed`) + `deadline` | read: `closed` or deadline < today → `closed`; deadline ≤ today + 7d → `closing-soon`; else `open`. write: `closed` → `closed`, otherwise `published`. |
| openingDate | `created_at::date` | derived; no column |
| benefits[] | **NEW** `benefits text[]` | Tracker `amount` (free text, e.g. a stipend) is shown as the first benefit on read when `benefits` is empty |
| requirements[] | **NEW** `requirements text[]` | |
| applicationSteps[] | `how_to_apply text` | write: `join("\n")`; read: split lines and strip leading `1.`/`-` |
| applicationUrl | `apply_url` | must be http(s) (Tracker `isHttpUrl`) |
| relatedMediaIds | derived | `blogs` with the same `initiative_id` |
| (Tracker-only) | `slots`, `amount` | keep on update |

OpportunityCategory ↔ `kind` / `category` (`category` is free text; Tracker lists
`GRANT_CATEGORIES` and `CALL_CATEGORIES` in `src/lib/opportunityModel.ts` and shows
custom values as they are):

| Siasa write | kind | category | Tracker read → Siasa |
|---|---|---|---|
| funding | `grant` | keep the existing grant category, else null | any `grant` → funding |
| jobs | `call` | `Job` | Job, Internship → jobs |
| tenders | `call` | `Tender` | Tender → tenders |
| training | `call` | `Training` | Training, Fellowship → training |
| youth | `call` | `Youth` | Youth, Project ambassadorship, Content creation, Volunteering → youth |
| business | `call` | `Business` | Business → business |
| other | `call` | null | Public participation, null, anything else → other |

**RLS:** anon reads only `listing_status = 'published'` (and the author reads own).
Closed listings vanish from public pages, which matches Tracker behaviour; no change
is proposed. Writes use user (`author_id = auth.uid()`).

---

## 7. OpportunityApplication → `opportunity_applications`

| Siasa | Tracker | Transform |
|---|---|---|
| id | `id` | |
| opportunityId | `opportunity_id` | |
| applicantId | `applicant_id` | always `auth.uid()` |
| fullName / email / phone | `full_name` / `email` / `phone` | |
| message | `message` | |
| county | **NEW** `county text` | |
| attachmentUrl | **NEW** `attachment_url text` | |
| status | `status` | see the table below |
| reviewNote | **NEW** `review_note text` | |
| createdAt | `created_at` | |
| updatedAt | **NEW** `updated_at timestamptz` | read fallback `created_at` |
| ApplicationView.opportunity | join `opportunities(id, title, kind, category, deadline, initiative_id, author_id)` | slug and leaderId derived as in §6 |

ApplicationStatus ↔ `status` (check: `pending, reviewed, accepted, rejected`):

| Write | Read |
|---|---|
| submitted → `pending` | pending → submitted |
| reviewing → `reviewed` | reviewed → reviewing |
| shortlisted → `shortlisted` (M6 widens the check; Tracker `applicationStatusLabel` then shows "Pending", which is harmless). Without M6: store `reviewed` and keep the shortlist only in `review_note`. | shortlisted → shortlisted |
| accepted / rejected → same | same |

**RLS gaps:**

- No DELETE policy, so "withdraw my application" fails. M6 adds applicant delete while `status = 'pending'`.
- The insert check verifies only that the opportunity is published. `applicant_id` can be spoofed and anon can insert. M6 adds `applicant_id is null or applicant_id = auth.uid()`. Siasa uses user regardless.
- Duplicate applications are not prevented. M6 adds a unique partial index on `(opportunity_id, applicant_id)`.
- "You cannot apply to your own listing" stays in Siasa code.

**Clients:** apply, own list, and withdraw use user. Owner list and review use user
(the policies join `opportunities.author_id`). The admin list of all applications
uses service (no admin read policy).

---

## 8. MediaItem → `blogs` (not `blog_posts`)

Use **`blogs`**: it is what the Tracker writes (`pages/dashboard/BlogManagement.tsx`)
and shows (`/blog/:id`, `pages/Blog.tsx`, `LiveBlogTab`, `InitiativeDetail`). It has
`initiative_id` and `category`, and holds both live rows. `blog_posts` (slug, tags)
is read only by legacy profile code and has 0 rows.

**Ownership:** `author_id = uid`. `leaderId` is derived as in §6.

| Siasa | Tracker | Transform |
|---|---|---|
| id | `id` | |
| slug | derived / `slug` (M1) | |
| title | `title` | |
| category | `category` (free text, default `Impact Stories`) | see the table below |
| type | derived | `video_url` set → video; `content` non-empty → article; else image |
| image | `image_url` | |
| gallery[] | **NEW** `gallery text[]` | |
| date | `published_at` (fallback `created_at`) | |
| excerpt | `excerpt` NOT NULL | `''` when missing |
| body | `content` NOT NULL | `''` when missing; trigger `update_read_time` fills `read_time` |
| videoUrl | **NEW** `video_url text` | |
| projectId | `initiative_id`, plus `initiative_name` = initiative title | the Tracker denormalises the name; keep it in sync |
| updatedAt | `updated_at` (trigger) | |
| author | `author_name` NOT NULL | the leader's `name` |
| relatedOpportunityIds / relatedMediaIds | derived | same `initiative_id` |
| (Siasa publish) | `status = 'published'`, `published_at = now()` on first publish | Siasa has no drafts |

MediaCategory ↔ `blogs.category`:

| Write | Read |
|---|---|
| news → `News` | News, Government, Transparency → news |
| project-updates → `Project Updates` | Project Updates → project-updates |
| leader-updates → `Leader Updates` | Leader Updates → leader-updates |
| videos → `Videos` | Videos → videos (or any row with `video_url`) |
| stories → `Impact Stories` | Impact Stories, Community → stories; anything else → news |

**Clients:** anon reads `status = 'published'`; owner writes use user (several
overlapping owner policies, all `author_id = auth.uid()`).

---

## 9. Poll → `polls` + `poll_options` + `poll_votes`

**Ownership:** `polls.owner_id = uid`. `leaderId` is derived as in §6.

| Siasa | Tracker | Transform |
|---|---|---|
| id | `polls.id` | |
| slug | derived / `slug` (M1) | from `title` |
| question | `title` | `description` stays null unless Siasa adds one |
| options[].id / label | `poll_options.id` / `label`, ordered by `sort_order` | write `sort_order` = index |
| options[].votes | `count(poll_votes) group by option_id` | **RLS gap:** only the voter and the owner can read votes, so public tallies are impossible. M7 adds RPC `poll_results(p_poll_id)` (security definer). |
| participationCount | sum of option votes | same RPC |
| closingDate | `ends_at timestamptz` | the live row has null; show "Open" |
| (status) | `status` (`draft, open, closed`) | write `open` on create. read: `closed`, or `ends_at < now()` → closed (nothing closes polls automatically). |
| (eligibility) | `eligibility` default `authenticated` | voting requires sign-in: `poll_votes` insert needs `voter_user_id = auth.uid()`, and the unique index is `(poll_id, voter_user_id)`. |

**RLS gaps:**

- anon reads only `status = 'open'` polls and options, so closed polls and their results vanish. M7 also exposes `closed`.
- The `poll_votes` insert does not check that the poll is open, that `ends_at` has not passed, or that `option_id` belongs to `poll_id`. M7 adds RPC `cast_poll_vote`.

**Clients:** public reads use anon (plus the RPC). Votes go through user via the RPC.
Owner create, edit, and delete use user (`polls_owner_all`, `poll_options_owner_write`).

---

## 10. Product → `products`

**Ownership:** `author_id = uid`. `leaderId` is derived. `settle_payment_to_wallets`
credits shop revenue to `products.author_id`, so this must be the leader's user.

| Siasa | Tracker | Transform |
|---|---|---|
| id | `id` | |
| slug | derived / `slug` (M1) | from `name` |
| name | `name` | |
| price | `price numeric` | |
| currency | none | constant `KES` (orders and payments are KES). Drop the field from writes. |
| image | `images[0]` **and** `image_url` | Tracker `MerchPage` reads `images`; older code reads `image_url`. Write both. |
| description | `description` | |
| stock | `stock_quantity` | |
| (visibility) | `is_active` (RLS and MerchPage), `status` | write `is_active = true`, `status = 'active'`. The 1 live row has `is_active = false` with `status = 'active'`; trust `is_active`. |

**Clients:** anon reads `is_active = true`; owner writes use user.

---

## 11. WalletRecord → `wallets` / `wallet_transactions` / `withdrawals` / `payments`

**Ownership:** `wallets.user_id = uid` (unique). Read-only to users (no
update/insert policy on transactions), so Siasa **never writes wallet tables**.

| Siasa | Tracker | Notes |
|---|---|---|
| leaderId | `wallets.user_id` via the figure | |
| sources.* (spendable buckets) | none | The Tracker has one `balance` plus **lifetime** credit counters. Show: Available = `balance − sum(pending withdrawals)`. Breakdown: crowdfunding ← `lifetime_crowdfunding`, merchandise ← `lifetime_shop`, transfers (top-ups) ← `lifetime_ads`, donations ← 0. Donations credit `crowdfunding`, so merge that card into crowdfunding. Per-source withdrawal order (`WITHDRAW_ORDER`) is dropped. |
| lastTopUpAt / lastWithdrawalAt | `max(created_at)` of credit `topup` transactions / of `withdrawals` | derived |
| movements[] | `wallet_transactions` ∪ `withdrawals`, sorted by `created_at` desc | see the table below |
| DEFAULT_WALLET_SOURCES | **drop** | Fake balances (KES 303,400). Show 0 when no wallet row exists. |

| Tracker row | WalletMovement |
|---|---|
| tx credit, source `topup`, ref `payment` | kind `top-up`; source from `payments.metadata.method` (mpesa/card/bank), else undefined |
| tx credit, source `crowdfunding` | kind `top-up`, source `crowdfunding` |
| tx credit, source `shop` | kind `top-up`, source `merchandise` |
| tx debit, source `ads`, ref `adly_campaign` | kind `ad-spend`; `reference = reference_id` (campaign); note = campaign name |
| withdrawals row | kind `withdrawal`; status = `withdrawals.status` (widen Siasa's `status: "recorded"` to the Tracker values `pending`/…) |
| (ad-refund) | none: no refund path exists in the Tracker. Drop it (see §12). |

Actions:

| Siasa action | Tracker path | Client |
|---|---|---|
| Top up (mpesa/card/bank) | edge function `initialize-paystack-payment` `{amount ≥ 100, payment_type: 'ads_topup', method, comment}`, then redirect to Paystack. The balance changes only after `paystack-webhook` / `verify-paystack-payment` → `settle_payment_to_wallets`. | user JWT |
| Top up with source crowdfunding/merchandise | **drop**: those are earned credits, not top-ups | |
| Withdraw | RPC `request_withdrawal(p_wallet_id, p_amount, p_method, p_destination)`. It inserts a `pending` row only; the balance is **not** reduced, and pending amounts are not subtracted (repeated requests can exceed the balance; Siasa should pre-check `balance − pending`). | user |
| Admin view of any wallet | `wallets`/`wallet_transactions` select | service (owner-only RLS) |

**Security findings (must fix in the Tracker; SQL in M9):**

- `credit_wallet_from_payment(p_user_id, p_amount, …)` is `SECURITY DEFINER`, has
  **no caller check**, and is executable by `anon` and `authenticated`. Anyone can
  credit any wallet.
- `settle_payment_to_wallets(p_payment_id)` is executable by `anon` and does not
  check `payments.status = 'complete'`. A user can open a top-up (9 payments are
  `pending` now), skip paying, and settle it.
- Siasa must not call either function. Both should be callable by `service_role` only.

---

## 12. AdCampaign (paid ads) → `adly_campaigns` + `ad_channel_stats` + edge functions

Siasa's `src/server/ads/{google,x}.ts` call the networks directly with Siasa's own
credentials and charge or refund the fake wallet. Replace them with the Tracker
pipeline so both apps share one campaign, one wallet, and one set of network credentials:

1. Insert `adly_campaigns` (user).
2. Copy the project image into `adly-creative-media/<uid>/<campaignId>/<uuid>.jpg` (user, folder policy).
3. For each channel, call `publish-x-ads` / `create-google-ads-campaign-rest` with the user JWT. They verify `campaign.user_id = caller`, write `ad_publish_audit`, set `status = 'live'`, and store network ids in `metadata`.
4. After success, call RPC `debit_wallet_for_ad_spend(campaign, provider, kes, '<id>:<provider>')`. For a budget increase, use `debit_wallet_for_ad_spend_update`.
5. Stats come from `sync-ad-insights` → `ad_channel_stats`.

Pre-check `wallets.balance` like Tracker `assertWalletCanFundBudget`.

| Siasa | Tracker | Transform |
|---|---|---|
| id | `id` | |
| createdBy | `user_id` | |
| leaderId | derived from `user_id` | |
| projectId | `metadata.project_id` + `metadata.campaign_type = 'project'` + `metadata.project_title` | Tracker `adlyCampaignScope.ts` reads exactly these |
| name | `name` | |
| headline / body | `creative.headline` / `creative.body` | also `creative.platforms.{x.post, google.headlines[], meta.headline}` when publishing (`adlyPublishPayload.ts`) |
| imageUrl | `creative.media[] {id, kind:'image', path, bytes, filename, contentType}` | storage path, not a URL; signed URL to display |
| landingUrl | `creative.landing_page_url` | must be public https |
| keywords[] | `targeting.interests[]` | Google publish sends them as `audience_interests` → keywords |
| platforms[] (`x`, `google`) | `channels text[]` | |
| platforms[].budgetKes | sum of `wallet_transactions` debit `ads` where `reference_id = id` and `metadata.provider = p` | |
| platforms[].status | `ad_channel_stats.approval_status` + `ad_publish_audit` last status | `active`/`enabled` → live; `paused` → paused; audit `failed` → failed; nothing yet → pending |
| platforms[].externalIds | `metadata.x_campaign_id, x_line_item_id, x_tweet_id, google_campaign_id, google_ad_group_id, google_ad_id, google_budget_id` | |
| platforms[].error | latest `ad_publish_audit.error` for the provider | |
| impressions / clicks / spentKes / syncedAt | `ad_channel_stats.impressions / clicks / spend_kes / synced_at` | |
| budgetKes | `budget` | `budget_daily = budget / durationDays` |
| durationDays | `targeting.duration_days` | |
| estimatedReach, kesPerUsd, statusNote | `metadata.siasa = {estimated_reach, kes_per_usd, status_note}` | namespaced, Siasa-only keys, which the Tracker spreads through untouched |
| startDate / endDate | `metadata.last_publish_at` (first publish) / + duration | |
| refundedKes | **drop** | no refund RPC; the Tracker debits on publish and never refunds |
| status | `status` | see the table below |
| (Tracker) | `objective` (free text, default `awareness`), `targeting.age_group`, `targeting.locations[]`, `metadata.location_selections[]` | Siasa writes `awareness`, and locations from the project county or constituency (`"County > Constituency > Ward"`) |

AdCampaignStatus ↔ `adly_campaigns.status` (check: `draft, live, submitted, paused, completed, archived, failed`):

| Siasa write | Tracker | Tracker read → Siasa |
|---|---|---|
| pending_approval | `submitted` + `metadata.siasa.approval = 'pending'` | draft → add `draft` to the Siasa type (29 live rows are Tracker drafts) |
| launching | `submitted` | submitted → `pending_approval` if `metadata.siasa.approval = 'pending'`, else `launching` |
| active | `live` | live → active |
| paused | `paused` | paused → paused |
| completed / stopped | `completed` (+ `metadata.siasa.stopped = true`) | completed → completed (stopped when flagged) |
| rejected | `archived` + `metadata.siasa.approval = 'rejected'` | archived → rejected if flagged, else completed |
| failed | `failed` | failed → failed |

Approval queue: the edge functions only publish for the campaign owner, and
`adly_campaigns` RLS is owner-only. Two options:

- Drop `requireApproval`. Recommended: the Tracker has none.
- Keep it: the admin approves by writing `metadata.siasa.approval` with **service**, then the **owner** publishes.

Pause and resume: no Tracker edge function pauses Google; the X function updates
only. Hide pause/resume until a function exists, or mark it out of scope.

**Clients:** owner list and create use user. Admin "all campaigns" uses service
(owner-only RLS). Never call the networks from Next.

---

## 13. Siasa Adly workspace (`src/types/adly.ts`) vs Tracker Adly

The Tracker Adly is one campaign row plus an AI chat agent (`adly-agent` →
`ad_campaign_messages`, `ad_recommendations`), publishing edge functions, and
insight sync. Siasa's workspace is a set of mock collections.

| Siasa | Recommendation |
|---|---|
| Campaign | **Merge with AdCampaign** into `adly_campaigns` (one model). objective → `objective`. status draft/in-review/active/paused/completed → `draft/submitted/live/paused/completed`. platformIds: facebook/instagram/whatsapp/meta → `meta`; google, x, tiktok as they are. targeting `{county, constituency, ward}` → `targeting.locations` + `metadata.location_selections`; `radiusKm`/`center` are dropped (no network target uses them). budget → `budget`. performance ← `ad_channel_stats` (spend, impressions, clicks; reach/engagement/conversions are not tracked, so omit or read from `raw`). |
| AdCreative | `adly_campaigns.creative` (one per campaign) plus per-channel `ad_recommendations` (headline, body, channel). Drop the standalone creative library. |
| PolicyReview | **Drop.** Mock checklist with no Tracker counterpart; not a real compliance check. |
| AdlyInsight | **Drop the static insights.** Use `ad_recommendations` (pending/applied) and the agent chat. |
| Poster | **Keep client-only.** Render and export in the browser, no persistence. Add a table later only if saved posters become a requirement. |
| Timelapse | **Derive, don't store:** `initiatives.satellite_snapshots[] {date, imageUrl, bounds, captured_at, cloudCoverage, ai_analysis.status}` + `reference_images` + milestones. Aspect, captions, and branding are UI state. |
| Simulation | **Demo-only.** Generated by `mockCreativeGenerationService`. Keep under `MTAJI_STORE=memory`; in tracker mode store nothing. ProposedProject `simulationImage` URLs go in `political_figures.vision` (M5). |
| AdlyWorkspaceStats | derived from `adly_campaigns` + `ad_channel_stats` |
| AdlyInterestLead | `contact_submissions` (insert open to anyone): `name`, `email`, `subject = 'Adly interest: <role> · <organization>'`, `message = phone + interests`. The admin list needs service (no select policy). |

---

## 14. Other Siasa stores

| Siasa | Tracker | Notes |
|---|---|---|
| Saved opportunities (`EngagementRepository.get/setSavedOpportunityIds`) | **NEW** table `saved_opportunities(user_id, opportunity_id)` (M8) | no existing table; `followers` is for users |
| Users (`UserRepository`) | auth + `user_profiles` + `profiles` | see tracker-backend.md. Admin listing and deletion use service. |
| Uploads (`src/server/storage`, bucket `media`, created on first upload) | use existing **`initiative-images`** (public) with path `<auth.uid()>/<yyyy-mm>/<rand>.<ext>`, via user | Siasa must not create buckets. |
| `src/data/*` sample content | **memory adapter only** | never seed the live project with it |

Storage RLS note: the `initiative-images` DELETE policy allows any authenticated
user to delete **any** object in the bucket (there is no folder check). M9 tightens it.

---

## 15. Data-compatibility risks in the live rows

Shapes were sampled with personal data removed.

| Table | Observed | Risk / handling |
|---|---|---|
| initiatives.location | keys `county, coordinates{lat,lng}, constituency, specific_area`. No row has `ward` or `geofence`. One row has `county: ""` and `constituency: ""`. One row has only `{county, coordinates}`, with coordinates equal to `NAIROBI_CBD`. `specific_area` holds junk like `"601"` or `"-1.313, 36.789"`. | Treat `""` as missing. A placeholder pin means no `geo.center`, so the map must handle a missing center. Filter numeric or coordinate-like `specific_area` from the display string. |
| initiatives.satellite_snapshots | array of `{date, bounds{east,west,north,south}, imageUrl, captured_at, cloudCoverage, ai_analysis{status…}}`, 0–7 items | usable for timelapse |
| initiatives.category | `infrastructure, water, agriculture, economic` | maps cleanly |
| initiatives owners | 5 of 9 owned by political-figure users, 4 by other changemakers. `commissioned_projects` is empty on every figure. | `leaderIds` may be empty |
| political_figures.manifesto | keys `text, targets[], focus_areas[], uploaded_at`, plus on newer rows `party, office_label, hero_title`. Two rows share identical long text. | read-modify-write only; never replace the object |
| political_figures | 3 rows have `user_id null`. All are `status = 'active'`. Positions: governor, mp, senator. `total_investment = 0`. | Leaders without accounts own nothing and need service for admin edits |
| milestones | 2 rows, both `pending`, no description | |
| opportunities | 1 grant with null author, null category, null deadline, `amount = "Stipend"`. 2 calls (`Public participation`, `Content creation`) with `slots` and `location` but no `county`. | `leaderId` is undefined for the grant; derive county (§6) |
| blogs | 2 published, categories `Community` and `Impact Stories`, both linked to initiatives, `read_time` like `"3 min read"` | → stories |
| polls | 1 open, `ends_at` null, eligibility `authenticated` | null closing date |
| products | 1 row, `is_active = false` with `status = 'active'`, `images = []` | hidden publicly; image fallback needed |
| adly_campaigns | 29 `draft`, 20 `live`. `objective` is free text (some junk values). `targeting` keys `age_group, interests, locations, duration_days`. `creative` keys `headline, body, cta, hook, tone, pillars, platforms{x,meta,google…}, media[], thumbnail_asset_id, landing_page_url`. `metadata` keys `wizard, chat_docs, brief_source, campaign_type, project_id, project_title, location_selections, suggested_*, last_publish_at, last_insights_*, insights_pace_*, x_*, google_*`. | Siasa must preserve unknown `creative`/`metadata` keys (spread, then set). `ad_recommendations.channel` also includes `youtube`, which `ad_channel_stats` does not allow. |
| wallets & payments | 28 transactions (21 `ads` debits with `metadata {provider, ref}`, 5 `topup` credits, 2 `crowdfunding` credits). 16 Paystack payments, 9 of them `pending`. 1 pending M-Pesa withdrawal. | see the §11 security findings |
| user_profiles | 21 rows, all `verification_status = 'pending'` | the "verified profiles are public" policy exposes nothing, so Siasa must not read other users' `user_profiles` with anon |

---

## 16. Client matrix (summary)

| Operation | Client |
|---|---|
| Public reads: leaders (active), projects, milestones, opportunities, blogs, open polls (+ `poll_results`), products | anon |
| Own content CRUD: initiative, milestone, opportunity, blog, poll, product, own `political_figures` row, own application, votes, ad campaigns, uploads, top-up, withdrawal | user |
| Admin: create or edit a leader without or for another account, admin approval flags on ad campaigns, admin lists (all applications, all campaigns, all wallets, contact submissions, user directory), co-linking leaders to projects (`commissioned_projects`) | service. No RLS rule grants admin access, and admin is `app_metadata.role`, which RLS does not check. Each call site checks `session.role === 'admin'` first. |
| Never from Siasa | `credit_wallet_from_payment`, `settle_payment_to_wallets`, direct writes to `wallets`, `wallet_transactions`, `withdrawals`, `payments`, `ad_channel_stats` |

---

## 17. Migrations (Tracker repo, `supabase/migrations/`, for review)

Written as files in the Tracker repo (branch `claude/busy-mendel-1fyt4a`), **not yet
applied**. All are additive: nullable columns or `NOT NULL` with a constant default,
new policies, new functions, one new table. The only constraint changes widen a
check (M2, M6) or add a check on a new column. The SQL lives in the files; each
header says what Siasa needs it for and why the Tracker app is unaffected.

| # | File | What it does |
|---|---|---|
| M1 | `20261022140000_siasa_slugs.sql` | `public.slugify_text(text)` (IMMUTABLE) + stored generated `slug` column and btree index on `political_figures`, `initiatives`, `opportunities`, `blogs`, `polls`, `products` |
| M3 + M5 (vision) | `20261022150000_siasa_leader_profile.sql` | leader profile columns, `vision jsonb`, public read of `aspirant` / `seeking_reelection` |
| M2 (optional) | `20261022160000_siasa_leader_position_other.sql` | widens `political_figures_position_check` with `'other'`; can be skipped independently |
| M4 | `20261022170000_siasa_project_progress.sql` | `initiatives.start_date`, `progress_percent` (0–100), `milestones.image_url`, public read of `stalled` initiatives and their milestones |
| M5b | `20261022180000_siasa_opportunity_and_blog_fields.sql` | `opportunities.county, image_url, benefits, requirements`; `blogs.gallery, video_url` |
| M6 | `20261022190000_siasa_opportunity_applications.sql` | application columns, `'shortlisted'`, `updated_at` trigger, withdraw-own policy, anti-spoof insert check, one application per user per listing |
| M7 | `20261022200000_siasa_polls.sql` | public read of `closed` polls/options, RPCs `poll_results(uuid)` and `cast_poll_vote(uuid, uuid)` |
| M8 | `20261022210000_siasa_saved_opportunities.sql` | `saved_opportunities` table, owner-only RLS |
| M9 | handled separately (security), not in these files | |

Deviations from the original proposals:

- **M1**: `slugify_text` trims `'^-+|-+$'` (the proposal had `'^-|-$'`; same result
  after the first replace collapses runs, but now literally the JS regex). It has
  `SET search_path = ''` and an explicit `GRANT EXECUTE` to anon, authenticated and
  service_role, because generated columns evaluate it as the inserting role. Before
  writing, the expression was run as a plain `SELECT` on the live project: it matched
  `baseSlug` for 24/24 live rows across the six tables and for 13 Unicode/edge-case
  strings (é, ß, İ, Kelvin sign, ligatures, CJK, emoji, empty). No live base slug
  collides within a table. Changing the function body later does **not** recompute
  stored slugs.
- **M3 / M5**: the `vision` column moved into the leader-profile file (same table).
  Added `CHECK (jsonb_typeof(...) = 'object')` on the new `social_links` and `vision`
  columns.
- **M2**: its own file so the reviewer can skip it. In the Tracker, a row with
  `'other'` shows as "Other" (`formatPosition`) and uses the default badge branches;
  `PoliticalPosition` in its TypeScript does not list it (type gap only).
- **M4**: the progress check is a named constraint (`initiatives_progress_percent_check`).
- **M6**: trigger named `update_opportunity_applications_updated_at` (Tracker
  naming). `GRANT DELETE … TO authenticated` restated. The Tracker apply form sends
  `applicant_id = user?.id || null`, so the anti-spoof check never rejects it; a
  signed-in user applying twice now gets a duplicate-key error there.
- **M7**: `poll_results` also requires `poll_votes.poll_id` to match and orders by
  `sort_order`. `cast_poll_vote` raises stable messages Siasa can map:
  `not_authenticated` (28000), `poll_not_open` (P0001), `invalid_option` (P0001),
  `already_voted` (23505). Both functions revoke from `PUBLIC, anon, authenticated`
  first (this project's default privileges grant EXECUTE to anon and authenticated
  explicitly, so revoking from PUBLIC alone is not enough), then grant
  `poll_results` to anon + authenticated and `cast_poll_vote` to authenticated only.
  The existing `poll_votes_insert_auth` policy is left as is (the Tracker still
  inserts votes directly); tightening it is a separate change.
- **M8**: added an index on `opportunity_id`; table privileges narrowed to
  `SELECT, INSERT, DELETE` for authenticated and none for anon.

M9 (security fixes found during mapping) is handled in separate Tracker migrations,
not in the files above. The original proposal, kept for reference:

```sql
-- M9  security fixes found during mapping (independent of Siasa; ship first)
revoke execute on function public.credit_wallet_from_payment(uuid, numeric, text, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.settle_payment_to_wallets(uuid) from public, anon, authenticated;
grant execute on function public.credit_wallet_from_payment(uuid, numeric, text, uuid, text, uuid) to service_role;
grant execute on function public.settle_payment_to_wallets(uuid) to service_role;
-- Also: in settle_payment_to_wallets, return early unless v_payment.status = 'complete'.
-- Confirm first that paystack-webhook / verify-paystack-payment use the service role.
drop policy if exists "Allow creating political figures (testing)" on public.political_figures;
drop policy if exists "Users can insert profile (any)" on public.user_profiles;  -- handle_new_user is security definer
drop policy if exists "Users can delete their own initiative images" on storage.objects;
create policy "Users can delete their own initiative images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'initiative-images' and (storage.foldername(name))[1] = auth.uid()::text);
-- The Tracker uploads to <changemakerId>/…, not <uid>/…. Align the Tracker upload path before this one.
```

M9 needs Tracker-side checks before shipping (grep for every `rpc(` caller and
every `user_profiles` insert in the Tracker). Siasa must not depend on any policy
that M9 drops.

### Fields dropped or derived (no migration)

`Leader.*Ids`, `Project.leaderIds/milestoneIds/opportunityIds/mediaIds/requiresOpportunities`,
`ProjectMilestone.number`, `Opportunity.status/openingDate/relatedMediaIds/leaderId`,
`MediaItem.type/leaderId/relatedOpportunityIds/relatedMediaIds`,
`Poll.options[].votes/participationCount/leaderId`, `Product.currency/leaderId`,
`WalletRecord.sources` (shown from lifetime counters), `DEFAULT_WALLET_SOURCES`,
`WalletMovement` kind `ad-refund`, `AdCampaign.refundedKes`,
`AdCampaign.platforms[]` (from stats, audit, and transactions), `GeoTargeting.radiusKm/center`,
`PolicyReview`, `AdlyInsight`, stored `AdCreative` library, `Poster` and `Timelapse`
persistence, `Simulation` (demo only).
