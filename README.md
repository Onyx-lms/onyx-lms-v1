# Onyx LMS

React / Node / TypeScript / Supabase port of the Laravel LMS (`EZiL Certify`).

Sprint plan: `MIGRATION_SPRINT_PLAN.csv` in the Laravel checkout.

**This is a separate repository.** It is generated from, but does not live
inside, the Laravel app. The parity tools read the Laravel SQLite file, so they
need to know where that checkout is:

```
LARAVEL_ROOT=../TT002-LEO-LMS   # the default: a sibling directory
```

Set `LARAVEL_ROOT` if your layout differs, or pass the path to any generator as
its first argument. Nothing else in the app touches the Laravel code.

## Status

| Sprint | Backend | Frontend | State |
| --- | --- | --- | --- |
| **S00** Foundation | 9/9 | - | **done, live** |
| **S01** Platform | 9/9 | - | **done, live** |
| **S02** Auth and Users | 10/10 | 8/8 | **done, live** |
| **S03** Public Site | 9/9 | 9/9 | **done, live** |
| **S04** Course Builder | 9/9 | 9/9 | **done, live** |
| **S05** Quizzes | 6/6 | - | **done, live** |
| **S06** Enrolment, Cart, Coupons | 7/7 | 7/7 | **done, live** |
| **S07** Payments core | 7/7 | 4/4 | **done, live** |
| **S08** Gateways + offline | 8/9 | 2/2 | **done, live** (PAY-14 Paytm not implemented) |
| **S09** Course Player | 9/10 | 9/9 | **done, live** (PL-07b ffmpeg burn-in skipped) |
| **S10** Certificates, Forum, Reviews | 8/8 | 5/5 | **done, live** |
| **S11** Reviews, Blog, Knowledge Base | 8/8 | 8/8 | **done, live** (R-01/R-02 landed in S10) |
| **S12** Messaging + contact inbox | 6/6 | 5/5 | **done, live** (no reactions -- see ADR-004) |
| **S13** Live Classes (Zoom + Jitsi) | 6/6 | 4/4 | **done** (Jitsi live; Zoom unverified -- no credentials) |
| **S14** Bootcamps / Workshops | 7/7 | 7/7 | **done, live** |
| **S15** Team Training / Classrooms | 5/5 | 5/5 | **done, live** |
| **S16** Tutor Booking | 7/7 | 6/6 | **done, live** |
| **S17** Revenue, Payouts, Dashboards | 5/5 | 3/3 | **done, live** |
| S18+ | settings, code IDE, hardening | | next |

## Three schema inconsistencies preserved

The original schema is inconsistent in ways that matter, and the port keeps the
column types while handling them explicitly:

| Column | Type | Sibling |
| --- | --- | --- |
| `sections.sort` | varchar | `lessons.sort` is integer |
| `forums.likes` / `dislikes` | text holding a **JSON array of user ids** | not a counter |
| `instructor_reviews.rating` | varchar | `reviews.rating` is integer |

The forum one is the important one: storing voter ids is what makes a like
one-per-person. A counter would let a single account click forever.
## Verification

```bash
npm run verify:all      # everything below, in order

npm run verify:parity   # generated SQL vs the Laravel schema
npm test                # 356 unit tests, no database needed
npm run db:audit        # live types, RLS, sequences, seed, storage
npm run e2e             # 127 tests against a running api + web + Supabase
python tools/grading-differential.py        # quiz scoring vs the PHP algorithm
```

**If the database looks unreachable**, it is probably the network, not Supabase.
`db.<ref>.supabase.co` is **IPv6-only** on projects created after early 2024, so
on an IPv4-only network every direct-connection tool fails with `ENOTFOUND`
while the REST API keeps working. `tools/db/connect.mjs` detects that and falls
back to the regional session pooler (`aws-N-<region>.pooler.supabase.com`, IPv4)
automatically, printing which route it took. Set `SUPABASE_POOLER_URL` to skip
the probe, or `SUPABASE_REGION` if the project is not in ap-northeast-1.

The end-to-end suite boots both servers, waits for health, runs, and tears them
down. It talks to the real database on purpose: the in-memory fake used by unit
tests enforces no column widths, constraints or RLS, so anything
schema-sensitive only surfaces here. That is how the `session_id varchar(255)`
overflow in the payment layer was caught.

