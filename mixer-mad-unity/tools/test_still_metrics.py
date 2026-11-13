"""Self-check for still_metrics.py (no pytest needed): python3 tools/test_still_metrics.py"""
import os, struct, sys, tempfile, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import still_metrics as sm  # noqa: E402


def _chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


def _filter_row(f, row, prev, bpp):
    out = bytearray(len(row))
    for i, v in enumerate(row):
        a = row[i - bpp] if i >= bpp else 0; b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
        pred = [0, a, b, (a + b) >> 1, sm._paeth(a, b, c)][f]
        out[i] = (v - pred) & 255
    return bytes([f]) + bytes(out)


def write_png(path, rows, ctype=2, filters=(0,)):
    w, h, bpp = len(rows[0]) // (3 if ctype == 2 else 4), len(rows), 3 if ctype == 2 else 4
    raw, prev = b'', bytes(len(rows[0]))
    for y, row in enumerate(rows):
        raw += _filter_row(filters[y % len(filters)], row, prev, bpp); prev = row
    data = b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ctype, 0, 0, 0))
    data += _chunk(b'IDAT', zlib.compress(raw)) + _chunk(b'IEND', b'')
    with open(path, 'wb') as fh: fh.write(data)


def image(w, h, fn):
    return [bytes(c for x in range(w) for c in fn(x, y)) for y in range(h)]


def test_decoder_handles_every_filter_and_alpha():
    rows = image(7, 5, lambda x, y: (x * 30 % 256, y * 50 % 256, (x * y * 13) % 256))
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'f.png'); write_png(p, rows, filters=(0, 1, 2, 3, 4))
        w, h, got = sm._decode_png(p)
        assert (w, h) == (7, 5) and [bytes(r) for r in got] == rows
        rgba = [bytes(c for i in range(0, len(r), 3) for c in (r[i], r[i + 1], r[i + 2], 99)) for r in rows]
        write_png(p, rgba, ctype=6, filters=(4, 3))
        assert [bytes(r) for r in sm._decode_png(p)[2]] == rows


def test_clip_share_counts_only_flat_white_in_the_band():
    # top half flat white, bottom half grey: band 0-0.5 is all clipped, band 0.5-1 none
    rows = image(10, 10, lambda x, y: (240, 240, 240) if y < 5 else (120, 130, 140))
    m = sm.measure([bytearray(r) for r in rows], 10, 10, (0.0, 0.5), 1)
    assert m['clip_white'] == 1.0 and m['clip_black'] == 0.0
    m = sm.measure([bytearray(r) for r in rows], 10, 10, (0.5, 1.0), 1)
    assert m['clip_white'] == 0.0 and m['lum_p99'] < 140
    tinted = image(10, 10, lambda x, y: (250, 240, 235))   # bright but tinted: spread 15, not flat white
    assert sm.measure([bytearray(r) for r in tinted], 10, 10, (0.0, 1.0), 1)['clip_white'] == 0.0


def test_contrast_ratio_and_pair_difference():
    rows = [bytearray(r) for r in image(10, 10, lambda x, y: (255, 255, 255) if x < 5 else (0, 0, 0))]
    assert abs(sm.contrast_ratio(rows, 10, 10, '0,0,0.5,1:0.5,0,1,1') - 21.0) < 1e-6
    same = sm.mean_abs_diff(rows, rows, 10, 1)
    assert same == (0.0, 0.0)
    other = [bytearray(r) for r in image(10, 10, lambda x, y: (0, 0, 0))]
    mad, share = sm.mean_abs_diff(rows, other, 10, 1)
    assert abs(mad - 127.5) < 1e-6 and share == 0.5


def test_pair_names_skip_the_baseline():
    assert sm.PAIR.match('fx_shadows_on.png').group('flag') == 'shadows'
    assert sm.PAIR.match('fx_weatherparticles_off.png').group('state') == 'off'
    assert sm.PAIR.match('fx__baseline_a.png') is None


def _rows(w, h, fn):
    return [bytearray(r) for r in image(w, h, fn)]


