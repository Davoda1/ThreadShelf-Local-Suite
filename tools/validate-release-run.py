#!/usr/bin/env python3
"""Check the provenance of a completed native build before publication recovery."""
import argparse
import json
import re
from pathlib import Path


def validate(run, jobs, tag, commit, repository):
    if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', tag):
        raise ValueError('An exact stable release tag is required.')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('The full tagged commit is required.')
    expected = {'path': '.github/workflows/build.yml', 'event': 'push',
                'head_branch': tag, 'head_sha': commit, 'status': 'completed'}
    if any(run.get(key) != value for key, value in expected.items()):
        raise ValueError('Source run must be the completed package workflow for the exact tag and commit.')
    if run.get('head_repository', {}).get('full_name') != repository:
        raise ValueError('Source run belongs to another repository.')
    if jobs.get('total_count') != len(jobs.get('jobs', [])):
        raise ValueError('Incomplete source job list.')
    expected_jobs = {f'packages ({app}, {os})' for app in ('reader', 'analytics', 'alternative')
                     for os in ('ubuntu-24.04', 'windows-2022')}
    packages = [job for job in jobs['jobs'] if job.get('name', '').startswith('packages (')]
    if len(packages) != 6 or {job['name'] for job in packages} != expected_jobs:
        raise ValueError('Exactly six expected native package jobs are required.')
    if any(job.get('status') != 'completed' or job.get('conclusion') != 'success' for job in packages):
        raise ValueError('All six native package jobs must have passed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True, type=Path)
    parser.add_argument('--jobs', required=True, type=Path)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--repository', required=True)
    args = parser.parse_args()
    validate(json.loads(args.run.read_text()), json.loads(args.jobs.read_text()),
             args.tag, args.commit, args.repository)
    print('Original tag, commit, repository and all six successful package jobs verified.')
