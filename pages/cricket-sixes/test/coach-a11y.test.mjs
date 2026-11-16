import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const files = ['cw-chip', 'cw-sheet', 'cw-xp', 'cw-stepup'];
const css = Object.fromEntries(files.map(f => [f, readFileSync(new URL(`../css/${f}.css`, import.meta.url), 'utf8')]));
const kitFs = { 's': 14, 'm': 16, 'l': 20 };
function sizes(src) {
  const out = [];
  for (const m of src.matchAll(/font(?:-size)?\s*:\s*([^;}]*)/g)) {
    const v = m[1];
    const px = v.match(/(?:^|\s)(\d+(?:\.\d+)?)px/);
    const kit = v.match(/var\(--c-fs-([sml])\)/);
    if (kit) out.push(kitFs[kit[1]]);
    else if (px) out.push(parseFloat(px[1]));
    const em = v.match(/(?:^|\s)(\d*\.?\d+)r?em\b/);
    if (em) out.push(parseFloat(em[1]) * 16);
  }
  return out;
}
test('no font-size under 14px', () => {
  for (const f of files) for (const s of sizes(css[f])) assert.ok(s >= 14, `${f}: ${s}px`);
});
test('interactive classes have min-height 56px', () => {
  const need = { 'cw-chip': ['.cw-chip'], 'cw-sheet': ['.cw-row', '.cw-close'], 'cw-stepup': ['.cw-stepup-ok'] };
  for (const [f, sels] of Object.entries(need)) for (const sel of sels) {
    const re = new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}');
    const m = css[f].match(re);
    assert.ok(m, `${sel} missing`);
    assert.match(m[1], /min-height:\s*56px/, sel);
  }
});
