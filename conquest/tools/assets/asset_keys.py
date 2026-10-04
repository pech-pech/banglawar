"""Asset key grammar and fallback chain (pure Python, no dependencies).

Key grammar (visual pipeline spec 14, section 9.1, TA 6.1):

    <kind>.<role>[.L<level>][.v<variant>][.<state>][@<slot>]

Examples: tile.meadow  bld.core.L1  u.scout@f1.selected  u.shock.L1.walk@f1  fx.core_smoke

Role ids may themselves contain dots (tile.t.open), so a key is never parsed back into parts:
manifest entries and lookup requests carry the parts as separate fields. The C# twin of this file is
Conquest.Assets.AssetKey; tests/golden/keys.golden.json pins both.

Fallback chain: every subset of the present optional parts (variant, state, level, slot) can be dropped.
Subsets are tried in order of loss, where dropping a part costs VARIANT 1, STATE 2, LEVEL 4, SLOT 8. So the
art for the wanted side (slot) is kept in preference to the wanted animation state, which is kept in
preference to the wanted level. (The spec left the place of the slot in the chain open, decision D-3.)
"""

DROP_COST = (("variant", 1), ("state", 2), ("level", 4), ("slot", 8))


def format_key(kind, role, level=None, variant=None, state=None, slot=None):
    if not kind or not role:
        raise ValueError("kind and role are required")
    key = "%s.%s" % (kind, role)
    if level is not None:
        key += ".L%d" % level
    if variant is not None:
        key += ".v%d" % variant
    if state:
        key += "." + state
    if slot:
        key += "@" + slot
    return key


def fallback_chain(kind, role, level=None, variant=None, state=None, slot=None):
    """Keys to try, best first (the first is the exact key)."""
    parts = {"level": level, "variant": variant, "state": state or None, "slot": slot or None}
    present = [(name, cost) for name, cost in DROP_COST if parts[name] is not None]
    subsets = []
    for mask in range(1 << len(present)):
        dropped = [present[i][0] for i in range(len(present)) if mask & (1 << i)]
        cost = sum(present[i][1] for i in range(len(present)) if mask & (1 << i))
        subsets.append((cost, dropped))
    subsets.sort(key=lambda s: s[0])
    chain = []
    for _cost, dropped in subsets:
        keep = dict(parts)
        for name in dropped:
            keep[name] = None
        key = format_key(kind, role, keep["level"], keep["variant"], keep["state"], keep["slot"])
        if key not in chain:
            chain.append(key)
    return chain
