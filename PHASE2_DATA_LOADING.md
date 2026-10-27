# Phase 2 — connected implementation (2026-10-22)

## What is connected

bootstrap loads the existing listing-query-core before the store and loads
listing-search-ui before listing-pagination. Store initialization probes only the
read-only `pove_listing_candidates_v1('capabilities')` RPC. Version 1 enables the new
path. PGRST202/42883 (missing function) keeps the existing application path; permission
and network failures are not mislabeled as empty results.

- Jobs/workers: existing controls request RPC pages and use server totals/pages.
  Only returned cards render; the DOM paginator does not re-sort or slice a server page.
- Homepage: the same existing horizontal feed requests 12 active job posts / published worker profiles per
  page, appending on approach to the end. Existing markup, gestures and arrows remain.
- Anonymous home/search startup skips the global jobs/workers/category-link reads.
- Direct details: RPC lookup by UUID or legacy ID, independent of the first 1,000 rows.
- Search entities merge into the read cache without invoking write APIs or interpreting
  omitted rows as deletions. Avatars and views are fetched for the returned IDs.
- Saved state, photo functionality, reports and admin implementations are retained.
  Management routes retain their legacy complete-cache initialization path.
- Requests debounce 180ms; stale route/filter results cannot paint. Residual scans stop
  after an obsolete batch. Auth changes invalidate queries. Failed requests do not
  become successful empty responses.

## Accurate compatibility, with a deliberate performance limit

Simple city/payment searches and sort/page selection use one RPC. The RPC applies
existing RLS, count-before-limit, active/completed/other job ranking, creation-time or
coalesced job-price/worker-pay sort, and deterministic UUID ties. No result-total cap.

Advanced category aliases/inference, multi-category OR, text, district trimming,
dates, durations, pay bounds and secondary sort-payment filters use the ORIGINAL JS
predicates. Candidates are fetched in ordered batches of 100; matching counts and the
requested page are accumulated without loading a full global result array. This is
an accurate compatibility path, NOT a claim that all advanced predicates now execute
inside PostgreSQL. Complex searches can still scan all server-filtered candidates on
each page. Additional SQL predicate ports require differential PostgreSQL tests before
replacing these rules. There is no silent UUID-only substitute.

Counts and rows for a simple page share a SQL statement snapshot. Complex searches
span snapshots: changed candidate totals abort with retry rather than returning a
known inconsistent count. Same-count updates/reordering can still affect a scan, as
with other offset pagination; test concurrent writes before deployment.

## SQL review and activation

`migrations/20261023_listing_candidates.sql` is a NEW one-time migration:
- Adds only a STABLE SECURITY INVOKER RPC with empty search_path and explicit public
  table references; no dynamic SQL, writes, policy changes, table changes, or elevated
  credentials. Revoke default PUBLIC execution; grant execution to anon/authenticated.
- Explicit output projection omits phone/private fields. Existing underlying column
  grants and RLS must permit the referenced reads; invoker execution does not bypass them.
- Joins visible category/subcategory rows, normalizes the same display aliases, and
  avoids multiplying listing counts by category joins.
- The capability probe alone changes no data. Do not apply to production automatically.
- After RPC review/application and frontend deployment, version probing activates the
  connection. Until then, missing RPC means the legacy implementation continues.

The earlier 20261022_listing_query_indexes.review.sql is OPTIONAL and still unexecuted.
Check existing equivalent indexes and query plans; do not run concurrent index builds
inside a transaction. No profile-photo/listing-photo migrations need to be rerun.

## Intentionally unchanged / remaining blockers

- Authenticated startup still loads the legacy full listing snapshots (and their old
  1,000-row limit) to preserve saved/owner/admin snapshot-based writes and migration
  logic. Search queries and result counts themselves are independent of that cache.
  A dedicated scoped management-cache migration is still required to remove this
  authenticated-startup cost. Admin/saved bulk screens retain their existing limits.
- Anonymous limited routes skip global public-profile/view reads and fetch those for
  returned IDs. Other secondary metadata retains the existing loading rules.
- Legacy category links had unspecified order. Both old/new paths consume the first
  visible link for primary labels. Verify multi-category fixtures in real PostgreSQL;
  equal-sort ties are now deterministic instead of depending on retrieval order.
- RPC table/column compatibility, PostgreSQL type checking, RLS role matrix and actual
  query plans require an isolated database. Parser success is not migration execution.
- Offline browser route and gallery fixtures passed in Edge after a sandboxed launch
  was blocked. Network requests were blocked; real-session end-to-end testing remains manual.

## Required integration checks before deployment

1. Review RPC dependencies against the known schema and apply only in an approved
   test environment. Test anon/owner/other-user/admin reads and phone non-disclosure.
2. Exercise old category aliases, multiple categories, date/week/duration, negotiable
   pay, all sorts, empty results, concurrent edits and >1,000 synthetic records.
3. Exercise search-to-detail, saved toggles, auth transitions, owner edits, gallery,
   reporting and admin screens; verify no partial read is treated as a deletion.
4. Check mobile/desktop carousel append, scroll preservation, counts and pagination;
   verify missing RPC fallback and network failure handling.

No SQL, deployment, push or production setting changes were performed locally.

## Local verification and deployment status (2026-10-27)

185 Node tests (including 23 account-deletion tests) and 45 Python tests
(37 worker + 8 staging-baseline) passed. JavaScript syntax and git diff --check passed.
Offline browser route tests passed at 390px and 1280px for request failure, logout,
account switching and stale responses. All 31 offline gallery checks passed.

The user confirmed that the corrected RPC migration was applied in production and
anonymous checks returned home=11, jobs=6, workers=5 with zero unexpected statuses.
This is user-reported verification, not a database connection made by this agent.
Do not rerun the one-shot migration. Optional index proposals remain unexecuted.
Real authenticated owner/other-user/admin browser tests remain manual.

The final route guard immediately removes previous content on asynchronous navigation
and auth refresh, displays a safe error on failure, and rejects obsolete responses.
No database, RLS, worker or production settings were changed during this work.
