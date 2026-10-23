# M-Taji Siasa on the M-Taji Tracker backend

Siasa is the new UI for M-Taji Tracker. It does not own a database. It reads and
writes the Tracker's live Supabase project, so Tracker accounts, campaigns,
wallets and payments are the same records in both apps.

- Supabase project: `jdddchjbglilkfrlenci` ("M-taji tracker")
- Schema source of truth: `supabase/migrations/` in the M-taji-Tracker repo
- Edge functions (Paystack, Adly agent, ad publishing, insight sync) live there too

Siasa never creates tables of its own. A field the Tracker schema cannot hold is
added by a migration in the Tracker repo, reviewed like any other Tracker change.

## Layers

```
UI (client components)  ->  /api/* route handlers  ->  src/server/*/service.ts
                                                     ->  getRepositories()
                                                          |- tracker adapter (Supabase)
                                                          '- memory adapter (local demo)
```

The UI only talks to `/api/*`. Route handlers keep their request and response
shapes, so pages do not change when the store does.

Repositories are async. Every method returns a Promise.

`getRepositories()` picks the store:

- Tracker adapter when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, unless `MTAJI_STORE=memory`.
- Memory adapter otherwise. It holds the sample data in `src/data` and is lost
  on restart. It is for local demos only: read-only sample data with no
  sign-in (see Memory mode under Auth).

## Supabase clients (server only)

`src/server/tracker/clients.ts`

| Client | Key | Used for |
|---|---|---|
| `userClient()` | anon key + the signed-in user's session cookies (`@supabase/ssr`) | everything a user does. Row-level security decides what they can read and write. |
| `anonClient()` | anon key, no session | public reads (published projects, open polls, active leaders) |
| `serviceClient()` | `SUPABASE_SERVICE_ROLE_KEY` | only where RLS has no rule for a legitimate action: the admin user directory, admin role changes. Each use is commented with why. |

The service role key is read only on the server and never sent to the browser.
Nothing named `NEXT_PUBLIC_*` holds a secret.

## Auth

Supabase Auth replaces Siasa's own password table and HMAC cookie.

- Sign-up calls `auth.signUp` with `user_metadata`:
  `{ full_name, phone, user_type }`. The Tracker triggers
  `handle_new_user` and `sync_profile_from_auth` then create the
  `user_profiles` and `profiles` rows.
- Sign-in calls `auth.signInWithPassword`. Sessions live in the
  `@supabase/ssr` HttpOnly cookies.
- When email confirmation is on, sign-up returns no session. The API answers
  `{ ok: true, needsConfirmation: true }` and `/auth/callback` exchanges the
  emailed code for a session. GoTrue confirms the email before the code
  exchange, so a failed exchange (typically the link opened in another browser,
  without the PKCE verifier cookie) goes to `/signin?confirmed=maybe`: "If you
  just confirmed your email, sign in to continue." A `token_hash` link is
  checked with `verifyOtp` and works on any device.
- `next` redirect parameters (callback, sign-in, sign-up) go through
  `safeNext()` in `src/lib/safe-next.ts`: resolved against the site origin,
  kept only when same-origin, reduced to path + query + hash, else `/`.
- A session is always checked with `auth.getUser()`, never trusted from the
  cookie alone. If the account rows cannot be read, the error is logged, a
  session read returns no session and sign-in answers 503 JSON.
- Sign-out uses `signOut({ scope: "local" })`: it ends this browser's session
  only, not the person's Tracker app or other devices.

### Roles

| Siasa role | Tracker |
|---|---|
| `citizen` | `user_profiles.user_type = 'individual'` |
| `leader` | `user_type = 'political_figure'`, political_figures.status not `'aspirant'` |
| `aspirant` | `user_type = 'political_figure'`, political_figures.status = `'aspirant'` |
| `organization` | `user_type = 'organization'` or `'government'` |
| `admin` | `auth.users.app_metadata.role = 'admin'` |

Admin comes from `app_metadata` because only the service role can write it.
`profiles.role` is not used for permissions: RLS lets every user update their
own `profiles` row, so any user could set it.

`AuthSession.leaderId` is the user's `political_figures.id`, when they have one.

