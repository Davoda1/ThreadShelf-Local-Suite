#!/usr/bin/env python3
"""Rebuild the Reader repair adapter inside reader-rich.js without dependencies."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
marker = '/* Local Reader deterministic Mermaid repairs, MIT. No archived source is changed. */'
source = (root / 'reader-source/mermaid-repair.js').read_text(encoding='utf-8')
bundle = root / 'reader-rich.js'
base = bundle.read_text(encoding='utf-8').split(marker, 1)[0].rstrip()
adapter = source.replace('export function ', 'function ')
bundle.write_text(base + '\n\n' + marker + "\n(function(){\n'use strict';\n" + adapter.rstrip() + '\n\nwindow.TSARich.Repair=Object.freeze({buildMermaidRepairCandidates,buildMermaidRepairCandidate});\n})();\n', encoding='utf-8')
