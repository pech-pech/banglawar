#!/usr/bin/env python3
"""Deploy-time build stamp (pgs-update-1, contract section 1).

Usage: python3 tools/stamp_build.py <pages_dir> [--salt S] [--only g1,g2] [--dry-run]
Prints "<game> <build>" per game. Exit 1 if a placeholder survives in a stamped sw.js/index.html.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys

PLACEHOLDER = '__PGS_BUILD__'
SKIP_FILES = {'.DS_Store'}
SKIP_DIRS = {'__pycache__', '.git', 'node_modules'}


def game_list(pages_dir):
    """Direct subfolders of pages_dir that have manifest.webmanifest (not _shared), sorted."""
    out = []
    for name in sorted(os.listdir(pages_dir)):
        if name == '_shared' or name.startswith('.'):
            continue
        if os.path.isfile(os.path.join(pages_dir, name, 'manifest.webmanifest')):
            out.append(name)
    return out


def _walk(root):
    """Sorted posix relpaths of every file under root."""
    rels = []
    for dp, dns, fns in os.walk(root):
        dns[:] = sorted(d for d in dns if d not in SKIP_DIRS)
        for fn in fns:
            if fn in SKIP_FILES:
                continue
            rels.append(os.path.relpath(os.path.join(dp, fn), root).replace(os.sep, '/'))
    return sorted(rels)


def compute_build(pages_dir, game, salt=''):
    """sha256 of sorted (relpath, bytes) of game files (minus version.json) then _shared files, first 10 hex."""
    h = hashlib.sha256()
    if salt:
        h.update(('salt:' + salt + '\0').encode('utf-8'))
    parts = []
    groot = os.path.join(pages_dir, game)
    for rel in _walk(groot):
        if rel == 'version.json':
            continue
        parts.append((game + '/' + rel, os.path.join(groot, rel)))
    sroot = os.path.join(pages_dir, '_shared')
    if os.path.isdir(sroot):
        for rel in _walk(sroot):
            parts.append(('_shared/' + rel, os.path.join(sroot, rel)))
    for key, path in parts:
        with open(path, 'rb') as f:
            data = f.read()
        h.update(key.encode('utf-8') + b'\0' + str(len(data)).encode() + b'\0' + data)
    return h.hexdigest()[:10]


_TOKEN = re.compile(
    r'<!--.*?-->'
    r'|(?P<script><script\b[^>]*>)(?P<sbody>.*?)(?P<sclose></script\s*>)'
    r'|(?P<style><style\b[^>]*>)(?P<ybody>.*?)(?P<yclose></style\s*>)'
    r'|(?P<tag><[A-Za-z][^>]*>)',
    re.S | re.I)
_ATTR = re.compile(r'''(\b(?:src|href)\s*=\s*)(["'])([^"']*)\2''', re.I)


def _version_tag(tag, build):
    def fix(m):
        val = m.group(3)
        low = val.lower()
        if (not val or '?' in val or low.startswith(('http', '//', 'data:', '#'))
                or not low.endswith(('.js', '.css', '.webmanifest'))):
            return m.group(0)
        return m.group(1) + m.group(2) + val + '?v=' + build + m.group(2)
    return _ATTR.sub(fix, tag)


def add_versions(html, build):
    """Append ?v=build to relative src/href of .js/.css/.webmanifest in tags only (never script bodies)."""
    def repl(m):
        if m.group('script'):
            return _version_tag(m.group('script'), build) + m.group('sbody') + m.group('sclose')
        if m.group('style'):
            return _version_tag(m.group('style'), build) + m.group('ybody') + m.group('yclose')
        if m.group('tag'):
            return _version_tag(m.group('tag'), build)
        return m.group(0)
    return _TOKEN.sub(repl, html)


def stamp_game(pages_dir, game, build, dry_run=False, now=None):
    """Stamp one game. Returns a list of problem strings (placeholder survived, missing files)."""
    problems = []
    gdir = os.path.join(pages_dir, game)
    for fn in ('sw.js', 'index.html'):
        path = os.path.join(gdir, fn)
        if not os.path.isfile(path):
            problems.append('%s/%s: missing' % (game, fn))
            continue
        with open(path, 'r', encoding='utf-8', newline='') as f:
            text = f.read()
        new = text.replace(PLACEHOLDER, build)
        if fn == 'index.html':
            new = add_versions(new, build)
        if PLACEHOLDER in new:
            problems.append('%s/%s: placeholder survived' % (game, fn))
        if not dry_run and new != text:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(new)
    if not dry_run:
        stamp = (now or datetime.datetime.now(datetime.timezone.utc)).strftime('%Y-%m-%dT%H:%M:%SZ')
        with open(os.path.join(gdir, 'version.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'game': game, 'build': build, 'stamped_at': stamp}, f)
            f.write('\n')
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('pages_dir')
    ap.add_argument('--salt', default='')
    ap.add_argument('--only', default='')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args(argv)
    games = game_list(a.pages_dir)
    if a.only:
        want = [g for g in a.only.split(',') if g]
        unknown = [g for g in want if g not in games]
        if unknown:
            print('unknown game(s): ' + ','.join(unknown), file=sys.stderr)
            return 1
        games = [g for g in games if g in want]
    # compute every build first so stamping one game never affects another's hash
    builds = {g: compute_build(a.pages_dir, g, a.salt) for g in games}
    bad = []
    for g in games:
        bad += stamp_game(a.pages_dir, g, builds[g], a.dry_run)
        print(g, builds[g])
    for p in bad:
        print('ERROR ' + p, file=sys.stderr)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
