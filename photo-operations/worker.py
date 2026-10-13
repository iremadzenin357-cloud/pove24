"""Trusted listing-photo worker. Importing runs nothing; CLI needs --apply + project pin.

Uses only Storage API for file deletion, never direct SQL/storage.objects deletion.
No production credentials are stored here. Keep this directory OUTSIDE frontend hosting.
"""
import argparse
import hashlib
import io
import json
import os
import re
import warnings
import time
import random
import uuid
import base64
import threading
import socket
import ssl
from http.client import InvalidURL
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise DiagnosticFailure(http_status=code, failure_kind='redirect_blocked')

# Never forward server credentials to a redirected host.
urlopen = build_opener(NoRedirect()).open

BUCKET = 'listing-photos'
LIMIT = 5 * 1024 * 1024
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
PATH = re.compile(rf'^{UUID}/{UUID}\.webp$')

RPC_STAGES = {
    'listing_photo_worker_lease': 'lease',
    'listing_photo_gc_batch': 'cleanup_batch',
    'listing_photo_gc_finish': 'cleanup_finish',
    'listing_photo_validation_batch': 'validation_batch',
    'listing_photo_record_validation': 'validation_record',
    'listing_photo_orphan_batch': 'orphan_batch',
    'listing_photo_retry': 'retry_record',
}
STAGES = set(RPC_STAGES.values()) | {'cycle', 'lease_acquire', 'lease_renew',
    'lease_release', 'lease_success', 'storage_download', 'storage_remove', 'photo_processing'}
FAILURE_KINDS = {'lease_not_acquired', 'unexpected_response', 'dns', 'timeout',
    'tls', 'connection', 'redirect_blocked', 'invalid_json', 'invalid_request', 'unknown'}

def failure_kind(exc):
    # Classify exception types only; never inspect or emit their messages.
    reason = exc.reason if isinstance(exc, URLError) and not isinstance(exc, HTTPError) else exc
    if isinstance(reason, socket.gaierror): return 'dns'
    if isinstance(reason, TimeoutError): return 'timeout'
    if isinstance(reason, ssl.SSLError): return 'tls'
    if isinstance(reason, (ConnectionError, OSError)) and not isinstance(reason, HTTPError): return 'connection'
    if isinstance(reason, (json.JSONDecodeError, UnicodeDecodeError)): return 'invalid_json'
    if isinstance(reason, (ValueError, TypeError, UnicodeEncodeError, InvalidURL)): return 'invalid_request'
    return 'unknown'

class DiagnosticFailure(RuntimeError):
    def __init__(self, stage='cycle', rpc=None, http_status=None, error_code=None, failure_kind='unknown'):
        super().__init__('photo operation failed')
        self.stage = stage if stage in STAGES else 'cycle'
        self.rpc = rpc if rpc in RPC_STAGES else None
        self.http_status = http_status if type(http_status) is int and 100 <= http_status <= 599 else None
        self.error_code = error_code if isinstance(error_code, str) and re.fullmatch(r'(?:[0-9A-Z]{5}|PGRST[0-9]{3})', error_code) else None
        self.failure_kind = failure_kind if failure_kind in FAILURE_KINDS else 'unknown'

def diagnostic(exc, stage='cycle', rpc=None):
    if isinstance(exc, DiagnosticFailure):
        return DiagnosticFailure(stage if stage != 'cycle' else exc.stage,
                                 rpc or exc.rpc, exc.http_status, exc.error_code, exc.failure_kind)
    return DiagnosticFailure(stage, rpc, failure_kind=failure_kind(exc))

def log_failure(exc, event='cycle_failed'):
    safe = diagnostic(exc)
    print(json.dumps({'event': event if event in ('cycle_failed','photo_failed','lease_release_failed') else 'cycle_failed',
        'stage':safe.stage,'rpc':safe.rpc,'http_status':safe.http_status,'error_code':safe.error_code,
        'failure_kind':safe.failure_kind}), flush=True)

def call_rpc(api, name, body=None):
    stage = RPC_STAGES.get(name, 'cycle')
    if name == 'listing_photo_worker_lease':
        stage = 'lease_' + (body or {}).get('p_action', '')
    try:
        result = api.rpc(name, body)
        if name == 'listing_photo_worker_lease' and result is not True:
            status = getattr(getattr(api, '_response_state', None), 'status', None)
            failure = DiagnosticFailure(stage, name, status, failure_kind=
                'lease_not_acquired' if result is False else 'unexpected_response')
            if not result:
                raise failure
            # Preserve prior truthiness behavior for malformed truthy responses.
            log_failure(failure)
        return result
    except Exception as exc:
        raise diagnostic(exc, stage, name) from None


class MissingPhoto(RuntimeError):
    """Definitive object-not-found; not a transient transport or authorization error."""


def safe_path(path):
    if not isinstance(path, str) or not PATH.fullmatch(path):
        raise ValueError('unexpected photo namespace')
    return path


