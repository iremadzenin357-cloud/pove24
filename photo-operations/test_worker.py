import io
import unittest
import json
import base64
from unittest.mock import patch
from PIL import Image
from worker import API, LIMIT, cycle, safe_path, validate_image, set_uploads

PATH = '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.webp'


class FakeAPI:
    def __init__(self, fail_delete=False, fail_download=False):
        self.calls = []
        self.fail_delete = fail_delete
        self.fail_download = fail_download

    def rpc(self, name, body=None):
        self.calls.append((name, body))
        if name == 'listing_photo_worker_lease':
            return True
        if name.endswith('_batch'):
            return [{'id': 'photo', 'storage_path': PATH}]

    def download(self, path):
        if self.fail_download:
            raise RuntimeError('offline')
        return b'image'

    def remove(self, path):
        self.calls.append(('remove', path))
        if self.fail_delete:
            raise RuntimeError('offline')


class WorkerTests(unittest.TestCase):
    def test_paths_never_allow_other_bucket_or_traversal(self):
        self.assertEqual(safe_path(PATH), PATH)
        for path in ['../profile-photos/a', 'profile-photos/a', PATH + '?token=x', '/' + PATH, 'a.webp']:
            with self.assertRaises(ValueError):
                safe_path(path)

    def test_project_pin_rejects_wrong_host(self):
        for url in ['https://other.supabase.co', 'http://test.supabase.co', 'https://test.supabase.co@evil.test', 'https://test.supabase.co/path']:
            with self.assertRaises(ValueError):
                API(url, 'test-only', 'test')

    def test_validation_never_approves(self):
        api = FakeAPI()
        result = cycle(api, lambda data: True)
        self.assertEqual(result['validated'], 1)
        self.assertFalse(any(name == 'listing_photo_moderate' for name, _ in api.calls))
        payload = next(body for name, body in api.calls if name == 'listing_photo_record_validation')
        self.assertTrue(payload['p_valid'])
        self.assertEqual(len(payload['p_sha256']), 64)

    def test_invalid_file_rejected_and_network_failure_retried(self):
        self.assertEqual(cycle(FakeAPI(), lambda data: False)['rejected'], 1)
        api = FakeAPI(fail_download=True)
        self.assertEqual(cycle(api)['errors'], 1)
        self.assertFalse(any(name == 'listing_photo_record_validation' for name, _ in api.calls))

    def test_failed_storage_delete_never_deletes_row(self):
        api = FakeAPI(fail_delete=True)
        self.assertEqual(cycle(api, lambda data: True)['errors'], 2)
        self.assertFalse(any(name == 'listing_photo_gc_finish' for name, _ in api.calls))

    def test_storage_delete_precedes_row_cleanup(self):
        api = FakeAPI()
        cycle(api, lambda data: True)
        names = [name for name, _ in api.calls]
        self.assertLess(names.index('remove'), names.index('listing_photo_gc_finish'))

    def test_real_webp_decoding_and_bad_bytes(self):
        output = io.BytesIO()
        Image.new('RGB', (16, 12), 'green').save(output, format='WEBP')
        self.assertTrue(validate_image(output.getvalue()))
        for data in [b'', b'<svg/>', b'RIFF0000WEBPgarbage', b'x' * (LIMIT + 1)]:
            self.assertFalse(validate_image(data))
        png = io.BytesIO()
        Image.new('RGB', (16, 12)).save(png, format='PNG')
        self.assertFalse(validate_image(png.getvalue()))

    def test_large_dimension_and_animated_images_rejected(self):
        output = io.BytesIO()
        Image.new('RGB', (1921, 1)).save(output, format='WEBP')
        self.assertFalse(validate_image(output.getvalue()))
        output = io.BytesIO()
        Image.new('RGB', (8, 8), 'red').save(output, format='WEBP', save_all=True,
            append_images=[Image.new('RGB', (8, 8), 'blue')], duration=100, loop=0)
        self.assertFalse(validate_image(output.getvalue()))

    def test_secret_key_is_not_a_bearer_token(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'{}'
        with patch('worker.urlopen', return_value=Response()) as opening:
            API('https://test.supabase.co', 'sb_secret_synthetic', 'test').rpc('example')
            headers = dict((k.lower(), v) for k, v in opening.call_args.args[0].header_items())
            self.assertEqual(headers['apikey'], 'sb_secret_synthetic')
            self.assertNotIn('authorization', headers)
        claims = base64.urlsafe_b64encode(json.dumps({'role':'service_role'}).encode()).decode().rstrip('=')
        self.assertTrue(API('https://test.supabase.co', 'a.'+claims+'.b', 'test').legacy)
        with self.assertRaises(ValueError): API('https://test.supabase.co', 'sb_publishable_test', 'test')

    def test_overlap_and_lost_lease_stop_processing(self):
        api = FakeAPI()
        api.rpc = lambda *args, **kwargs: False
        with self.assertRaises(RuntimeError): cycle(api)
        api = FakeAPI()
        original = api.rpc
        api.rpc = lambda name, body=None: False if name=='listing_photo_worker_lease' and body['p_action']=='renew' else original(name,body)
        with self.assertRaises(RuntimeError): cycle(api)
        self.assertFalse(any(name.endswith('_batch') for name, _ in api.calls))

    def test_failures_persist_backoff_and_do_not_mark_healthy(self):
        api = FakeAPI(fail_download=True, fail_delete=True)
        cycle(api)
        retries = [body for name, body in api.calls if name=='listing_photo_retry']
        self.assertEqual(len(retries),3)
        self.assertTrue(any(body['p_id'] is None for body in retries))
        self.assertEqual(api.calls[-1][1]['p_action'],'release')

    def test_activation_requires_matching_readback(self):
        api=FakeAPI()
        api.rpc=lambda *args: True
        api.request=lambda *args,**kwargs: []
        with self.assertRaises(RuntimeError): set_uploads(api, True)
        api.request=lambda *args,**kwargs: [{'uploads_enabled':True}]
        set_uploads(api, True)

    def test_mutations_not_replayed_and_reads_retry(self):
        from urllib.error import URLError
        api=API('https://test.supabase.co','sb_secret_synthetic','test')
        with patch('worker.urlopen',side_effect=URLError('offline')) as opening, patch('worker.time.sleep'):
            with self.assertRaises(RuntimeError): api.rpc('mutation')
            self.assertEqual(opening.call_count,1)
            with self.assertRaises(RuntimeError): api.download(PATH)
            self.assertEqual(opening.call_count,4)

    def test_cleanup_precedes_validation(self):
        api=FakeAPI()
        cycle(api,lambda data: True)
        names=[name for name,_ in api.calls]
        self.assertLess(names.index('listing_photo_gc_batch'),names.index('listing_photo_validation_batch'))

    def test_failure_does_not_stop_following_healthy_photo(self):
        api=FakeAPI()
        original=api.rpc
        def rpc(name, body=None):
            if name=='listing_photo_validation_batch':
                return [{'id':'bad','storage_path':PATH},{'id':'good','storage_path':PATH}]
            return original(name,body)
        api.rpc=rpc
        with patch.object(api,'download',side_effect=[RuntimeError('offline'),b'image']):
            counts=cycle(api,lambda data: True)
        self.assertEqual(counts['errors'],1)
        self.assertEqual(counts['validated'],1)

    def test_missing_object_is_terminal_not_an_endless_transport_retry(self):
        from worker import MissingPhoto
        api = FakeAPI()
        api.download = lambda path: (_ for _ in ()).throw(MissingPhoto())
        counts = cycle(api)
        self.assertEqual(counts['rejected'], 1)
        self.assertEqual(counts['errors'], 0)
        result = next(body for name, body in api.calls if name == 'listing_photo_record_validation')
        self.assertFalse(result['p_valid'])
        self.assertIsNone(result['p_sha256'])

    def test_only_download_404_is_classified_as_missing(self):
        from worker import MissingPhoto
        from urllib.error import HTTPError
        api = API('https://test.supabase.co', 'sb_secret_synthetic', 'test')
        with patch('worker.urlopen', side_effect=HTTPError('synthetic', 404, 'missing', {}, None)) as opening:
            with self.assertRaises(MissingPhoto):
                api.download(PATH)
            self.assertEqual(opening.call_count, 1)
            with self.assertRaises(RuntimeError) as raised:
                api.rpc('missing_rpc')
            self.assertNotIsInstance(raised.exception, MissingPhoto)

    def test_auth_error_is_not_retried(self):
        from urllib.error import HTTPError
        api=API('https://test.supabase.co','sb_secret_synthetic','test')
        with patch('worker.urlopen',side_effect=HTTPError('synthetic',403,'denied',{},None)) as opening:
            with self.assertRaises(RuntimeError): api.download(PATH)
            self.assertEqual(opening.call_count,1)


if __name__ == '__main__':
    unittest.main()