#### Ownership rule

In Tracker mode authorization is by auth user id: a row's owner / author /
`user_id` compared with `session.userId`, or admin. Never by `leaderId`.
`leaderId` is for display and linking only. `political_figures.id` is
client-settable, so a user can create a figure row whose id is any value,
including another user's auth uid (all uids are public via `profiles`).
Therefore:

- an auth user id is never used as a leader id (the Phase 1 memory leader is
  `user-<uid>`, which is not a uuid and cannot collide with a figure id);
- only `political_figures` rows with `user_id` = the caller count as theirs,
  and when there are several the oldest (`created_at`, then `id`) wins, so a
  row added later cannot take over an account's `leaderId`.

The mapping lives in `src/server/tracker/roles.ts` (`siasaRoleFor`,
`signUpMetadata`), with tests beside it.

#### Leaders and aspirants without a `political_figures` row

The Tracker's own sign-up inserts a `political_figures` row for a politician,
but that row needs `position`, `term_start` and `term_end`, which Siasa's
sign-up form does not ask for. Siasa does not make those up. So:

- Sign-up creates no `political_figures` row. It stores the person's choice in
  `user_metadata.siasa_role` (`citizen`, `leader`, `aspirant` or
  `organization`) next to `full_name`, `phone` and `user_type`.
- When a row exists, its `status` decides: `'aspirant'` is an aspirant,
  anything else is a leader. The oldest row wins if there are several
  (`created_at`, then `id`; see Ownership rule).
- With no row, a `political_figure` is an aspirant when `siasa_role` is
  `'aspirant'`, otherwise a leader. `siasa_role` is user-editable, so it only
  ever chooses between those two and never grants admin.
- When the `user_profiles` row is missing, `user_metadata.user_type` stands in,
  normalised the way the `handle_new_user` trigger does.

Until the person has a `political_figures` row, their session's `leaderId` is
the Phase 1 id `user-<Supabase user id>` (never the bare uid). The content
adapters show records owned by such an account under the same id
(`leaderIdForOwner`, and `Project.leaderIds` / `Opportunity.leaderId` for an
owner without a figure), so the politician workspace lists their records.
`POST /api/auth/profile` only switches a citizen or organization to
`user_type = 'political_figure'` (their own `user_profiles` row and
`user_metadata`); it creates nothing. The person creates their figure row
from the profile page (`PUT /api/content/leaders`): the store sets `user_id`
to the caller, refuses a second row (409), and needs an office it can map to
a Tracker `position` (400 otherwise). The next session read picks up the new
`political_figures.id`.

#### Admin user directory

