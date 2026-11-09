#!/usr/bin/env python3
"""Rebuild the complete shared renderer, including deterministic Mermaid repairs."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('build-rich.py')), run_name='__main__')