def test_noise_mask_marks_only_pixels_that_moved_in_the_baseline():
    grey = _rows(20, 20, lambda x, y: (100, 100, 100))
    flake = _rows(20, 20, lambda x, y: (200, 200, 200) if (x, y) == (3, 4) else (100, 100, 100))
    faint = _rows(20, 20, lambda x, y: (105, 105, 105))   # |d| = 15 per pixel: under the 24 threshold
    assert sum(sm.diff_mask(grey, grey, 20, 1)) == 0
    assert sum(sm.diff_mask(grey, faint, 20, 1)) == 0
    mask = sm.diff_mask(grey, flake, 20, 1)
    assert sum(mask) == 1 and mask[4 * 20 + 3] == 1


def test_local_change_is_measured_by_area_not_averaged_away():
    # a 10x10 patch changes by 90 per channel in a 100x100 frame: 1% of the area, mean diff 90 inside it
    off = _rows(100, 100, lambda x, y: (100, 100, 100))
    on = _rows(100, 100, lambda x, y: (190, 190, 190) if 40 <= x < 50 and 60 <= y < 70 else (100, 100, 100))
    area, inside, count = sm.pair_change(on, off, 100, 1, None)
    assert count == 100 and abs(area - 0.01) < 1e-9 and abs(inside - 90.0) < 1e-9
    assert sm.mean_abs_diff(on, off, 100, 1)[0] < 1.0     # the old whole-frame mean hides it


def test_pixels_that_move_in_the_baseline_do_not_count_as_change():
    off = _rows(10, 10, lambda x, y: (0, 0, 0))
    on = _rows(10, 10, lambda x, y: (255, 255, 255) if y == 0 else (0, 0, 0))     # whole top row differs
    noise = bytearray(100)
    for x in range(10): noise[x] = 1                                              # ...but it is noise (the sky)
    assert sm.pair_change(on, off, 10, 1, noise) == (0.0, 0.0, 0)
    for x in range(5): noise[x] = 0                                               # half of it is real
    area, inside, count = sm.pair_change(on, off, 10, 1, noise)
    assert count == 5 and abs(area - 0.05) < 1e-9 and inside == 255.0


def test_pair_verdict_needs_a_minimum_changed_area():
    assert sm.pair_verdict(0.0005, 0.0005, 0.0) == 'PASS'
    assert sm.pair_verdict(0.0004, 0.0005, 0.0) == 'NO-CHANGE'
    assert sm.pair_verdict(0.0, 0.0005, 0.0) == 'NO-CHANGE'
    # noise that moves somewhere else in the next shot is not caught by the mask: the area must clear it too
    assert sm.pair_verdict(0.0100, 0.0005, 0.0126) == 'NO-CHANGE'
    assert sm.pair_verdict(0.0140, 0.0005, 0.0126) == 'PASS'


def test_pairs_command_writes_area_and_old_columns(tmp=None):
    import csv
    flat = image(40, 40, lambda x, y: (90, 90, 90))
    sky = image(40, 40, lambda x, y: (200, 200, 200) if y < 1 else (90, 90, 90))    # noise: the top row moves
    lamp = image(40, 40, lambda x, y: (250, 220, 90) if 10 <= x < 20 and 20 <= y < 30 else (90, 90, 90))
    sky_only = sky
    with tempfile.TemporaryDirectory() as d:
        for name, rows in [('fx__baseline_a', flat), ('fx__baseline_b', sky), ('fx_headlights_on', lamp),
                           ('fx_headlights_off', flat), ('fx_bloom_on', sky_only), ('fx_bloom_off', flat)]:
            write_png(os.path.join(d, name + '.png'), rows)
        out = os.path.join(d, 'pairs.csv')
        failed = sm.run_pairs(sm.main_args([d, '--pairs', '--pairs-csv', out, '--step', '1']))
        got = {r['flag']: r for r in csv.DictReader(open(out))}
    assert failed == 1
    assert abs(float(got['bloom']['threshold']) - (0.0005 + 40 / 1600)) < 1e-4
    assert got['headlights']['verdict'] == 'PASS' and abs(float(got['headlights']['changed_area']) - 100 / 1600) < 1e-4
    assert got['bloom']['verdict'] == 'NO-CHANGE' and float(got['bloom']['changed_area']) == 0.0
    for col in ('mean_abs_diff', 'changed_share', 'noise_floor', 'mean_diff_changed', 'noise_area', 'threshold'):
        assert col in got['bloom'], col


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for t in tests: t(); print('ok', t.__name__)
    print('%d passed' % len(tests))
