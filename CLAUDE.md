# Onyx LMS — working notes for Claude

React / Node / TypeScript / Supabase port of the Laravel LMS "EZiL Certify".
Read [`README.md`](README.md) first for what exists; this file is the stuff that
is expensive to rediscover.

**This is its own repository.** The Laravel app lives in a SEPARATE checkout,
by default the sibling directory `../TT002-LEO-LMS` (override with
`LARAVEL_ROOT`). It is the **source of truth and is read-only** — never write to
it. Only the parity generators and `tools/db/laravel-source.mjs` reference it.

## The one rule that outranks the others

**Exact schema parity.** The user's standing constraint is "no changes in schema
/ it should be same". `supabase/migrations/0001_schema.sql` and `0002_indexes.sql`
are **generated** from the Laravel SQLite database by `tools/gen_schema.py` — a
hand edit is a bug, and CI fails on it.

Five tables have been added beyond the 61, each because a Laravel model and
controller write to a table **no migration ever creates** (so the feature throws
in the original). Every one was an explicit decision, documented in the README:

| Table | Migration |
| --- | --- |
| `quiz_submissions` | `0004` |
| `blog_comments`, `blog_likes` | `0005` |
| `user_reviews` | `0006` |
| `bootcamp_resources` | `0008` |

**Adding a sixth needs the user's agreement first.** Say what is broken in the
original, then ask.

## Non-obvious invariants

- **Auth is a custom JWT, not Supabase Auth** (ADR-001). Signed with
  `SUPABASE_JWT_SECRET`. `role` must stay `'authenticated'` so PostgREST does the
  right `SET ROLE`; the application role lives in `app_role`. **`auth.uid()` must
  never appear in a policy** — it casts `sub` to uuid and our ids are bigint. Use
  `onyx.current_user_id()`.
- **A token with a `scope` claim is refused by `requireAuth()`** (ADR-004). Only
  the realtime token has one, because it has to live in browser JS.
- **PHP-compatible JSON** (ADR-002). 20 columns hold JSON as text. Plain
  `JSON.stringify` corrupts them — it does not escape solidus or non-ASCII. Use
  `phpJsonEncode` / `phpJsonDecode` from `packages/core/src/json/php-json.ts`.
- **Type mapping**: `tinyint(1)` → `smallint` (NOT boolean — 0/1 semantics),
  `double(10,2)` → `numeric(10,2)`, `datetime` → `timestamptz`.
- **RLS is deny-all by default and FORCEd.** All writes go through the API on the
  service-role key. `settings` is deliberately not anon-readable (it holds
  `smtp_pass` and gateway keys); a curated subset is exposed via `/api/settings`.
- Three schema inconsistencies are preserved on purpose: `sections.sort` is
  varchar, `instructor_reviews.rating` is varchar, and **`forums.likes` is a JSON
  array of user ids, not a counter** — that is what makes a like one-per-person.

## The Laravel source is not trustworthy as a spec

Read it, but verify against the actual schema before porting. Recurring patterns:

- Controllers writing to tables that do not exist (the five added tables above).
- **Several generations of the same feature coexisting** with different column
  names — messaging had three, only one of which can execute (ADR-004).
- Helpers reading tables the deployment never created — `get_frontend_settings()`
  reads `frontend_settings`, which is absent, so it returns `false` and silently
  disabled the blog module and the page builder.
- Missing authorization checks. Port the feature, not the hole; document the
  divergence in the README and cover it with a test.
- **The same column meaning different things for different entities.**
  `discounted_price` is the final price on a course and the amount taken off on
  a bootcamp. Check per entity; do not generalise from one call site.

When behaviour and the source disagree, prefer what the schema supports, and
write down the decision.

## Verification is the definition of done

```bash
npm run verify:all      # parity → unit → typecheck → audit → e2e, in that order
```

Never claim a sprint is done without a green `verify:all` **and**
`python tools/grading-differential.py`. Two things that have hidden failures
before, both now fixed — do not reintroduce them:

- `db:audit` called `process.exit()` while a socket was closing, aborting after
  printing `AUDIT CLEAN`. The non-zero exit broke the `&&` chain, so the e2e
  stage never ran. Use `process.exitCode`.
- `npm run e2e` served a **stale `.next`** — new pages 404'd and the suite blamed
  the frontend. The runner builds first now (`E2E_SKIP_BUILD=1` to skip).

The e2e suite talks to the real database on purpose: the in-memory fake enforces
no column widths, constraints or RLS. That is how a `session_id varchar(255)`
overflow was caught, and it is why RLS assertions belong there.

## Testing notes

- `node --test` runs **one process per file**, so the e2e harness caches tokens
  in a file. That cache is expiry-aware — it was not, and a stale cookie looked
  like a broken role guard.
- Pages with `revalidate` are ISR-cached, and `apiSafe` caches per fetch URL.
  Asserting that freshly created content appears on a fixed URL tests Next's
  cache, not our rendering. Use a **run-unique query string**.
- The fake DB in `packages/core/test/fake-db.ts` models projections and nested
  `and(...)` / `or(...)` groups. When it cannot express something, **fix the fake**
  — a fake that silently matches everything makes tests worse than none.
- A test that opens a Supabase Realtime socket must `client.realtime.disconnect()`,
  or `node --test` never exits.

## Environment

- Windows. **PowerShell is the primary shell**; a Bash tool exists too.
- Node 24 with native TypeScript stripping. `tsc` checks and emits `.d.ts` only.
- npm workspaces (pnpm is not available here).
- Bash heredocs **collapse `\\` to `\`** and fail above roughly 140 lines
  ("unexpected EOF"). Prefer the Write/Edit tools. For byte-exact backslashes,
  go through Python with `chr(92)`.
- `.env` holds real Supabase credentials and is gitignored. Keep it that way.
- Supabase CLI is logged in. After DDL over the direct connection, PostgREST
  needs `npm run db:reload-cache` or it serves a stale schema.

## Working style the user has asked for

- Implement **sprint by sprint** from `MIGRATION_SPRINT_PLAN.csv` in the Laravel
  checkout (`$LARAVEL_ROOT`); finish a
  sprint completely, verify it, then move on.
- Report honestly: say what was skipped and why. Deferred so far — Paytm (no
  working Laravel reference), ffmpeg watermark burn-in (needs a system binary),
  message reactions (no column, no table, no method — nothing to port).
