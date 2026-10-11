# Beauty category and listing photos — backend setup (NOT EXECUTED)

## Current boundary
Local frontend and a proposed migration are ready. No SQL, bucket, policies, production records, deployment, push or commit was performed. Live configuration could not be read because outbound requests were blocked by the environment proxy. This is not a verified production-ready release.

## Before applying (requires separate approval)
1. Use a staging Supabase project with the same schema first. Export/back up that database and storage configuration.
2. Inspect `supabase-follow-up.sql` at the project root against the actual schema: public.profiles, categories, subcategories, job_posts, worker_profiles use UUID ids; parents have owner_id; categories have name/is_active and unique(name); subcategories have category_id/name/is_active and unique(category_id,name). Parent status values must include active (jobs) and published (workers).
3. Inspect existing `pg_policies` for public tables and storage.objects, existing bucket names, triggers and RPC functions. Policies are OR-combined: a pre-existing broad storage policy could defeat the new restrictions. Do not apply blindly over an existing listing_photos table/bucket or identically named function/policy.
4. Review `migrations/20261010_beauty_listing_photos.sql`. It is a one-time transaction, intentionally fails on conflicting objects. It seeds only the requested category, creates the relation, private bucket, RLS, RPCs and deletion triggers. It does not backfill/change existing listings or avatars.
5. After approval, apply to staging, refresh the application so category UUIDs are reloaded, and run the authenticated test matrix below. Apply to production only after a separate release decision. No service-role key belongs in browser code.

## Storage and access
- Bucket: listing-photos, PRIVATE, 5,242,880-byte limit, image/webp only. The client accepts originals up to 20 MiB: JPEG/PNG/WebP and HEIC/HEIF when native decoding succeeds. It checks signatures/HEIF container brands, decodes with EXIF orientation, caps 64MP, preserves alpha, does not upscale, resizes the longest edge to 1920px, and encodes WebP at .86, .80, then .74 only when needed to approach 1 MiB. The uploaded output still must be nonempty WebP <=5 MiB. The 200KB–1MB output range is a target, not a guarantee. No original or HEIC file is sent to Storage. Unsupported HEIC shows a Georgian error. No external conversion service or unverified codec dependency is used. Real Safari/Android HEIC compatibility still requires device testing.
- Paths: authenticated owner UUID / random photo UUID.webp. Reserved by an authenticated RPC. Immutable upload, no overwrite policy.
- Relation: owner_id, exactly one job_post_id/worker_profile_id when attached, position 0–4. Unique parent slots enforce five maximum, including malicious clients.
- RPC commit checks parent ownership and selected photo ownership/existence, serializes writes and compares expected existing photos to prevent stale tabs overwriting changes.
- Owner can preview private photos through signed URLs (one hour). Others cannot read new photos. approved=false and public_display_enabled=false by default; neither flag can be changed by the client.
- Future public access requires BOTH flags and an active/published visible parent. No public gallery was added. Browser validation is not a security boundary: a trusted moderation service must decode/validate uploaded bytes before any public approval. Storage MIME metadata alone cannot prove image contents. Previously issued signed URLs can remain valid until expiry.
- Existing parent create/update/contact/category policies remain authoritative and must be audited separately. No broad grants to bypass existing permissions.

## Failure and cleanup behavior
Uploads stage before the parent save. Uploaded files alone do not replace attached photos. The manifest change is transactional; previous photos retire only on successful commit. Ordinary text edits never overwrite the photo manifest. A failed manifest load disables photo edits but permits other fields.

Main listing/contact/category saves follow the existing multi-request architecture and are NOT one database transaction with storage. A partial listing save is possible; the form retains its UUID and data for retry and explicitly reports a photo-commit failure. Refreshing after a partial save may require reopening the existing listing. Successful selections remain in memory until navigation; this is not offline draft storage.

Retired objects are cleaned best-effort after a photo save: Storage API deletion first, relation deletion only after success. Listing deletion triggers retire associated references, preserving an eventual cleanup queue. Never directly delete storage.objects rows as file cleanup.

Before public launch, configure a trusted scheduled maintenance worker (not included or deployed here):
1. Lock expired pending rows older than 24 hours; transition still-pending rows to retired with retired_at. Active commits use row locks, so race handling must re-check state.
2. Select retired rows, remove the exact objects from listing-photos through the Storage API, and only on confirmed success delete the corresponding still-retired relation rows. Retry failures. Keep logs without private image data.
3. Account deletion must clean owned photo objects/relations before deleting the profile; the owner FK intentionally blocks dangling ownership. Verify any existing account-deletion function before activation.
The frontend reservation quota is enforced in SQL at 25 pending reservations per owner per 24 hours. Abandoned pending files remain private until maintenance; do not advertise automatic cleanup as configured yet.

## Authenticated staging matrix — all UNVERIFIED here
For both kinds and both beauty + a pre-existing category: create with 0/1/5 photos; edit text preserving photos; add/remove/reopen; remove all; reload after upload; retry interrupted upload and interrupted commit; rapid double click; two-tab conflict; delete listing and cleanup.
With owner A, owner B and anonymous sessions: B cannot reserve under A, attach/read/delete A photos, modify A parent or approval flags; anonymous cannot upload/read unapproved photos. Test spoofed payloads, missing objects, six attachments, stale manifests, oversized storage upload and direct API attempts. Verify approved public access only in a disposable staging case.
Verify existing sign-in, phone privacy, contact visibility, timestamps/status, search/category filters, job/worker cards/details, and mobile forms. Real production user records must not be test fixtures.


## First-photo ordering update (local, not executed)
The ordered collection is the only source of first-photo selection. Position 0 is first; there is no separate main/primary/cover column. Draft photos receive stable local UUIDs; upload maps each draft item to its reserved persistent photo UUID without changing collection order. The commit sends ordered UUIDs and stores ordinality minus one in `position`; the owner manifest returns `order by position`.

The prepared migration now compares the existing ordered UUID array with `p_expected` in order. It no longer sorts UUIDs before optimistic concurrency checking: another tab's reorder must be treated as a conflict. Client recovery after a lost response also requires exact order, not merely identical membership. No schema column or extra migration is needed while the original migration remains unapplied. Do not run anything without the separate setup approval.

There are currently no listing-photo card/detail renderers: profile avatar images are separate. When public photos are enabled later, fetch authorized/approved photos ordered by position; use the first returned photo for any supported card image and the same collection order for details. Do not expose private owner manifests or signed URLs to unauthorized viewers. Current task adds no public gallery.