## The course player

The 5-second ping keeps `watch_durations.watched_counter` as a JSON array of
tick markers, byte-identical to what Laravel writes (ADR-003). Ticks are
de-duplicated, so seeking back and re-watching cannot inflate progress.

Drip gating reproduces `get_locked_lesson_ids()` exactly, including the part
that surprises people: the lesson that unlocks is the one after the **last
entry** in `completed_lesson`, not the furthest lesson reached. Complete lesson
5 then lesson 2, and lesson 3 unlocks -- not lesson 6.

Completion at 100% mints the certificate from inside the player, the same
trigger Laravel used, and is idempotent: finishing repeatedly yields one
certificate.
## Gateways

Nine of the ten Laravel gateways are implemented:

| Gateway | Confirmation | Webhook signature |
| --- | --- | --- |
| Stripe | session lookup | HMAC-SHA256 + timestamp window |
| PayPal | capture on return | (capture is authoritative) |
| Razorpay | order lookup + `order_id\|payment_id` HMAC | HMAC-SHA256 |
| Paystack | transaction verify | HMAC-**SHA512** of the raw body |
| Flutterwave | transaction verify | `verif-hash` compared verbatim |
| SSLCommerz | `val_id` validation call | - |
| Doku | webhook only | digest + canonical-block HMAC |
| Aamarpay | trxcheck lookup | - |
| MaxiCash | echoed reference + status | - |
| **Paytm** | **not implemented** | the Laravel version is entirely commented out, so there is no working reference to port |

**Offline / bank transfer** runs the same fulfilment path as a card payment, so
revenue split, invoicing and enrolment cannot drift between the two routes.
Prices are re-read at acceptance rather than trusted from the snapshot taken
when the student submitted.

Webhook status codes drive the gateway retry loop deliberately:
`400` bad signature (never retry), `500` our fulfilment failed (do retry),
`200` handled or deliberately ignored.

## Screens

```
public      /  /courses  /course/[slug]  /compare  /instructors  /instructors/[id]
            /bootcamps  /bootcamp/[slug]  /team-packages  /team-package/[slug]
            /tutors  /tutors/[id]
            /blogs  /blog/[slug]  /knowledge-base
            /knowledge-base/topics/[id]  /knowledge-base/articles/[id]
            /about-us  /contact-us  /faq  + 4 policy pages
auth        /login  /register  /forgot-password  /reset-password  /verify-email
student     /my-courses  /my-profile  /cart  /wishlist  /purchase-history
            /checkout/success  /invoice/[invoice]  /messages
            /play-course/[slug]  /live-class/[id]
            /my-bootcamps  /my-bootcamps/[slug]  /bootcamp-class/[id]
            /my-team-packages  /my-team-packages/[id]
            /my-bookings  /tuition/[id]  /dashboard
instructor  /instructor/dashboard  /instructor/courses  /instructor/courses/[id]
            /instructor/blogs  /instructor/bootcamps  /instructor/team-packages
            /instructor/tutoring  /instructor/payouts
admin       /admin/dashboard  /admin/users  /admin/courses  /admin/approvals
            /admin/enrollments  /admin/coupons  /admin/blogs
            /admin/knowledge-base  /admin/testimonials  /admin/messages
            /admin/contacts  /admin/live-class-settings  /admin/bootcamps
            /admin/team-packages  /admin/tutoring  /admin/revenue  /admin/payouts
```

84 routes. Everything server-rendered; the catalog and blog pages carry full
metadata, and blog posts resolve `seo_fields` before falling back to the post.
The two message screens opt out of caching entirely -- a conversation must never
be served from a cache shared between users.

## How authentication works in the browser

The API sets its cookie on the API origin, which the browser will not send to
the web origin. So the web app proxies auth through its own route handlers
(`/api/auth/[action]`) and stores the token in a cookie **it** owns, marked
`httpOnly`. Page scripts can never read it.

Client components that need authenticated calls go through
`/api/proxy/[...path]`, which attaches the bearer token server-side. The token
is stripped from every login response body before it reaches the browser.

