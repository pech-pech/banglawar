// Regenerates test/ball-vectors.json from NUMBERS' tuning.json reference.ball_vectors (no hand-typed numbers).
// Usage: node tools/gen-vectors.mjs /path/to/tuning.json   (run from the app root)
import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
const path = process.argv[2];
const raw = readFileSync(path);
const t = JSON.parse(raw);
const bv = t.reference.ball_vectors;
const sha = createHash('sha256').update(raw).digest('hex').slice(0, 8);
if (bv.vectors.length !== 500 || !bv.vectors.every((v) => Number.isInteger(v.wk_lost) && Number.isInteger(v.over) && Number.isInteger(v.centre))) throw new Error('ball_vectors shape changed');
const out = { source: `tuning.json reference.ball_vectors (game_ball, ${bv.count} vectors, seed ${bv.seed}, tuning.json sha256 ${sha}...)`, extra_inputs: bv.extra_inputs, vectors: bv.vectors };
writeFileSync('test/ball-vectors.json', JSON.stringify(out) + '\n');
console.log('ok', out.vectors.length, 'vectors', sha);
