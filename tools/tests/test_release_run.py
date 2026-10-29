"""Bounded recovery-provenance regressions; no network or application builds."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('release_run', Path(__file__).resolve().parents[1] / 'validate-release-run.py')
release_run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_run)


class ReleaseRunTests(unittest.TestCase):
    def setUp(self):
        self.commit = 'b' * 40
        self.run = {'path': '.github/workflows/build.yml', 'event': 'push',
                    'head_branch': 'v1.3.1', 'head_sha': self.commit,
                    'status': 'completed', 'conclusion': 'failure',
                    'head_repository': {'full_name': 'example/suite'}}
        self.jobs = {'total_count': 7, 'jobs': [
            {'name': f'packages ({app}, {os})', 'status': 'completed', 'conclusion': 'success'}
            for app in ('reader', 'analytics', 'alternative') for os in ('ubuntu-24.04', 'windows-2022')
        ] + [{'name': 'Publish validated tagged release', 'status': 'completed', 'conclusion': 'failure'}]}

    def check(self):
        release_run.validate(self.run, self.jobs, 'v1.3.1', self.commit, 'example/suite')

    def test_failed_publisher_with_successful_packages_is_recoverable(self):
        self.check()

    def test_rejects_unrelated_source_run(self):
        for key, value in [('head_sha', 'c' * 40), ('event', 'pull_request'),
                           ('path', '.github/workflows/checks.yml'), ('status', 'in_progress')]:
            with self.subTest(key=key):
                old = self.run[key]; self.run[key] = value
                with self.assertRaises(ValueError): self.check()
                self.run[key] = old
        self.run['head_repository']['full_name'] = 'another/suite'
        with self.assertRaises(ValueError): self.check()

    def test_rejects_failed_or_duplicate_package_jobs(self):
        self.jobs['jobs'][0]['conclusion'] = 'failure'
        with self.assertRaises(ValueError): self.check()
        self.jobs['jobs'][0]['conclusion'] = 'success'
        self.jobs['jobs'][0]['name'] = self.jobs['jobs'][1]['name']
        with self.assertRaises(ValueError): self.check()

    def test_rejects_truncated_job_list(self):
        self.jobs['total_count'] = 8
        with self.assertRaises(ValueError): self.check()


if __name__ == '__main__':
    unittest.main()
