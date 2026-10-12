"""Private container entrypoint: cycle only; never enables uploads."""
import json
import os
import signal
import threading
import random
from pathlib import Path
from worker import API, cycle, log_failure

def main():
    # Mounted secret, not Docker build args / image layers / frontend environment.
    key = os.environ.get('POVE_SECRET_KEY', '').strip()
    if not key:
        key = Path('/run/secrets/pove_worker_key').read_text().strip()
    api = API(os.environ.get('POVE_SUPABASE_URL', ''), key,
              os.environ.get('POVE_EXPECTED_PROJECT', ''))
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    failures = 0
    while not stop.is_set():
        try:
            result = cycle(api)
            failures = failures + 1 if result['errors'] else 0
            print(json.dumps({'event':'cycle', **result}), flush=True)
        except Exception as exc:
            failures += 1
            # Do not log exception bodies, URLs, headers, paths or credentials.
            log_failure(exc)
        delay = min(300, 30 * 2 ** min(failures, 4)) + random.uniform(0, 5)
        stop.wait(delay)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Worker configuration/startup failed.', flush=True)
        raise SystemExit(1)
