import io
import json
import socket
import ssl
import unittest
from http.client import InvalidURL
from contextlib import redirect_stdout
from unittest.mock import patch
from urllib.error import URLError
from worker import API, DiagnosticFailure, NoRedirect, call_rpc, log_failure

class Response:
    status = 200
    def __init__(self, data): self.data = data
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit): return self.data

class FailureKindsTests(unittest.TestCase):
    def api(self): return API('https://test.supabase.co', 'sb_secret_synthetic', 'test')
    def lease(self, api): return call_rpc(api,'listing_photo_worker_lease',{'p_action':'acquire','p_token':'synthetic'})

    def test_false_null_and_other_falsey_results(self):
        for raw,kind in [(b'false','lease_not_acquired'),(b'null','unexpected_response'),
                         (b'','unexpected_response'),(b'0','unexpected_response'),(b'[]','unexpected_response')]:
            with self.subTest(raw=raw),patch('worker.urlopen',return_value=Response(raw)),self.assertRaises(DiagnosticFailure) as c:
                self.lease(self.api())
            self.assertEqual(c.exception.failure_kind,kind)
            self.assertEqual(c.exception.http_status,200)
            self.assertEqual(c.exception.stage,'lease_acquire')

    def test_true_and_truthy_malformed_behavior_unchanged(self):
        for raw,expected in [(b'true',True),(b'{"sensitive":"secret"}',{'sensitive':'secret'})]:
            out=io.StringIO()
            with patch('worker.urlopen',return_value=Response(raw)),redirect_stdout(out):
                self.assertEqual(self.lease(self.api()),expected)
            if expected is True: self.assertEqual(out.getvalue(),'')
            else:
                log=json.loads(out.getvalue());self.assertEqual(log['failure_kind'],'unexpected_response')
                self.assertEqual(log['http_status'],200);self.assertNotIn('secret',out.getvalue())

    def test_exception_types_and_no_post_retry(self):
        cases=[(URLError(socket.gaierror('secret')),'dns'),(TimeoutError('secret'),'timeout'),
               (URLError(ssl.SSLError('secret')),'tls'),(ConnectionResetError('secret'),'connection'),
               (ValueError('secret'),'invalid_request'),(InvalidURL('secret'),'invalid_request'),(RuntimeError('secret'),'unknown')]
        for error,kind in cases:
            with self.subTest(kind=kind),patch('worker.urlopen',side_effect=error) as opening,patch('worker.time.sleep') as sleep,self.assertRaises(DiagnosticFailure) as c:
                self.lease(self.api())
            self.assertEqual(c.exception.failure_kind,kind);self.assertEqual(opening.call_count,1);sleep.assert_not_called()
            self.assertIsNone(c.exception.http_status)

    def test_invalid_json_keeps_status(self):
        with patch('worker.urlopen',return_value=Response(b'private not json')),self.assertRaises(DiagnosticFailure) as c:
            self.lease(self.api())
        self.assertEqual(c.exception.failure_kind,'invalid_json');self.assertEqual(c.exception.http_status,200)

    def test_redirect_keeps_status(self):
        with self.assertRaises(DiagnosticFailure) as c:
            NoRedirect().redirect_request(None,None,302,'secret',{},'private')
        self.assertEqual(c.exception.failure_kind,'redirect_blocked');self.assertEqual(c.exception.http_status,302)

    def test_status_not_reused_after_next_request_fails(self):
        api=self.api()
        with patch('worker.urlopen',side_effect=[Response(b'true'),TimeoutError('secret')]):
            self.assertTrue(self.lease(api))
            with self.assertRaises(DiagnosticFailure) as c:self.lease(api)
        self.assertIsNone(c.exception.http_status)

    def test_failure_kind_is_allowlisted_at_log_boundary(self):
        error=DiagnosticFailure();error.failure_kind='secret/path'
        out=io.StringIO()
        with redirect_stdout(out):log_failure(error)
        self.assertEqual(json.loads(out.getvalue())['failure_kind'],'unknown')
        self.assertNotIn('secret',out.getvalue())

if __name__=='__main__':unittest.main()
