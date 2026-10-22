import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRounds, rarityCounts } from '../src/rarity.js';

test('screenshot example sums to 370', () => {
 const rounds = [100, 60, 30, 10, 85, 0, 85];
 assert.equal(validateRounds(rounds), 370);
 assert.deepEqual(rarityCounts(rounds), { krillion:1, deepCut:2, rare:1, schooler:1, tooClever:0, plankton:1, missed:1 });
});
test('rejects partial, invalid and noninteger rounds', () => {
 for (const rounds of [[100], Array(7).fill(null), Array(7).fill(35), Array(7).fill('85')]) {
   assert.throws(() => validateRounds(rounds));
 }
});
test('seven misses are valid', () => assert.equal(validateRounds(Array(7).fill(0)), 0));
