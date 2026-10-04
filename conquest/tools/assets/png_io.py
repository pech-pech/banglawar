"""PNG reading (OpenImageIO, bundled with Blender) and a deterministic PNG writer (zlib only).

The writer emits only IHDR, IDAT and IEND, picks a filter per row by a fixed rule and compresses with a fixed
zlib level, so the same pixels always give the same bytes on the same zlib build. Reading goes through
OpenImageIO because the standard library has no PNG decoder; the header reader needs nothing.
"""
import struct
import zlib

import numpy as np

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
ZLIB_LEVEL = 9


def read_png_size(path):
    """(width, height) from the IHDR chunk, no pixel decoding."""
    with open(path, "rb") as handle:
        head = handle.read(24)
    if len(head) < 24 or head[:8] != PNG_SIGNATURE or head[12:16] != b"IHDR":
        raise ValueError("%s is not a PNG file" % path)
    return struct.unpack(">II", head[16:24])


def read_rgba(path):
    """Return an (h, w, 4) uint8 array, straight alpha. Fully transparent pixels get colour (0, 0, 0)."""
    import OpenImageIO as oiio
    handle = oiio.ImageInput.open(path)
    if handle is None:
        raise ValueError("cannot open %s: %s" % (path, oiio.geterror()))
    try:
        spec = handle.spec()
        pixels = handle.read_image("uint8")
    finally:
        handle.close()
    if pixels is None:
        raise ValueError("cannot read %s" % path)
    pixels = np.asarray(pixels, dtype=np.uint8).reshape(spec.height, spec.width, spec.nchannels)
    channels = spec.nchannels
    if channels == 4:
        rgba = pixels
    elif channels == 3:
        rgba = np.concatenate([pixels, np.full(pixels.shape[:2] + (1,), 255, np.uint8)], axis=2)
    elif channels == 2:
        rgba = np.concatenate([np.repeat(pixels[..., :1], 3, axis=2), pixels[..., 1:2]], axis=2)
    elif channels == 1:
        rgba = np.concatenate([np.repeat(pixels, 3, axis=2), np.full(pixels.shape[:2] + (1,), 255, np.uint8)], axis=2)
    else:
        raise ValueError("%s has %d channels" % (path, channels))
    rgba = np.ascontiguousarray(rgba)
    rgba[rgba[..., 3] == 0] = 0
    return rgba


def _chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def _filtered_rows(rgba):
    """Scanlines with a per-row filter (none, sub or up) chosen by the smallest sum of absolute values."""
    height, width, _ = rgba.shape
    raw = rgba.reshape(height, width * 4)
    sub = raw.copy()
    sub[:, 4:] = raw[:, 4:] - raw[:, :-4]
    up = raw.copy()
    up[1:] = raw[1:] - raw[:-1]
    candidates = (raw, sub, up)
    costs = np.stack([np.minimum(c, 256 - c.astype(np.int16)).astype(np.int64).sum(axis=1) for c in candidates])
    choice = costs.argmin(axis=0)
    out = np.empty((height, 1 + width * 4), dtype=np.uint8)
    out[:, 0] = choice
    for index, candidate in enumerate(candidates):
        rows = choice == index
        out[rows, 1:] = candidate[rows]
    return out


def png_bytes(rgba):
    rgba = np.ascontiguousarray(rgba, dtype=np.uint8)
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        raise ValueError("expected an (h, w, 4) array")
    height, width, _ = rgba.shape
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = zlib.compress(_filtered_rows(rgba).tobytes(), ZLIB_LEVEL)
    return PNG_SIGNATURE + _chunk(b"IHDR", header) + _chunk(b"IDAT", data) + _chunk(b"IEND", b"")


def write_png_rgba(path, rgba):
    with open(path, "wb") as handle:
        handle.write(png_bytes(rgba))