Role gates live in `requireRole()`: a student hitting `/admin/*` is redirected
to `/denied`, an anonymous visitor to `/login`. The server-side guard is the
real one -- the API re-checks the JWT on every request regardless.
## The quiz grading engine

Q-04 is the highest-risk port in the project: a scoring difference silently
changes student outcomes. It is verified by a **differential test** --
the PHP algorithm is transcribed into `tools/grading-differential.py` and
2,000 generated submissions are scored by both implementations and compared.

```bash
python tools/grading-differential.py 2000
# DIFFERENTIAL PASS: the TypeScript engine scores identically to the PHP algorithm
```

Rules preserved verbatim, including the counter-intuitive ones:

- `retake = 0` allows **one** attempt (Laravel compares `submissions > retake`).
- `pass_mark` is measured in **marks, not correct answers**:
  `correct * (total_mark / question_count) >= pass_mark`.
- `true_false` answers are stored **raw**, not JSON-encoded, unlike every other type.
- An unrecognised question type scores **wrong**, never skipped.

## Five tables added beyond the 61

Each one has a Laravel model and controllers that write to it, but **no Laravel
migration ever creates it** -- so the feature throws "table not found" in the
source application. Each was added by explicit decision. The 61 ported tables
are untouched and still audit at 580/580 columns.

| Table | Migration | Broken in the original |
| --- | --- | --- |
| `quiz_submissions` | `0004` | `student/QuizController.php` inserts on every submit |
| `blog_comments` | `0005` | `student/BlogCommentController.php` |
| `blog_likes` | `0005` | `BlogController.php` like handling |
| `user_reviews` | `0006` | `SettingController::user_review_stor()` (admin testimonials) |
| `bootcamp_resources` | `0008` | `Admin\BootcampResourceController` on every upload |

## Running the whole thing

```bash
npm install
cp .env.example .env          # fill in Supabase keys
npm run db:migrate            # schema + indexes + seed + RLS
npm run db:verify             # live schema vs Laravel, column by column

npm run dev:api               # Fastify on :4000
npm run dev:web               # Next.js on :5173
```

The web app talks to the API through `API_URL` (see `apps/web/.env.local`).
Catalog pages are server-rendered so metadata and structured data ship in the
HTML -- the entire reason the SEO-fields module (C-05) exists.

## Importing real Laravel data

```bash
node tools/db/import-laravel.mjs                     # users, categories, courses, sections, lessons...
node tools/db/import-laravel.mjs courses lessons     # or specific tables
```

Ids are preserved so every stored reference keeps resolving, and identity
sequences are re-synced afterwards. The importer **refuses to run against
non-empty tables** unless you pass `--merge`: `ON CONFLICT DO NOTHING` would
otherwise skip any row whose id is taken and report success, which is data loss
wearing a green tick.
## Database operations

```bash
npm run db:migrate        # apply schema + indexes + seed + RLS (refuses a non-empty public schema)
npm run db:reset          # drop OUR 61 tables, then re-apply from scratch
npm run db:verify         # compare the LIVE schema against Laravel, column by column
npm run db:verify-rls     # prove anon cannot write and cannot read secrets
npm run db:reload-cache   # NOTIFY pgrst -- run after any DDL applied over a direct connection
```

Order matters in `db:migrate`: **seed runs before RLS**, because `0003_rls.sql`
enables `FORCE ROW LEVEL SECURITY`, which subjects even the table owner to the
deny-all baseline.

After applying DDL over a direct Postgres connection, PostgREST keeps serving a
stale schema cache and every request fails with
`Could not find the table ... in the schema cache`. Run `db:reload-cache`.

## Bootstrapping the first admin

The Laravel seed never contained users, so neither does ours. Register the first
account, then promote it once:

```sql
update public.users set role='admin' where email='you@example.com';
```

Root-admin identity is the LOWEST user id (see `PermissionsService`), so that
account permanently bypasses the sub-admin permission checks.

## Quick start

```bash
npm install
npm run verify:parity     # proves the schema matches Laravel, table for table
npm test                  # 41 tests, no database required
cp .env.example .env      # then fill in your Supabase keys
npm run dev:api
curl localhost:4000/health
```