`/api/auth/users` lists, creates, edits and deletes Supabase Auth users with
`serviceClient().auth.admin.*` and the `profiles` / `user_profiles` rows.
Granting admin sets `app_metadata.role = 'admin'`; any other role clears it
and sets `user_type` (and `siasa_role`). `leaderId` is not editable there: it is
the `political_figures.id`. When a `political_figures` row's status decides
leader vs aspirant, asking for the other one saves the rest and answers 409
with that explanation. The directory reads profile rows per page of
`listUsers` (`.in()` on the page's ids), and email lookup is an exact
case-insensitive match (LIKE wildcards escaped). Without `SUPABASE_SERVICE_ROLE_KEY` these endpoints
answer 503. A duplicate email (GoTrue `email_exists`, Postgres 23505) answers
409; any other Auth or database failure is logged and answered with a
generic 502 (`TrackerUserError` through `failureFromError`), never its text.
Sign-up passes through only weak password (400), invalid email (400) and
rate limit (429); anything else gets a generic message.

#### Memory mode

Accounts exist only in Supabase Auth. In memory mode the public pages work on
sample data, but sign-in and sign-up answer 503 and there is no session
(`currentSession()` returns null). Memory mode is therefore read-only sample
data: every route that needs a signed-in role (content and Adly writes,
`/api/uploads`, `/api/content/reset`, the dashboards, admin and the Adly
studio) answers 401. There is no demo sign-in.

## Content

`createTrackerContentRepository()` in `src/server/tracker/database.ts` composes
the content slices (field mapping: `docs/content-mapping.md`):

| Siasa | Tracker | Slice |
|---|---|---|
| leaders | `political_figures` | `src/server/tracker/content/leaders` |
| projects, milestones | `initiatives` (+ `changemakers`), `milestones` | `.../content/projects` |
| opportunities | `opportunities` | `.../content/opportunities` |
| applications | `opportunity_applications` | `.../opportunities/applications.ts` |
| saved opportunities | `saved_opportunities` (M8) | `.../opportunities/engagement.ts` |
| Adly interest leads | `contact_submissions` | `.../opportunities/engagement.ts` |
| media | `blogs` | `.../content/media` |
| polls | `polls`, `poll_options`, `poll_votes` | `.../content/polls` |
| products | `products` | `.../content/products` |
| photos | Storage bucket `initiative-images` | `src/server/tracker/storage` |

- Link arrays (`Leader.projectIds`, `Project.opportunityIds`,
  `Project.milestoneIds`, ...) and slugs are derived on read. The leaders
  slice gets them from a links provider built on `projectIdsForFigures`,
  `opportunityIdsByAuthor`, `mediaIdsByAuthor`, `pollIdsByOwner` and
  `productIdsByAuthor`. The content service therefore skips its memory-mode
  relinking and slug numbering in Tracker mode.
- Every record a content repository returns carries `ownerUserId` (row owner
  auth user id); `ownerUserIdOf()` reads it. `src/server/content/service.ts`
  applies the Ownership rule with it, with `projectOwnerUserId()` for projects
  and milestones, and with the figure's `user_id` for leaders. Row-level
  security checks the same thing again on every write.
- `content.reset()` and `resetAll()` answer 403: Tracker data is never reset
  from Siasa. `POST /api/content/reset` is refused in Tracker mode; it needs
  an admin session, so with no sign-in in memory mode it is not reachable
  there either (restart the server to get fresh sample data).
- Deleting a project: an `initiatives` delete cascades to its `donations`,
  milestones, volunteer and job applications, `initiative_*` rows and
  `job_opportunities`. The content service refuses (409 "This project has
  donations; it can't be deleted") when any `donations` row exists for the
  initiative (`projectDonationCount()`; `donations` is publicly readable).
  Milestones are left to the cascade.
- Writes that had to leave out data (a Tracker migration not applied yet)
  return `warnings: string[]` next to `item`; the forms show them.
- Repository errors carry an HTTP `status` (`LeaderStoreError`,
  `ProjectAccessError` 403 / `ProjectInputError` 400 / `ProjectConflictError`
  409, `TrackerWriteError`, `ContentWriteError`, `ImageUploadError`).
  `failureFromError()` in `src/server/http-errors.ts` turns them into the API
  answer. Database text never reaches the browser: 5xx and errors without a
  status become a generic message (logged on the server), and a 4xx whose
  message quotes Postgres is replaced by a generic one for that status.
- Polls: `POST /api/content/polls/vote` `{ pollId, optionId }` votes through
  the `cast_poll_vote` RPC (one vote per account; 503 until migration M7);
  `GET /api/content/polls/vote?pollId=` answers `{ optionId, results }` (the
  caller's vote and the `poll_results` tallies).
- Uploads: `POST /api/uploads` checks `Content-Length` (5 MB plus multipart
  framing) before reading the body, then `storeTrackerImage()` validates the
  bytes and stores them under `<auth uid>/<yyyy-mm>/` with the user's session.
- Applications: "mine" is `listForApplicant(userId)`, "received" is
  `listForAuthor(userId)` (any account that published a listing), and admins
  get `listAll()` (service role, admin re-checked in the store). Withdrawing
  answers 501 until M6 adds the applicant DELETE policy. Saved opportunities
  answer 503 until M8 creates `saved_opportunities`.

## Adly and ads

Adly campaigns and dashboard paid ads are both `adly_campaigns` rows
(`src/server/tracker/adly`). Routes:

| Route | Does |
|---|---|
| `GET /api/ads/campaigns?scope=mine\|all` | The caller's ads (or all, admin) with the pricing quote and wallet balance |
| `POST /api/ads/campaigns` | Create an ad from the dashboard composer |
| `POST /api/ads/campaigns/[id]` | `{ action: approve \| reject \| publish \| pause \| resume \| stop \| sync, note? }` |
| `POST /api/ads/publish/[id]` | Owner publishes (or republishes) through the Tracker publish edge functions; `{ channel? }` |
| `GET /api/adly/workspace` | Adly workspace: campaigns from the Tracker, studio content from memory |
| `PUT\|DELETE /api/adly/plans` | Save a campaign plan; delete a draft or archive a published campaign |
| `GET\|POST /api/adly/agent/[id]` | Adly agent chat, recommendations and channel results |
| `POST /api/adly/sync/[id]` | Pull live impressions, clicks and spend (`sync-ad-insights`) |

- Siasa-only fields live under `adly_campaigns.metadata.siasa`, which the
  Tracker ignores: `leader_id`, `objective`, `start_date`, `end_date`,
  `image_url`, `estimated_reach`, `source` (`ads` / `adly`), `review` (the
  admin approval gate), `policy_review`, `publishing` (one publish at a time)
  and `unpaid` (networks that accepted the ad but whose wallet debit failed;
  returned as `warnings` by the publish routes and shown on the campaign).
- Network credentials (`GADS_*`, `X_*`, `META_*`, `TIKTOK_*`,
  `OPENAI_API_KEY`) are Supabase function secrets in the Tracker project
  only. Siasa holds none.
- Ads are approved automatically and publish (charging the wallet) as soon
  as they are created. `ADS_REQUIRE_APPROVAL=true` makes an admin approve each
  ad first; the owner then publishes it. `ADS_DRY_RUN=true` asks the edge functions for a dry run:
  an audit row only, nothing is created on a network or charged.
- The Adly studio's posters, simulations and creatives still use the memory
  adapter. In Tracker mode a studio item tied to a project (timelapses,
  simulations, and the project on a poster or campaign) follows the Ownership
  rule: the project's owner user id (`projectOwnerUserId()`) or admin.
  `Project.leaderIds` / `Leader.projectIds` are not used, because they include
  `political_figures.commissioned_projects`, which a leader can write on their
  own row.
- Memory mode keeps a simulated paid-ads flow (`src/server/ads/service.ts`)
  that never contacts a network.

## Wallet

The wallet routes run on the Tracker wallet (`src/server/tracker/wallet`):

| Route | Does |
|---|---|
| `GET /api/wallet/payments` | Balance, movements and unfinished top-ups of the signed-in user |
| `POST /api/wallet/payments/top-up` | `{ amount, method? }`: starts a Paystack top-up, answers `{ checkoutUrl, reference }` |
| `POST /api/wallet/payments/verify` | `{ reference }`: confirms a top-up when the user returns from Paystack |
| `POST /api/wallet/payments/withdraw` | `{ amount, method, destination }`: `request_withdrawal` RPC |

The legacy `/api/wallet`, `/api/wallet/top-up` and `/api/wallet/withdraw`
answer 410 in Tracker mode, and the Tracker repositories have no wallet or
ad-campaign store (they throw), so nothing can fall back to a memory wallet.

## Money

The Tracker's wallet is real money. Siasa never writes wallet balances itself.

- Top-ups go through the `initialize-paystack-payment` edge function. The
  balance changes only when the Paystack webhook settles the payment.
- Withdrawals call the `request_withdrawal` RPC.
- Ad spend calls `debit_wallet_for_ad_spend` / `debit_wallet_for_ad_spend_update`.

## Local development

```
NEXT_PUBLIC_SUPABASE_URL=https://jdddchjbglilkfrlenci.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # publishable key
SUPABASE_SERVICE_ROLE_KEY=...            # server only; admin pages need it
```

Leave them unset, or set `MTAJI_STORE=memory`, to browse read-only sample
data. Memory mode has no sign-in (sign-in and sign-up answer 503), so the
dashboards, admin pages, Adly studio and every write or upload route answer
401 there; restart the server to get fresh sample data. To try signed-in
flows, point the variables at a Supabase project. The other settings (ads,
site URL) are listed in the README.
