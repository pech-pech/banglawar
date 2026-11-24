#!/usr/bin/env python3
"""PWA update contract check (pgs-update-1, section 7).
Usage: python3 tools/check_pwa.py <pages_dir>
One line per problem, then "OK n games" or "FAIL n problems". Exit 1 on failure."""
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stamp_build  # noqa: E402

SKIP_DIRS = {'test', 'tests', 'qa', 'tools', 'docs', 'mocks', 'node_modules'}
PH = stamp_build.PLACEHOLDER


def read(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        return f.read()


def check_game(pages, game):
    probs = []
    gdir = os.path.join(pages, game)
    sw = os.path.join(gdir, 'sw.js')
    if not os.path.isfile(sw):
        probs.append('%s: sw.js missing' % game)
    else:
        t = read(sw)
        if "const BUILD = '%s';" % PH not in t:
            probs.append("%s: sw.js lacks const BUILD = '%s';" % (game, PH))
        if "importScripts('../_shared/sw-core.js?b=' + BUILD);" not in t:
            probs.append('%s: sw.js lacks importScripts of ../_shared/sw-core.js?b=' % game)
        if 'pgsServiceWorker({' not in t:
            probs.append('%s: sw.js lacks pgsServiceWorker({' % game)
        elif not re.search(r'''game\s*:\s*(['"])%s\1''' % re.escape(game), t):
            probs.append("%s: sw.js game: must equal folder name '%s'" % (game, game))
        for bad in ("addEventListener('fetch'", 'addEventListener("fetch"', 'caches.'):
            if bad in t:
                probs.append('%s: sw.js must not contain %s' % (game, bad))
    idx = os.path.join(gdir, 'index.html')
    if not os.path.isfile(idx):
        probs.append('%s: index.html missing' % game)
    else:
        t = read(idx)
        if '<meta name="pgs-build" content="%s">' % PH not in t:
            probs.append('%s: index.html lacks pgs-build meta' % game)
        if '../_shared/update.js' not in t:
            probs.append('%s: index.html lacks ../_shared/update.js' % game)
    for dp, dns, fns in os.walk(gdir):
        dns[:] = sorted(d for d in dns if d not in SKIP_DIRS)
        for fn in sorted(fns):
            if fn.endswith(('.html', '.js')) and 'serviceWorker.register(' in read(os.path.join(dp, fn)):
                rel = os.path.relpath(os.path.join(dp, fn), pages).replace(os.sep, '/')
                probs.append('%s: serviceWorker.register( found (remove it)' % rel)
    return probs


def check_shared(pages):
    probs = []
    node = shutil.which('node')
    if not node:
        print('WARN node not found, skipping node --check')
    for fn in ('sw-core.js', 'update.js'):
        p = os.path.join(pages, '_shared', fn)
        if not os.path.isfile(p):
            probs.append('_shared/%s missing' % fn)
        elif node:
            r = subprocess.run([node, '--check', p], capture_output=True, text=True)
            if r.returncode != 0:
                probs.append('_shared/%s node --check failed: %s' % (fn, (r.stderr.strip().splitlines() or ['?'])[0]))
    return probs


def check_stamp(pages, games):
    probs = []
    tmp = tempfile.mkdtemp(prefix='pwacheck-')
    try:
        dst = os.path.join(tmp, 'pages')
        shutil.copytree(pages, dst)
        for g in games:
            build = stamp_build.compute_build(dst, g)
            for p in stamp_build.stamp_game(dst, g, build):
                probs.append('stamp: ' + p)
        for g in games:
            if not os.path.isfile(os.path.join(dst, g, 'version.json')):
                probs.append('stamp: %s/version.json not written' % g)
            for fn in ('sw.js', 'index.html'):
                p = os.path.join(dst, g, fn)
                if os.path.isfile(p) and PH in read(p):
                    msg = 'stamp: %s/%s placeholder left after stamping' % (g, fn)
                    if msg not in probs and ('stamp: %s/%s: placeholder survived' % (g, fn)) not in probs:
                        probs.append(msg)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return probs


def main(argv):
    if len(argv) != 2:
        print('usage: check_pwa.py <pages_dir>', file=sys.stderr)
        return 2
    pages = argv[1]
    games = stamp_build.game_list(pages)
    probs = []
    for g in games:
        probs += check_game(pages, g)
    probs += check_shared(pages)
    probs += check_stamp(pages, games)
    for p in probs:
        print(p)
    if probs:
        print('FAIL %d problems' % len(probs))
        return 1
    print('OK %d games' % len(games))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
