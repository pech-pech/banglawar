import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gameHash } from '../hash.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hook = process.env.PGS_LAYOUT_HOOK ||
  resolve(here, '../../../../../mnt/project-files/games-lessons/pgs-plugin-update/pgs-1.13.0/pgs/hooks/layout-gate.mjs');
const hookPath = existsSync(hook) ? hook : '/mnt/project-files/games-lessons/pgs-plugin-update/pgs-1.13.0/pgs/hooks/layout-gate.mjs';

test('gameHash parity with plugin hook', { skip: !existsSync(hookPath) && 'plugin hook not present' }, async () => {
  const { gameHash: pluginHash } = await import(pathToFileURL(hookPath).href);
  const d = mkdtempSync(join(tmpdir(), 'hp-'));
  const w = (p, c) => { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); };
  w('index.html', 'x'); w('sw.js', 'top'); w('js/sw.js', 'nested'); w('qa/layout/r.json', '{}');
  w('sub/qa/keep.txt', 'k'); w('.hidden', 'h'); w('a/.dot', 'd'); w('.dir/x.txt', 'xd'); w('a/b.js', 'b');
  assert.equal(pluginHash(d), gameHash(d));
  const before = gameHash(d);
  w('js/sw.js', 'changed');
  assert.notEqual(gameHash(d), before, 'nested sw.js is hashed');
  assert.equal(pluginHash(d), gameHash(d));
});
