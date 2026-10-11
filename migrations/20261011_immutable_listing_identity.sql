-- LOCAL REVIEW ONLY. Never executed against a database during preparation.
-- Separate from photo infrastructure; no existing data, RLS or grants changed.
-- One-shot migration: collisions abort rather than replacing existing objects.
BEGIN;

DO $preflight$
DECLARE
  target_name text;
  target_oid oid;
BEGIN
  FOREACH target_name IN ARRAY ARRAY['job_posts','worker_profiles'] LOOP
    target_oid := to_regclass('public.' || target_name);
    IF target_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=target_oid AND relkind='r' AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Identity preflight: public.% must be an ordinary RLS table', target_name;
    END IF;
    IF (SELECT count(*) FROM pg_attribute WHERE attrelid=target_oid
      AND attname IN ('id','owner_id') AND atttypid='uuid'::regtype
      AND attnum>0 AND NOT attisdropped) <> 2 THEN
      RAISE EXCEPTION 'Identity preflight: UUID id/owner_id required on public.%', target_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_attribute a
        ON a.attrelid=c.conrelid AND a.attname='id'
      WHERE c.conrelid=target_oid AND c.contype='p'
        AND c.conkey=ARRAY[a.attnum]::smallint[] AND c.convalidated
    ) THEN
      RAISE EXCEPTION 'Identity preflight: single-column id primary key required on public.%', target_name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pove_assert_listing_identity_immutable') THEN
    RAISE EXCEPTION 'Identity preflight: function name already exists; review manually';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
    'pove_job_posts_identity_immutable','pove_worker_profiles_identity_immutable'
  )) THEN
    RAISE EXCEPTION 'Identity preflight: trigger name already exists; review manually';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.pove_assert_listing_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514', MESSAGE = 'Listing ID cannot be changed.';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514', MESSAGE = 'Listing owner cannot be changed.';
  END IF;
  RETURN NEW;
END;
$function$;

-- ACL applies only to this NEW trigger function, never to an existing object.
-- The trusted migration owner creates the triggers; no public RPC is provided.
REVOKE ALL ON FUNCTION public.pove_assert_listing_identity_immutable()
FROM PUBLIC, anon, authenticated, service_role;

-- AFTER checks the final row after every BEFORE trigger. Deliberately not
-- UPDATE OF id,owner_id: another trigger may change identity during a title edit.
-- Unchanged assignments and the UPDATE arm of an upsert are accepted.
-- No administrator/service-role exemption; INSERT and DELETE are unaffected.
CREATE TRIGGER pove_job_posts_identity_immutable
AFTER UPDATE ON public.job_posts
FOR EACH ROW EXECUTE FUNCTION public.pove_assert_listing_identity_immutable();

CREATE TRIGGER pove_worker_profiles_identity_immutable
AFTER UPDATE ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.pove_assert_listing_identity_immutable();

COMMIT;
