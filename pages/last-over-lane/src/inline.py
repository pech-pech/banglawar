"""Inline <script src="parts/x.js"></script> tags so the game is one file.
Usage: python3 src/inline.py src/game.html /tmp/out.html"""
import re, sys, os
src, out = sys.argv[1], sys.argv[2]
base = os.path.dirname(os.path.abspath(src))
s = open(src, encoding='utf-8').read()
def rep(mo):
    js = open(os.path.join(base, mo.group(1)), encoding='utf-8').read()
    assert '</script' not in js.lower()
    return '<script>\n' + js + '\n</script>'
s = re.sub(r'<script src="(parts/[\w-]+\.js)"></script>', rep, s)
assert 'src="parts/' not in s
open(out, 'w', encoding='utf-8').write(s)
print('inlined ->', out)
