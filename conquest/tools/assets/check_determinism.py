"""Run pack_atlas.py twice into scratch folders and compare the SHA-256 of every output file.

    python3 check_determinism.py --manifest M.json --root pilot=DIR [--variant snapped] [--keep]

Exit 0 when both runs wrote the same files with the same hashes, 1 otherwise. The two runs are separate
processes, so interpreter state cannot hide a difference.
"""
import argparse
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cli  # noqa: E402


def hashes(folder):
    return {n: cli.sha256_file(os.path.join(folder, n)) for n in sorted(os.listdir(folder))}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--root", action="append", default=[])
    parser.add_argument("--variant", default="snapped")
    parser.add_argument("--packer", default="shelf")
    parser.add_argument("--page-grain", default="pow2")
    parser.add_argument("--keep", action="store_true", help="keep the scratch folders")
    args = parser.parse_args(cli.script_args(argv))
    with tempfile.TemporaryDirectory() as scratch:
        results = []
        for run in ("a", "b"):
            out = os.path.join(scratch, run)
            cmd = [sys.executable, os.path.join(HERE, "pack_atlas.py"), "--manifest", args.manifest,
                   "--out-dir", out, "--variant", args.variant,
                   "--packer", args.packer, "--page-grain", args.page_grain]
            for root in args.root:
                cmd += ["--root", root]
            done = subprocess.run(cmd, capture_output=True, text=True)
            if done.returncode != 0:
                print("run %s failed (%d):\n%s%s" % (run, done.returncode, done.stdout, done.stderr), file=sys.stderr)
                return 1
            results.append(hashes(out))
        if results[0] != results[1]:
            for name in sorted(set(results[0]) | set(results[1])):
                if results[0].get(name) != results[1].get(name):
                    print("DIFFERENT: %s" % name, file=sys.stderr)
            return 1
        print("deterministic: %d files identical across two runs" % len(results[0]))
        for name, digest in results[0].items():
            print("  %s  %s" % (digest, name))
    return 0


if __name__ == "__main__":
    sys.exit(main())
