-- PHASE 2 REVIEW CANDIDATE ONLY. Not executed; does not activate paginated loading.
-- Check existing equivalent indexes, table sizes and query plans before approval.
-- Each CONCURRENTLY statement must run outside a transaction block, separately.
-- IF NOT EXISTS checks names only, not equivalence or validity. An interrupted
-- concurrent build can leave an invalid index: inspect it before any retry.
-- No RLS, grants, policies, data or category definitions are changed here.

-- Active-only homepage reads, plus status-ranked job page reads.
create index concurrently if not exists pove_job_status_created_id_idx
  on public.job_posts (status, created_at desc nulls last, id asc);
create index concurrently if not exists pove_worker_status_created_id_idx
  on public.worker_profiles (status, created_at desc nulls last, id asc);

-- Worker searches across all RLS-visible statuses.
create index concurrently if not exists pove_worker_created_id_idx
  on public.worker_profiles (created_at desc nulls last, id asc);
create index concurrently if not exists pove_worker_pay_id_idx
  on public.worker_profiles (pay asc nulls last, id asc);
