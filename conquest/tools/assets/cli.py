"""Small shared helpers so every script runs the same way under Blender's Python or a plain interpreter.

Blender:  Blender -b --factory-startup -noaudio --python-exit-code 3 -P script.py -- <args>
Plain:    <Blender.app>/Contents/Resources/<ver>/python/bin/python3.13 script.py <args>
"""
import hashlib
import json
import os
import sys


def script_args(argv=None):
    """Arguments for the script: everything after '--' when present (Blender), else argv[1:]."""
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        return argv[argv.index("--") + 1:]
    return argv[1:]


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def dump_json(obj):
    """Canonical text: sorted keys, 1-space indent, trailing newline, ASCII only."""
    return json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=True) + "\n"


def write_text(path, text):
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def parse_roots(items):
    """['pilot=/abs/path', ...] -> {'pilot': '/abs/path'}"""
    roots = {}
    for item in items or []:
        if "=" not in item:
            raise SystemExit("--root expects name=path, got %r" % item)
        name, path = item.split("=", 1)
        roots[name] = os.path.abspath(path)
    return roots
