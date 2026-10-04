"""Content audit hook for the manifest build and the packer.

Theme pack section 8.3 forbids pictures of people, faces, weapons, flags, insignia, lettering, and the cross
and crescent. The Blender pilot enforces this on scenes (blender/pilot_audit.py, needs bpy). This module is the
same rule applied to what the pipeline can see without Blender:

  audit_names(strings)      every key, role, state, tag, event name and file stem is split on non-letters and
                            camelCase; a token that STARTS WITH a forbidden word is a finding
                            ("surface" passes, "crossbar" and "flagship" do not).
  audit_manifest(manifest)  audit_names over a whole manifest, plus the extra-audit hook below.
  audit_pixels(rgba, name)  opaque pixels close to the render key colour (#00FF00) mean a keyed background
                            leaked into a sprite.
  load_extra(path)          optional plug-in: a Python file defining audit_manifest(manifest) -> list[str]
                            (for example a wrapper that calls the pilot's own audit under Blender).

Findings are strings. An empty list means clean. Callers decide whether findings are fatal.
"""
import importlib.util
import os
import re

import numpy as np

# The pilot's list (face person flag cross crescent text gun blade) plus the rest of the written rules.
FORBIDDEN_WORDS = ("face", "person", "people", "flag", "cross", "crescent", "text", "gun", "blade",
                   "weapon", "insignia", "letter", "limb", "sword", "rifle", "cannon", "emblem")
PILOT_WORDS = ("face", "person", "flag", "cross", "crescent", "text", "gun", "blade")
KEY_COLOUR = (0, 255, 0)
KEY_MIN_DELTA_E = 30.0


def tokens(name):
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    return [t.lower() for t in re.split(r"[^A-Za-z]+", name) if t]


def audit_names(strings, label="name"):
    findings = []
    for text in strings:
        for word in FORBIDDEN_WORDS:
            if any(token.startswith(word) for token in tokens(text)):
                findings.append("%s '%s' contains forbidden word '%s'" % (label, text, word))
    return findings


def manifest_strings(manifest):
    out = []
    for entry in manifest["entries"]:
        out.append(("key", entry["key"]))
        for field in ("role", "state", "dir", "slot"):
            if entry.get(field):
                out.append((field, entry[field]))
        for tag in entry.get("tags", []):
            out.append(("tag", tag))
        for event in entry.get("events", []):
            out.append(("event", event["name"]))
        out.append(("file", os.path.splitext(os.path.basename(entry["source"]["path"]))[0]))
    return out


def audit_manifest(manifest, extra=None):
    findings = []
    seen = set()
    for label, text in manifest_strings(manifest):
        if (label, text) in seen:
            continue
        seen.add((label, text))
        findings += audit_names([text], label)
    if extra is not None:
        findings += list(extra(manifest))
    return sorted(set(findings))


def _srgb_to_lab(rgb):
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    matrix = np.array([[0.4124564, 0.3575761, 0.1804375],
                       [0.2126729, 0.7151522, 0.0721750],
                       [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ matrix.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def audit_pixels(rgba, name, key=KEY_COLOUR, min_delta_e=KEY_MIN_DELTA_E):
    opaque = rgba[rgba[..., 3] > 0][:, :3]
    if opaque.size == 0:
        return []
    packed = np.unique((opaque[:, 0].astype(np.uint32) << 16) | (opaque[:, 1].astype(np.uint32) << 8)
                       | opaque[:, 2].astype(np.uint32))
    colours = np.stack([(packed >> 16) & 255, (packed >> 8) & 255, packed & 255], axis=1).astype(np.uint8)
    distance = np.linalg.norm(_srgb_to_lab(colours) - _srgb_to_lab(np.array(key, dtype=np.uint8)), axis=1)
    findings = []
    for colour, delta in zip(colours, distance):
        if delta < min_delta_e:
            findings.append("%s: pixel colour #%02x%02x%02x is only delta-E %.1f from the key colour"
                            % (name, colour[0], colour[1], colour[2], delta))
    return findings


def load_extra(path):
    """Import a plug-in file; it must define audit_manifest(manifest) -> iterable of strings."""
    spec = importlib.util.spec_from_file_location("extra_audit_plugin", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "audit_manifest"):
        raise SystemExit("extra audit %s defines no audit_manifest(manifest)" % path)
    return module.audit_manifest
