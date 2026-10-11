# Pove private photo worker — Railway

Canonical Git location: `photo-operations/` on `pove-new-design`. Previous completed worker lived outside this checkout and was not present on any branch. This package reuses that worker; no database migration is included.

## Railway settings (apply only after explicit deployment approval)

- Repository: `iremadzenin357-cloud/pove24`.
- Select a branch containing this commit; currently prepared on `pove-new-design`, NOT main. No merge/push performed by preparation.
- Root Directory: repository root (blank or `/`).
- Builder: Dockerfile; Dockerfile Path: `photo-operations/Dockerfile`.
- Docker COPY sources deliberately use repository-root paths. Build locally from repo root: `docker build -f photo-operations/Dockerfile -t pove-photo-worker .`.
- `Dockerfile.dockerignore` restricts this Dockerfile's context to the runtime files, excluding frontend, tests, credentials and unrelated content. `.vercelignore` keeps the worker package out of the separate static frontend upload.
- Start command: leave unset (Docker CMD runs `python runner.py`). One replica, restart on failure, no public domain, port or HTTP healthcheck: this is a background worker.
- Set private Railway runtime Variables: `POVE_SUPABASE_URL`, `POVE_EXPECTED_PROJECT`, `POVE_SECRET_KEY`. Use a dedicated server secret or legacy service_role JWT. No VITE/NEXT_PUBLIC prefix; never add Docker ARG/ENV credentials or commit a variable export. Mounted `/run/secrets/pove_worker_key` remains an alternative for other private hosts.
- Keep frontend and worker secrets scoped to separate services. No credentials were accessed during preparation.

## Activation sequence

1. Review commit; explicitly approve push separately. **Pushing to Railway's selected branch can trigger automatic deployment**, so inspect/disable autodeploy before a push unless deployment is also approved.
2. After deployment approval, select the intended branch/settings and add secrets privately; build the image. Docker is unavailable in this local environment, so actual image build remains unverified.
3. Observe sanitized `cycle` counters with `errors:0`. Confirm repeated successful cycles and monitoring of missing success (>5 minutes), errors and restart loops. Use staging synthetic-file integration before production activation; an empty cycle is not a file-processing test.
4. Worker uses existing lease RPC acquire/renew/success/release and retry queues. Lease renews every 30 seconds; terminal cleanup precedes validation; HTTP redirects refused. No table/Storage configuration changes, category writes or profile-photo operations.
5. Uploads stay disabled: runner has no enable operation. Upload activation requires separate explicit approval after worker validation and moderation readiness. Current deployed contract keeps validated photos pending manual moderation; proposed automatic publication is NOT included.

## Files / tests

Runtime/build: Dockerfile, Dockerfile.dockerignore, requirements.txt, worker.py, runner.py. Review/test support: test_worker.py, test_deployment.py, README.md, .gitignore; root .vercelignore only excludes this worker folder.

From repository root: `python -m unittest discover -s photo-operations -p "test_*.py"`.
Tests use synthetic bytes/mocks; no SQL or Supabase connections. Container build, Railway secret delivery and real Storage/RPC behavior must be tested after separate approval.

Sources for build semantics: https://docs.railway.com/builds/dockerfiles and https://docs.docker.com/build/concepts/context/ . Dockerfile location does not change COPY's build-context root.
