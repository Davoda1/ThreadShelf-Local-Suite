#!/usr/bin/env python3
"""Rebuild the shared, data-only renderer from the included MIT source.

No network or JavaScript execution is required. The host supplies Marked;
Alternative retains its existing English math labels.
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
source = root / 'reader-source' / 'shared'
modules = [
    ('grok-renderer', 'Grok', ''),
    ('rich-chart-interactions', 'Interactions', ''),
    ('rich-charts', 'Charts', 'const {mountChartInteractions}=window.TSARich.Interactions;'),
    ('rich-parser', 'Parser', 'const marked=window.marked;const {grokAt,grokFenceAt}=window.TSARich.Grok;'),
    ('rich-context', 'Context', 'const {createGrokContextResolver}=window.TSARich.Grok;'),
    ('rich-renderer', 'Renderer', 'const {renderChart}=window.TSARich.Charts;const {renderGrokNode}=window.TSARich.Grok;const {safeRichUrl,markdownProtectedRanges,prepareRichMarkdown}=window.TSARich.Parser;'),
    ('math', 'Math', 'const tr=k=>k;'),
    ('mermaid-repair', 'Repair', ''),
]
parts = ['/* ThreadShelf shared renderer. Copyright (c) 2026 davoda1. MIT; see vendor/licenses/Reader-MIT.txt. */\nwindow.TSARich=Object.create(null);']
for filename, namespace, bindings in modules:
    text = (source / (filename + '.js')).read_text(encoding='utf-8')
    exports = re.findall(r'^export (?:async )?(?:function|const) (\w+)', text, re.M)
    text = re.sub(r'^import .*?;\n', '', text, flags=re.M)
    text = re.sub(r'^export (?=(?:async )?(?:function|const)\b)', '', text, flags=re.M)
    if re.search(r'^(?:import|export)\s', text, re.M):
        raise ValueError('Unsupported module syntax: ' + filename)
    parts.append('/* '+filename+'.js */\n(function(){\n\'use strict\';\n'+bindings+'\n'+text+'\nwindow.TSARich.'+namespace+'=Object.freeze({'+','.join(exports)+'});\n})();')
(root / 'reader-rich.js').write_text('\n\n'.join(parts)+'\n', encoding='utf-8')
# Kept separate from Alternative's established content styles. These exact shared
# styles are loaded afterward, allowing the same new cards in both applications.
css = '\n\n'.join((source / name).read_text(encoding='utf-8') for name in ('rich-layout.css','rich-charts.css','grok-renderer.css'))
(root.parent / 'renderer' / 'rich-compat.css').write_text(css, encoding='utf-8')
print('Rebuilt vendor/reader-rich.js and renderer/rich-compat.css')