## Layout

```
supabase/migrations/   0001_schema.sql   61 tables, generated, do not hand-edit
                       0002_indexes.sql  75 indexes ported 1:1
                       0003_rls.sql      deny-all baseline + onyx.* claim helpers
                       0004..0006        the four added tables (see above)
                       0007_...          messaging RLS + Realtime publication
                       0008_...          bootcamp_resources (see above)
supabase/seed.sql      settings, 4 languages, 404 phrases, categories
tools/                 generators + the parity verifier
packages/types/        generated Database types + Zod schemas for JSON columns
packages/core/         settings, i18n, storage, auth, http conventions
apps/api/              Fastify API
docs/                  ADRs -- read ADR-001 before touching auth
```

## Regenerating the schema

The Laravel database is the source of truth. Nothing under
`supabase/migrations/` is edited by hand.

```bash
npm run gen:all        # schema + indexes + RLS + seed + types
npm run verify:parity  # must print PASS
```

## Three things that will bite you if you skip the ADRs

1. **Supabase Auth is not used.** `auth.uid()` throws against our bigint ids, and
   the app role travels in `app_role`, never `role`. See [ADR-001](docs/ADR-001-auth.md).
2. **Never `JSON.stringify` a JSON-as-text column.** PHP escapes solidus and
   non-ASCII; use `phpJsonEncode`. See [ADR-002](docs/ADR-002-schema-parity.md).
3. **`tinyint(1)` is `smallint`, not `boolean`.** The app compares to `0`/`1`.

## Dependency policy

Runtime is Node + Supabase. Nothing else is required.

`@supabase/supabase-js` is now a dependency of the web app as well as the API:
S12 subscribes to Supabase Realtime in the browser. It is the same Supabase
client already in use, not a new vendor.

| Optional | Used for | Needed? |
| --- | --- | --- |
| `REDIS_URL` | shared settings cache | No -- in-process cache is the default |
| `SENTRY_DSN` | error reporting | No -- stdout logging works |
| Vercel / Fly.io | hosting | No -- any Node host or container |

Third-party APIs arrive with the features that need them (Judge0 for the code
IDE, Zoom, OpenAI, the payment providers). They are already called by the Laravel
app today, so nothing new enters the system.

## S17: revenue that reconciles, and payout details with nowhere to live

Money arrives in four different tables, each with its own `instructor_revenue`
and `admin_revenue`: `payment_histories` (courses), `bootcamp_purchases`,
`team_package_purchases` and `tutor_bookings`. Every report sums all four and
asserts that instructor + platform equals gross.

**`users.paymentkeys` does not exist.** `PayoutSettingsController` ends with

```php
User::where('id', auth()->user()->id)->update(['paymentkeys' => $data]);
```

but `users` has 21 columns and that is not one of them, so saving payout details
fails outright. Meanwhile `payouts` already carries `payment_method` and
`payment_details`, which the request flow never filled in. The details are
captured **per payout request** here — no schema change, and more correct
anyway, since bank details can change between payouts.

Two more, both tested:

- `Payout::insert()` skips Eloquent timestamps, so `created_at` was **NULL** —
  and the instructor's own history list filters on `created_at`, so a request
  disappeared the moment it was submitted. Timestamps are written now.
- A pending request was not subtracted from the balance on screen, so the same
  money looked available twice. The balance now reports `pending` and
  `requestable` separately.

## S16: tutor booking, and a guard that never fired

`tution_started()` decides whether a tuition session can be joined. It ends:

```php
$booking = TutorBooking::where('id', $booking_id)
    ->whereNotNull('joining_data')
    ->where('start_time', '<', $extended_time)
    ->where('end_time', '>', $current_time)
    ->firstOrNew();
return $booking ? true : null;
```

`firstOrNew()` returns a **new, unsaved model** when nothing matches, so the
expression is truthy for every input — including a booking id that does not
exist. The window was never enforced anywhere the helper was used. It is a real
check here, and the end-to-end test books a session two days out and asserts the
403.

