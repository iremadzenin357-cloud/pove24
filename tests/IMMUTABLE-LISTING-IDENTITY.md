# Immutable listing identity — local preparation, 2026-10-11

Migration: `../migrations/20261011_immutable_listing_identity.sql`.
No remote SQL, deployment, production mutation or column-privilege changes authorized.

## Design

Use an ordinary, immediate AFTER UPDATE row trigger, not UPDATE OF selected columns.
It sees the final row after existing BEFORE triggers, including an identity change
introduced by a trigger when the original statement edits only a title. Any changed
id/owner_id raises 23514, rolling back the statement and transactional FK cascades.
BEFORE could reject earlier but a later BEFORE trigger could change identity after
that check. AFTER is chosen for final-row enforcement. Existing external, nontransactional
trigger side effects cannot be undone: review existing trigger functions before staging.
Constraints may reject an invalid change before our trigger; that is also safe rejection.
No production trigger-order compatibility is claimed from local source inspection.

Unchanged assignments pass IS DISTINCT FROM checks. Existing .update(row), which
sends owner_id, and id-bearing upsert retry therefore remain compatible by design.
An INSERT does not run the guard. ON CONFLICT DO UPDATE does; matching identity passes.
Primary-key defaults, INSERT policies, SELECT/UPDATE RLS and grants stay unchanged.
Admin status/content updates pass; ID/owner transfer is prohibited for every caller,
including service_role, unless a privileged database operator disables the protection.
No sanctioned listing ownership-transfer feature was found locally. If one exists
in production, stop and review that workflow before adopting this invariant.

The function is SECURITY INVOKER, has an empty search_path and reads only OLD/NEW.
REVOKE affects only the newly created function, not existing grants. Trigger execution
does not require exposing an RPC to browser roles. A trusted owner must create it.
Preflight verifies ordinary RLS tables, UUID columns, single-column id PKs, and name
collisions. It deliberately aborts on rerun; no objects are overwritten or dropped.

## Photo compatibility

Names do not match the photo migration's function/policy prefixes or trigger names.
Photo triggers fire on DELETE; this migration fires only on UPDATE. Neither migration
depends on the other's objects. Either ordering is technically possible; stage identity
protection first, then the pending photo migration, so both sequences are reviewable.
No photo files or photo SQL are modified. Category/contact/saved-listing FKs remain intact.

## Local checks and limitations

Run Node tests with `node --test --test-isolation=none tests/*.test.cjs` from the frontend.
The new tests execute actual frontend save functions with a fake backend and explicitly
simulated identity guard. They are not PostgreSQL trigger/RLS/PostgREST execution tests.
Parse the migration with pglast parse_sql and parse_plpgsql; never invoke application RPCs
as part of a read-only check. Existing photo tests and Python worker tests also apply.

Actual local results: 73/73 Node checks (17 new), 16/16 Python worker checks.
pglast 8.5 accepted 7 SQL statements and 2 PL/pgSQL entries for this migration;
the unchanged photo migration also passed its existing parser validation.
JavaScript syntax check passed. Offline gallery browser test could not launch Edge
(spawn EPERM); browser behavior is unverified. No migration or trigger was executed.
Backup verified before changes: 489 files, zero hash mismatches, outside the project:
`C:/Users/Nin/Documents/Codex/backups/pove-before-immutable-identity-20261011-113718`.
All preexisting project files remain byte-for-byte unchanged.

## Mandatory isolated staging acceptance (requires separate approval)

1. Inspect actual table owners, ACLs, all UPDATE/ALL policies, existing BEFORE/AFTER
   triggers and FK ON UPDATE behavior. Check proposed function/trigger name collisions.
2. Apply once to synthetic tables copied from reviewed schema. Rerun and collision
   fixtures must abort with no partial installation. Record ACL/RLS before and after.
3. Use A/B/admin/service-role sessions: own title/description/status edits, unchanged
   explicit id/owner_id, initial INSERT, same-ID upsert retries and response-loss retries.
4. Reject changed id/owner_id, both together, null attempts, conflicting-owner upsert;
   test listings with and without child rows. Null/PK/FK errors may precede 23514.
5. B editing A remains denied by existing RLS. Admin legitimate moderation passes;
   admin/service-role identity transfer fails. The guard does not grant any access.
6. A staging-only BEFORE trigger that changes id/owner_id during a title edit must
   be caught. Multirow updates containing one violation must roll back all DB changes.
7. Test FK NO ACTION and CASCADE fixtures; no child orphan or partial cascade may remain.
   Review external side effects in existing functions separately.
8. With photo migration installed, test category/contact links, galleries, photo commit,
   listing DELETE and account cleanup; protection must neither alter DELETE nor orphan data.
9. Browser test: current UI create/edit/retry and actual supported admin controls.
10. Only after reviewed staging evidence consider a separately approved production release.
