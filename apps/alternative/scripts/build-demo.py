#!/usr/bin/env python3
"""Create one offline HTML file from the exact application renderer."""
from pathlib import Path
import argparse
import re
ROOT=Path(__file__).resolve().parent.parent
def local_file(value):
    path=(ROOT/'renderer'/value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Asset leaves application root')
    return path.read_text(encoding='utf-8')
def build(output):
    html=(ROOT/'renderer/index.html').read_text(encoding='utf-8')
    html=re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>',lambda m:'<style>\n'+local_file(m[1]).replace('</style','<\\/style')+'\n</style>',html)
    html=re.sub(r'<script\s+src="([^"]+)"\s*></script>',lambda m:'<script>\n'+re.sub(r'</script',r'<\\/script',local_file(m[1]),flags=re.I)+'\n</script>',html)
    html=html.replace("script-src 'self'", "script-src 'unsafe-inline'")
    if re.search(r'<script[^>]+src=|<link[^>]+rel="stylesheet"',html):
        raise ValueError('The demo still has external code or stylesheet dependencies')
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(html,encoding='utf-8')
    print(output)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'dist/ThreadShelf-Local-Alternative-1.0.0-Demo.html')
    build(parser.parse_args().output.resolve())
