import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listGated, changedGames, changedGated, newGamesMissingMarker } from '../gated.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const put = (root, rel, txt = 'x') => {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, txt);
};

test('gated helpers on a temp repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'gated-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@t'); git(root, 'config', 'user.name', 't');
    put(root, 'pages/old/index.html');
    put(root, 'pages/gatedold/index.html');
    put(root, 'pages/gatedold/layout-gate.json', '{}');
    put(root, 'pages/_shared/a.js');
    git(root, 'add', '-A'); git(root, 'commit', '-qm', 'base');
    git(root, 'checkout', '-qb', 'feat');
    put(root, 'pages/gatedold/game.js', 'y');
    put(root, 'pages/old/index.html', 'changed');
    put(root, 'pages/_shared/a.js', 'changed');
    put(root, 'pages/newbad/index.html');
    put(root, 'pages/newok/index.html');
    put(root, 'pages/newok/layout-gate.json', '{}');
    put(root, 'pages/_shared/index.html');
    git(root, 'add', '-A'); git(root, 'commit', '-qm', 'feat');

    const pages = join(root, 'pages');
    assert.deepEqual(listGated(pages), ['gatedold', 'newok']);
    assert.deepEqual(listGated(join(root, 'nope')), []);
    assert.deepEqual(changedGames('main', pages), ['gatedold', 'newbad', 'newok', 'old']);
    assert.deepEqual(changedGated('main', pages), ['gatedold', 'newok']);
    assert.deepEqual(newGamesMissingMarker('main', pages), ['newbad']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
