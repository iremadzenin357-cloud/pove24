import unittest
from pathlib import Path
from unittest.mock import patch
from worker import NoRedirect, cycle
from test_worker import FakeAPI

HERE = Path(__file__).parent

class DeploymentTests(unittest.TestCase):
    def test_redirects_cannot_receive_server_headers(self):
        with self.assertRaises(RuntimeError):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test')

    def test_lease_loss_aborts_without_success(self):
        api = FakeAPI()
        original = api.rpc
        def rpc(name, body=None):
            result = original(name, body)
            if name == 'listing_photo_worker_lease' and body['p_action'] == 'renew':
                return False
            return result
        api.rpc = rpc
        with self.assertRaises(RuntimeError):
            cycle(api)
        actions = [b['p_action'] for n,b in api.calls if n == 'listing_photo_worker_lease']
        self.assertNotIn('success', actions)
        self.assertIsNone(api.worker_token)

    def test_background_renewal_thread_stops_on_completion(self):
        import threading
        before = set(threading.enumerate())
        cycle(FakeAPI(), lambda _: True)
        self.assertEqual(set(threading.enumerate()), before)

    def test_container_cycle_only_and_no_secrets_in_image(self):
        runner=(HERE/'runner.py').read_text()
        self.assertNotIn('set_uploads', runner)
        self.assertNotIn('enable-uploads', runner)
        docker=(HERE/'Dockerfile').read_text()
        self.assertIn('USER 65532:65532',docker)
        self.assertNotIn('COPY . ',docker)
        self.assertNotIn('ARG ',docker)
        self.assertTrue((HERE/'Dockerfile.dockerignore').read_text().startswith('**'))
        self.assertIn('COPY photo-operations/requirements.txt',docker)
        self.assertIn('COPY photo-operations/worker.py photo-operations/runner.py',docker)

    def test_railway_runtime_secret_does_not_require_file(self):
        import runner
        class Stop:
            def is_set(self): return True
        with patch.dict(runner.os.environ, {'POVE_SECRET_KEY':'synthetic-secret'}), \
             patch.object(runner.Path,'read_text',side_effect=AssertionError('must not read file')), \
             patch.object(runner,'API') as api, patch.object(runner.signal,'signal'), \
             patch.object(runner.threading,'Event',return_value=Stop()):
            runner.main()
        self.assertEqual(api.call_args.args[1],'synthetic-secret')

    def test_runner_redacts_failure_and_stops(self):
        import runner
        class Stop:
            stopped=False
            def set(self): self.stopped=True
            def is_set(self): return self.stopped
            def wait(self, delay): self.stopped=True
        with patch.dict(runner.os.environ, {}, clear=True), \
             patch.object(runner.Path,'read_text',return_value='synthetic-secret'), \
             patch.object(runner,'API'), patch.object(runner.signal,'signal'), \
             patch.object(runner.threading,'Event',return_value=Stop()), \
             patch.object(runner,'cycle',side_effect=RuntimeError('synthetic-secret')), \
             patch('builtins.print') as log:
            runner.main()
        self.assertNotIn('synthetic-secret',str(log.call_args_list))
        self.assertIn('cycle_failed',str(log.call_args_list))

if __name__=='__main__':unittest.main()
