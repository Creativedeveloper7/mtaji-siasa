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
  on restart. It is for local demos only.

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
  emailed code for a session.
- A session is always checked with `auth.getUser()`, never trusted from the
  cookie alone.

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
  anything else is a leader. The newest row wins if there are several.
- With no row, a `political_figure` is an aspirant when `siasa_role` is
  `'aspirant'`, otherwise a leader. `siasa_role` is user-editable, so it only
  ever chooses between those two and never grants admin.
- When the `user_profiles` row is missing, `user_metadata.user_type` stands in,
  normalised the way the `handle_new_user` trigger does.

Phase 1 only: until leaders move to `political_figures` (Phase 2), the
politician workspace (`POST /api/auth/profile`) creates the leader profile in
the memory content store, with id = the user's `political_figures.id`, or their
Supabase user id when they have none. A session with no `political_figures` row
picks up that profile as its `leaderId`. A citizen or organization who opens
the workspace is switched to `user_type = 'political_figure'` (their own
`user_profiles` row and `user_metadata`), as the old flow did.

#### Admin user directory

`/api/auth/users` lists, creates, edits and deletes Supabase Auth users with
`serviceClient().auth.admin.*` and the `profiles` / `user_profiles` rows.
Granting admin sets `app_metadata.role = 'admin'`; any other role clears it
and sets `user_type` (and `siasa_role`). `leaderId` is not editable there: it is
the `political_figures.id`. Without `SUPABASE_SERVICE_ROLE_KEY` these endpoints
answer 503.

#### Memory mode

Accounts exist only in Supabase Auth. In memory mode the public pages work on
sample data, but sign-in and sign-up answer 503 and there is no session.

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

Leave them unset, or set `MTAJI_STORE=memory`, to run on sample data.