**The student was handed the host URL.** `join_class()` ended with
`redirect($meeting_info['start_url'])` — Zoom's `start_url` signs the holder in
as the **host**, so a student could start and control the session. The tutor
hosts and the student joins as a participant here, decided from the booking, and
the toolbar difference is asserted both in unit tests and end to end.

Two smaller ones: a booked slot stayed in the public availability list, so two
students could buy the same hour (the booking now claims the slot via
`booking_id`); and `tutor_schedules.price` was left null by the schedule form,
with the price read from the can-teach row at checkout — meaning a tutor raising
their rate silently repriced slots students were already looking at. The price is
copied onto the slot when it is created.

Sessions run on Jitsi, so tutor booking works with no Zoom account at all.

## S15: classrooms, and two bugs that cost customers money

A classroom package buys a block of seats on one course. Two things in the
original were wrong in ways a buyer would feel, and neither is carried over.

**Seats were shared between unrelated buyers.** `reserved_team_members($id)`
counts every row in `team_package_members` for the package with **no leader
filter**, and the controller compares that against `allocation`. Two customers
who buy the same 5-seat package therefore share one pool of five: the second
buyer can be locked out of seats they paid for. Seats are counted per leader
here, which is what buying a package is supposed to give you.

**Removing a member destroyed enrolments they had bought.** The original ran

```php
Enrollment::where('course_id', $package->course_id)->where('user_id', $user->id)->delete();
```

with no filter on where the enrolment came from. If the member had also bought
that course themselves, taking them out of the classroom deleted the access they
paid for. Only the enrolment this package granted
(`enrollment_type = 'team_package'`) is withdrawn here.

Two smaller ones, both now validated for real: `required_if:is_paid,1` never
fired because the field is called `pricing_type`, so a paid package could be
saved with **no price**; and `allocation` was validated `min:0`, which creates a
classroom nobody can ever be added to.

One type note: `team_training_packages.expiry_date` is a **unix integer** while
`enrollments.expiry_date` is a **datetime**. Laravel wrote the raw integer
straight into the datetime column — SQLite tolerated it, Postgres will not — so
the conversion happens on the way in, and an existing enrolment is only ever
extended, never shortened.

## S14: workshops, and one column with two meanings

`discounted_price` means **the final price** on a course and **the amount taken
off** on a workshop. Both readings are in `Admin/OfflinePaymentController.php`,
fifty lines apart:

```php
// line 91  (course)   -> discounted_price IS the price
$amount = $course->discount_flag == 1 ? $course->discounted_price : $course->price;
// line 144 (bootcamp) -> discounted_price is subtracted
$price  = $bootcamp->discount_flag == 1 ? $bootcamp->price - $bootcamp->discounted_price : $bootcamp->price;
```

Both are preserved. Reading the workshop column the course way would charge 25
instead of 75 on a 100-with-25-off workshop, which is what the unit test pins.

Two other things worth knowing:

- **`status` and `pending` are separate axes.** status is published or not;
  pending is awaiting approval. An admin's workshop is published and not
  pending; an instructor's is neither published nor approved until an admin
  says so.
- **Duplicate now deep-copies.** Laravel copied only the workshop row, so the
  clone had no modules, sessions or resources at all. Modules, their live
  classes and their resources are copied here, and the copy is unpublished.

Deleting a workshop cascades through modules to sessions and resources, porting
`remove_module_data()` / `remove_live_class_data()` / `remove_resource_data()`.
There are no foreign keys, so the cascade is application code.

## S13: live classes, and the secret that was in the page

The Zoom Meeting SDK secret was rendered into every class page and passed to
`ZoomMtg.generateSDKSignature()` in the browser — it was `console.log`ged too.
Anyone who opened a class could read it and afterwards sign themselves in as
host of any meeting on the account. Signing happens on the server here and the
secret never leaves it; the host role is read from the database and baked into
the signature, so nothing the client sends can change it.

Two more things fixed rather than copied, both covered by tests:

- the Jitsi view made **every account with role `instructor` a moderator in
  every course's room**, taught or not. Host now means the course owner, a
  listed co-instructor, or an admin.
- Jitsi rooms were named `lms-<slug>-class-<id>`, both parts public, so a room
  on the public `meet.jit.si` instance was guessable from the course page. A
  random code is generated per class and appended.

