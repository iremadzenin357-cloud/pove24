import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from worker import API, DiagnosticFailure, call_rpc, cycle, log_failure
from test_worker import FakeAPI

class DiagnosticsTests(unittest.TestCase):
    def api(self):
        return API('https://test.supabase.co','sb_secret_synthetic','test')

    def test_http_code_and_rpc_only(self):
        body=json.dumps({'code':'42501','message':'SECRET path/token','details':'PRIVATE'}).encode()
        error=HTTPError('https://private/path',403,'SECRET',{},io.BytesIO(body))
        with patch('worker.urlopen',side_effect=error), self.assertRaises(DiagnosticFailure) as caught:
            call_rpc(self.api(),'listing_photo_worker_lease',{'p_action':'acquire','p_token':'PRIVATE'})
        out=io.StringIO()
        with redirect_stdout(out):log_failure(caught.exception)
        self.assertEqual(json.loads(out.getvalue()),{'event':'cycle_failed','stage':'lease_acquire',
            'rpc':'listing_photo_worker_lease','http_status':403,'error_code':'42501','failure_kind':'unknown'})

    def test_codes_and_malformed_responses(self):
        for payload,expected in [(b'{"code":"PGRST202"}','PGRST202'),
            (b'{"code":"secret/path"}',None),(b'{"code":123}',None),
            (b'not json SECRET',None),(b'[]',None),(b'x'*9000,None)]:
            error=HTTPError('private',404,'SECRET',{},io.BytesIO(payload))
            with patch('worker.urlopen',side_effect=error), self.assertRaises(DiagnosticFailure) as caught:
                call_rpc(self.api(),'listing_photo_gc_batch')
            self.assertEqual(caught.exception.error_code,expected)
            self.assertNotIn('SECRET',str(caught.exception))

    def test_network_failure_no_exception_text(self):
        with patch('worker.urlopen',side_effect=URLError('secret')), self.assertRaises(DiagnosticFailure) as caught:
            call_rpc(self.api(),'listing_photo_validation_batch')
        self.assertIsNone(caught.exception.http_status)
        self.assertEqual(caught.exception.stage,'validation_batch')

    def test_primary_failure_survives_release_failure(self):
        api=FakeAPI();original=api.rpc
        def rpc(name,body=None):
            if name=='listing_photo_gc_batch':raise DiagnosticFailure(http_status=403,error_code='42501')
            if name=='listing_photo_worker_lease' and body['p_action']=='release':
                raise DiagnosticFailure(http_status=503,error_code='PGRST000')
            return original(name,body)
        api.rpc=rpc
        out=io.StringIO()
        with redirect_stdout(out),self.assertRaises(DiagnosticFailure) as caught:cycle(api)
        self.assertEqual(caught.exception.stage,'cleanup_batch')
        self.assertEqual(caught.exception.http_status,403)
        self.assertEqual(json.loads(out.getvalue())['event'],'lease_release_failed')
        self.assertIsNone(api.worker_token)

    def test_release_failure_alone_is_reported(self):
        api=FakeAPI();original=api.rpc
        def rpc(name,body=None):
            if name=='listing_photo_worker_lease' and body['p_action']=='success':
                raise DiagnosticFailure(http_status=500,error_code='XX000')
            return original(name,body)
        api.rpc=rpc
        with self.assertRaises(DiagnosticFailure) as caught:cycle(api,lambda _:True)
        self.assertEqual(caught.exception.stage,'lease_success')

    def test_logger_revalidates_fields(self):
        error=DiagnosticFailure();error.stage='SECRET';error.rpc='/private/path';error.error_code='token';error.http_status='secret'
        out=io.StringIO()
        with redirect_stdout(out):log_failure(error)
        self.assertEqual(json.loads(out.getvalue()),{'event':'cycle_failed','stage':'cycle','rpc':None,'http_status':None,'error_code':None,'failure_kind':'unknown'})

if __name__=='__main__':unittest.main()
