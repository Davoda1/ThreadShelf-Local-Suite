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
def inline_script(value):
    code=local_file(value)
    if value.endswith('/math-config.js'):
        # The trusted components are embedded in the same following script.
        # Register assistive MathML before the combined component's asynchronous
        # startup, avoiding any URL fetch in the standalone HTML.
        original="load: ['a11y/assistive-mml']"
        if original not in code:
            raise ValueError('Unexpected MathJax component configuration')
        code=code.replace(original, 'load: []', 1)
    if value.endswith('/mathjax-tex-svg.js'):
        for name in ['mathjax-assistive-mml.js']:
            code+='\n'+(ROOT/'vendor'/name).read_text(encoding='utf-8')
        code+="\nMathJax.loader.preLoaded('a11y/assistive-mml');\n"
    return re.sub(r'</script', r'<\\/script', code, flags=re.I)

def build(output):
    html=(ROOT/'renderer/index.html').read_text(encoding='utf-8')
    html=re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>',lambda m:'<style>\n'+local_file(m[1]).replace('</style','<\\/style')+'\n</style>',html)
    html=re.sub(r'<script\s+src="([^"]+)"\s*></script>',lambda m:'<script>\n'+inline_script(m[1])+'\n</script>',html)
    html=html.replace("script-src 'self'", "script-src 'unsafe-inline'")
    if re.search(r'<script[^>]+src=|<link[^>]+rel="stylesheet"',html):
        raise ValueError('The demo still has external code or stylesheet dependencies')
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(html,encoding='utf-8')
    print(output)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'dist/ThreadShelf-Local-Alternative-1.3.1-Demo.html')
    build(parser.parse_args().output.resolve())
