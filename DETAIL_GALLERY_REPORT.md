# Detail photo gallery — local implementation

## Backup
C:\Users\Nin\Documents\Codex\backups\pove24-before-detail-gallery-20261010-145929
100 project files copied outside the working directory; SHA-256 comparison: 0 mismatches. The local redesign is not a Git checkout; outputs Git status was clean. No commit, push, deployment or live data changes.

## Files
Added detail-gallery.js, detail-gallery.css, tests/detail-gallery.html, tests/detail-gallery-integration.html and tests/detail-gallery-preview.png.
Modified bootstrap.js and build-design.mjs; regenerated site.css. This report is DETAIL_GALLERY_REPORT.md. Existing card renderers, uploader and saved ordering logic were not changed.

## Placement and behavior
Only #/job/:id and #/worker/:id with an existing .detail-main receive a gallery. Jobs: after detail metadata and before the job description. Workers: after the profile heading and before the skills section. No photos, denied access or missing backend setup adds no gallery or empty space.
One photo has one large contained image. Multiple photos have thumbnails and an active green border. A native modal dialog provides close, previous/next, counter, Escape/arrow keys, swipe, focus containment, focus restoration and scroll lock/restoration. Mobile safe-area spacing and 44px minimum thumbnail targets are included.
The query filters attached photos by the exact parent UUID and orders by position ascending; position zero is first. No new cover field or browser object URLs. Each existing optimized storage object is signed through the caller session; lazy thumbnails and the main image reuse URLs/browser cache. Signed URLs are refreshed on interaction after 50 minutes. Errors show a Georgian unavailable-image message.

## Verification
- Build passed: node pove24-redesign-local/build-design.mjs.
- JavaScript syntax check passed.
- Existing automated tests: 44/44 passed using --test-isolation=none (default test runner subprocess was blocked by EPERM).
- Local browser fixture: 51 checks passed: 0/1/2/5 photos for both kinds, position ordering, thumbnail selection, viewer, next/previous, arrows, Escape, scroll/focus restoration, synthetic swipe, broken image, scoped retrieval adapter and responsive sizing.
- Mock detail integration: jobs with 5 and 0; workers with 2 and 0 passed. Uses real gallery route detection/placement with mocked data access, no production inserts.
- Actual browser viewport checks: 320, 375, 430, 768, 1280px. No page overflow or clipped thumbnail rows after the narrow-screen adjustment. Mobile viewer inspected at 320px.
- Not tested on physical iPhone/Android. Swipe checks use synthetic touch events. Live Supabase integration has NOT been verified.

## Supabase setup remaining
Existing migrations/20261010_beauty_listing_photos.sql remains unexecuted. The gallery uses SELECT on listing_photos under existing RLS, not the owner-only listing_photo_manifest RPC. Signing uses the private listing-photos bucket through the existing repository. Owners can read their photos; other visitors need attached photos approved=true and public_display_enabled=true plus active job/published worker status under the prepared policies. Both flags default to false; this implementation does not bypass them or turn them on.
The existing migration/storage policies must be reviewed and applied separately in staging with authorization, then real owner/anonymous/other-user retrieval verified. No additional migration is required by this gallery. No SQL, bucket, policy or production record was modified.

## Preview
Site: http://127.0.0.1:4173/#/
Local mocked detail example: http://127.0.0.1:4173/tests/detail-gallery-integration.html?kind=jobs&count=5
Interactive test fixture: http://127.0.0.1:4173/tests/detail-gallery.html
