"""MaxRects (best short side fit) packer used by pack_atlas.py --packer maxrects.

Pure Python, no randomness: free rectangles are kept in a list in a fixed order, ties are broken by position,
so the same items give the same placements on every run. Padding is handled here: an item of (w, h) is
placed with at least `pad` pixels to its neighbours and to the page edge.
"""


def _split(free, used):
    """Remove the used rectangle from every free rectangle that overlaps it, keeping the remaining slices."""
    ux, uy, uw, uh = used
    out = []
    for fx, fy, fw, fh in free:
        if ux >= fx + fw or ux + uw <= fx or uy >= fy + fh or uy + uh <= fy:
            out.append((fx, fy, fw, fh))
            continue
        if ux > fx:
            out.append((fx, fy, ux - fx, fh))
        if ux + uw < fx + fw:
            out.append((ux + uw, fy, fx + fw - ux - uw, fh))
        if uy > fy:
            out.append((fx, fy, fw, uy - fy))
        if uy + uh < fy + fh:
            out.append((fx, uy + uh, fw, fy + fh - uy - uh))
    return out


def _prune(free):
    """Drop free rectangles contained in another one (kept sorted so the result is order independent)."""
    free = sorted(set(free))
    keep = []
    for i, a in enumerate(free):
        contained = False
        for j, b in enumerate(free):
            if i != j and b[0] <= a[0] and b[1] <= a[1] and b[0] + b[2] >= a[0] + a[2] and b[1] + b[3] >= a[1] + a[3]:
                contained = True
                break
        if not contained:
            keep.append(a)
    return keep


class Bin:
    def __init__(self, width, height, pad):
        self.width, self.height, self.pad = width, height, pad
        # items are inflated by pad; the usable area loses one pad so the page edge keeps its margin
        self.free = [(0, 0, max(width - pad, 0), max(height - pad, 0))]

    def place(self, w, h):
        """Return the (x, y) of the item's top-left pixel, or None when it does not fit."""
        iw, ih = w + self.pad, h + self.pad
        best = None
        for fx, fy, fw, fh in self.free:
            if iw <= fw and ih <= fh:
                score = (min(fw - iw, fh - ih), max(fw - iw, fh - ih), fy, fx)
                if best is None or score < best[0]:
                    best = (score, fx, fy)
        if best is None:
            return None
        _score, x, y = best
        self.free = _prune(_split(self.free, (x, y, iw, ih)))
        return (x + self.pad, y + self.pad)


def pack_into(items, width, height, pad):
    """items: [(w, h, ref)] in the order to place. Returns [(ref, x, y)] or None if any item does not fit."""
    page = Bin(width, height, pad)
    placements = []
    for w, h, ref in items:
        spot = page.place(w, h)
        if spot is None:
            return None
        placements.append((ref, spot[0], spot[1]))
    return placements