def validate_image(data):
    """Decode actual pixels, not only MIME/header metadata; fail closed on invalid images."""
    from PIL import Image, UnidentifiedImageError
    if not data or len(data) > LIMIT:
        return False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as img:
                if img.format != 'WEBP' or getattr(img, 'n_frames', 1) != 1:
                    return False
                if not (0 < img.width <= 1920 and 0 < img.height <= 1920):
                    return False
                if img.info.get('exif') or img.info.get('xmp'):
                    return False
                img.load()
        return True
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        return False


class API:
    def __init__(self, url, key, expected_project):
        parsed = urlparse(url)
        if (parsed.scheme != 'https' or parsed.hostname != expected_project + '.supabase.co'
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment
                or parsed.username or parsed.password or parsed.port):
            raise ValueError('project pin mismatch; hosted Supabase HTTPS URL required')
        if not key:
            raise ValueError('server credential missing')
        self.url, self.key = url.rstrip('/'), key
        self.worker_token = None
        self._response_state = threading.local()
        if key.startswith('sb_secret_'):
            self.legacy = False
        else:
            try:
                payload = key.split('.')[1]
                claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                if claims.get('role') != 'service_role':
                    raise ValueError()
            except Exception:
                raise ValueError('expected a server secret key or legacy service_role JWT') from None
            self.legacy = True  # Shape check only; Supabase verifies the signature.

    def request(self, path, method='POST', body=None, binary=False):
        self._response_state.status = None
        headers = {'apikey': self.key}
        if self.legacy:
            headers['Authorization'] = 'Bearer ' + self.key
        if self.worker_token:
            headers['x-pove-worker-token'] = self.worker_token
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = Request(self.url + path, method=method, headers=headers,
                      data=None if body is None else json.dumps(body).encode())
        # Only repeat idempotent reads/deletes. RPC mutation outcomes may be ambiguous.
        for attempt in range(3 if method in ('GET', 'DELETE') else 1):
            self._response_state.status = None
            try:
                with urlopen(req, timeout=20) as response:
                    self._response_state.status = getattr(response, 'status', None)
                    data = response.read(LIMIT + 1 if binary else 2 * 1024 * 1024)
                    if binary:
                        return data
                    return json.loads(data) if data else None
            except (HTTPError, URLError, TimeoutError) as exc:
                if binary and isinstance(exc, HTTPError) and exc.code == 404:
                    raise MissingPhoto('photo object missing') from None
                retryable = not isinstance(exc, HTTPError) or exc.code in (408, 429, 500, 502, 503, 504)
                if method not in ('GET', 'DELETE') or not retryable or attempt == 2:
                    code = None
                    if isinstance(exc, HTTPError):
                        try:
                            payload = json.loads(exc.read(8192))
                            code = payload.get('code') if isinstance(payload, dict) else None
                        except Exception:
                            pass
                    raise DiagnosticFailure(http_status=exc.code if isinstance(exc, HTTPError) else self._response_state.status,
                                            error_code=code, failure_kind=failure_kind(exc)) from None
                time.sleep(2 ** attempt + random.random())
            except Exception as exc:
                safe = diagnostic(exc)
                if safe.http_status is None:
                    safe.http_status = self._response_state.status
                raise safe from None

    def rpc(self, name, body=None):
        return self.request('/rest/v1/rpc/' + name, body=body or {})

    def download(self, path):
        try:
            return self.request('/storage/v1/object/authenticated/' + BUCKET + '/' + quote(safe_path(path), safe='/'),
                                method='GET', binary=True)
        except MissingPhoto:
            raise
        except Exception as exc:
            raise diagnostic(exc, 'storage_download') from None

    def remove(self, path):
        try:
            self.request('/storage/v1/object/' + BUCKET, method='DELETE', body={'prefixes': [safe_path(path)]})
        except Exception as exc:
            raise diagnostic(exc, 'storage_remove') from None


def cycle(api, decoder=validate_image):
    token = str(uuid.uuid4())
    if not call_rpc(api, 'listing_photo_worker_lease', {'p_token': token, 'p_action': 'acquire'}):
        raise DiagnosticFailure('lease_acquire', 'listing_photo_worker_lease')
    api.worker_token = token
    successful = False
    stop = threading.Event()
    lost = threading.Event()
    renewal_failure = []
    primary_failure = None
    renewal_lock = threading.Lock()
    def heartbeat():
        if lost.is_set():
            raise renewal_failure[0]
        with renewal_lock:
            try:
                if not call_rpc(api, 'listing_photo_worker_lease', {'p_token': token, 'p_action': 'renew'}):
                    raise DiagnosticFailure('lease_renew', 'listing_photo_worker_lease')
            except Exception as exc:
                failure = diagnostic(exc, 'lease_renew', 'listing_photo_worker_lease')
                renewal_failure.append(failure)
                lost.set()
                raise failure from None
    def renew_in_background():
        while not stop.wait(30):
            try:
                heartbeat()
            except Exception:
                return
    renewal = threading.Thread(target=renew_in_background, daemon=True)
    renewal.start()
    try:
        result = process_batches(api, decoder, heartbeat)
        heartbeat()
        successful = not result['errors']
        return result
    except Exception as exc:
        primary_failure = exc
        raise
    finally:
        stop.set()
        renewal.join()
        try:
            released = call_rpc(api, 'listing_photo_worker_lease', {
                'p_token': token, 'p_action': 'success' if successful else 'release'})
            if not released:
                raise DiagnosticFailure('lease_success' if successful else 'lease_release', 'listing_photo_worker_lease')
        except Exception as exc:
            if primary_failure is None:
                raise
            log_failure(exc, 'lease_release_failed')
        finally:
            api.worker_token = None


