import test from 'node:test';
import assert from 'node:assert/strict';
import { easternDay, nextMidnight, rankPlayers, scoreValue } from '../src/rules.js';

test('Eastern date changes at midnight, not the visitor’s timezone', () => {
  assert.equal(easternDay(new Date('2026-10-22T03:59:59Z')), '2026-10-21');
  assert.equal(easternDay(new Date('2026-10-22T04:00:00Z')), '2026-10-22');
  assert.equal(easternDay(new Date('2026-12-22T04:59:59Z')), '2026-12-21');
  assert.equal(easternDay(new Date('2026-12-22T05:00:00Z')), '2026-12-22');
});
test('Next midnight handles 23- and 25-hour daylight-saving days', () => {
  assert.equal(nextMidnight(new Date('2026-03-08T05:00:00Z')), '2026-03-09T04:00:00.000Z');
  assert.equal(nextMidnight(new Date('2026-11-01T04:00:00Z')), '2026-11-02T05:00:00.000Z');
});
test('Ties share rank and a zero score is a valid submitted day', () => {
  const players = [{ name: 'A', today: 420 }, { name: 'B', today: 420 }, { name: 'C', today: 0 }, { name: 'D', today: null }];
  assert.deepEqual(rankPlayers(players, 'today').map(p => p.rank), [1, 1, 3]);
});
test('Score validation rejects negatives, decimals, empty text, and non-numbers', () => {
  assert.equal(scoreValue('0'), 0); assert.equal(scoreValue('420'), 420);
  for (const value of ['', '-1', '1.5', 'NaN', '1e3', '1000000001']) assert.throws(() => scoreValue(value));
});