[`docs/ADR-005-live-classes.md`](docs/ADR-005-live-classes.md) has the detail,
including the derived join window (`live_classes` has no end time, so
`class_started()` could not be applied directly).

**Zoom is implemented but unverified against the live API** — this deployment has
no Zoom credentials. `ZoomService` takes an injectable `fetch` and the unit tests
pin the exact URL, method, headers and body of every call, plus the signature's
claims. The end-to-end test covers the no-credentials path: a clear 422 with
nothing written. Jitsi needs no account and is exercised end to end.

## S12: messaging, and which of three implementations was ported

The Laravel source carries **three** generations of the messaging feature, and
they disagree about the column names. Only one can execute against the shipped
schema. [`docs/ADR-004-messaging.md`](docs/ADR-004-messaging.md) has the detail;
the short version:

| Generation | Where | State |
| --- | --- | --- |
| `chats` / `message_thrades` | `ChatController` + `routes/chat.php` | tables do not exist; `Message_thrade.php` is not in the repo, so the file fatals |
| `message_thread_code` / `sender` / `read_status` | `frontend/Chatcontroller`, `count_unread_message_of_thread()`, `searchThreads()` | columns do not exist; every call throws |
| `thread_id` / `sender_id` / `receiver_id` / `read` | `student/MessageController`, most of `Admin\MessageController` | **this is what runs, and what was ported** |

Delivery is a Supabase Realtime subscription rather than the original AJAX
polling. That needs a token in browser JavaScript, which the httpOnly session
cookie deliberately is not, so `/api/messages/realtime-token` mints a **separate
five-minute token carrying `scope: 'realtime'`** — and `requireAuth()` refuses
any token that carries a scope. If that token leaks from the page it cannot call
the API at all; RLS (migration `0007`) then limits it to rows where the holder is
sender or receiver. The end-to-end suite asserts all four halves of that: the
participant reads, anonymous reads nothing, an outsider reads nothing, and a
direct insert is refused.

Three things in the original are fixed rather than copied, each with a test:

- `store()` never checked that the sender belonged to the thread it was posting
  into, so any signed-in account could join any conversation by guessing an id.
- `Admin\MessageController::store()` took `sender_id` from the request, letting
  an admin post messages that appear to come from any user.
- the student inbox sidebar used `where(contact_one, me)->where(contact_two, me)`
  — an AND, which only matches a thread you opened with yourself, so the sidebar
  was empty for every real conversation.

## S11: where the blog module diverges from the original

Three decisions worth knowing about, all forced by defects in the source rather
than by preference:

- **The blog was dead in the original.** `BlogVisibility` and
  `InstructorBlogPermission` both call `get_frontend_settings()`, which reads a
  `frontend_settings` table that this deployment never created -- so the helper
  returns `false` and every blog route redirects to the home page. The same
  "schema incomplete" defect disabled the page builder. Here the two keys are
  read from `settings`, and an absent value means **on**. Setting
  `blog_visibility_on_the_home_page = 0` still hides the module entirely, and
  `instructors_blog_permission = 0` still closes it to instructors -- which is a
  separate switch from publishing rights.
- **Instructor posts are always pending.** Admin posts publish on save
  (`status = 1`), instructor posts never do (`status = 0`), exactly as the two
  Laravel controllers hard-code it. `instructors_blog_permission` gates *access
  to the module*, not the ability to publish; conflating the two would let
  instructors publish unreviewed.
- **Testimonials now actually render.** `SettingController` wrote to
  `user_reviews`, nothing ever read the table back, and the home page showed
  hard-coded page-builder copy. The same admin CRUD now feeds `/api/testimonials`
  and a home-page section, so the screens do something.

## Deferred from S01, with reasons

- **F-02 (Supabase provisioning)** -- needs your account. Everything else is
  written so it works the moment `.env` is filled in.
- **P-05 (media library)** -- depends on P-04, which is done; scheduled with the
  upload UI in S02.
- **P-06 (mail)** -- SMTP settings are read, but templates land with the flows
  that send them (verification in A-03, reset in A-04).
- **P-09 (UI kit)** -- belongs with the Next.js app in S03; building it before
  there are screens to style would be guesswork.