def process_batches(api, decoder, heartbeat):
    counts = dict(validated=0, rejected=0, retired_processed=0, orphans_processed=0, errors=0)
    def retry(row, orphan=False):
        counts['errors'] += 1
        heartbeat()
        # If persisting retry fails, abort: never report a successful cycle.
        call_rpc(api, 'listing_photo_retry', {'p_id': None if orphan else row['id'], 'p_path': row['storage_path']})
    # Urgent/terminal removals precede decoding. Paths can never be reattached/reapproved.
    heartbeat()
    for row in call_rpc(api, 'listing_photo_gc_batch'):
        heartbeat()
        try:
            api.remove(safe_path(row['storage_path']))
            heartbeat()
            call_rpc(api, 'listing_photo_gc_finish', {'p_id': row['id']})
            counts['retired_processed'] += 1
        except Exception as exc:
            log_failure(diagnostic(exc) if isinstance(exc, DiagnosticFailure) else diagnostic(exc, 'photo_processing'), 'photo_failed')
            retry(row)
    # No automatic content approval. Successful decoding only unlocks admin review.
    heartbeat()
    for row in call_rpc(api, 'listing_photo_validation_batch'):
        heartbeat()
        try:
            try:
                data = api.download(safe_path(row['storage_path']))
                valid = decoder(data)
            except MissingPhoto:
                # Missing bytes cannot ever become approved. Preserve the record for
                # owner feedback and let the terminal cleanup queue finish it.
                data, valid = b'', False
            heartbeat()
            call_rpc(api, 'listing_photo_record_validation', {
                'p_id': row['id'], 'p_sha256': hashlib.sha256(data).hexdigest() if valid else None,
                'p_valid': valid})
            counts['validated' if valid else 'rejected'] += 1
        except Exception as exc:
            log_failure(diagnostic(exc) if isinstance(exc, DiagnosticFailure) else diagnostic(exc, 'photo_processing'), 'photo_failed')
            retry(row)  # Transport errors never become content rejection.
    heartbeat()
    for row in call_rpc(api, 'listing_photo_orphan_batch'):
        heartbeat()
        try:
            api.remove(safe_path(row['storage_path']))
            heartbeat()
            counts['orphans_processed'] += 1
        except Exception as exc:
            log_failure(diagnostic(exc) if isinstance(exc, DiagnosticFailure) else diagnostic(exc, 'photo_processing'), 'photo_failed')
            retry(row, orphan=True)
    return counts


def set_uploads(api, enabled):
    result = api.rpc('listing_photo_set_uploads', {'p_enabled': enabled})
    rows = api.request('/rest/v1/listing_photo_settings?id=eq.true&select=uploads_enabled', method='GET')
    if result is not enabled or rows != [{'uploads_enabled': enabled}]:
        raise RuntimeError('upload state verification failed; inspect state before proceeding')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Explicitly permit remote reads/writes; NEVER use during local-only preparation')
    parser.add_argument('--expected-project', default='')
    parser.add_argument('operation', choices=['cycle', 'prepare-account-deletion', 'account-cleanup-status', 'enable-uploads', 'disable-uploads'])
    parser.add_argument('--owner')
    parser.add_argument('--confirm-readiness', action='store_true', help='Human confirmation that staging, monitoring and moderation are ready')
    args = parser.parse_args()
    if not args.apply:
        print('No connection made. Remote operations require separate approval and --apply.')
        return
    api = API(os.environ.get('POVE_SUPABASE_URL', ''), os.environ.get('POVE_SECRET_KEY') or os.environ.get('POVE_SERVICE_ROLE_KEY', ''), args.expected_project)
    if args.operation == 'cycle':
        result = cycle(api)
        print(json.dumps(result))
        if result['errors']:
            raise SystemExit(1)
    elif args.operation in ('prepare-account-deletion', 'account-cleanup-status'):
        if not re.fullmatch(UUID, args.owner or ''):
            raise ValueError('owner UUID required')
        if args.operation == 'account-cleanup-status':
            print(json.dumps(api.rpc('listing_photo_account_cleanup_status', {'p_owner': args.owner})))
        else:
            api.rpc('listing_photo_prepare_account_deletion', {'p_owner': args.owner})
            print('Photo writes blocked and cleanup queued. Account NOT deleted.')
    else:
        if args.operation == 'enable-uploads' and not args.confirm_readiness:
            raise ValueError('explicit readiness confirmation required')
        set_uploads(api, args.operation == 'enable-uploads')
        print('Photo upload setting verified.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Photo operation failed; inspect private server monitoring. No credentials logged.')
        raise SystemExit(1)
