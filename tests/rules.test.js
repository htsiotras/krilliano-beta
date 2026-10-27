import test from 'node:test';
import assert from 'node:assert/strict';
import { easternDay, nextMidnight, rankPlayers, scoreValue, withGameAverages } from '../src/rules.js';

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

test('Averages use actual recorded games, including historical games and today', () => {
  const rows = withGameAverages([
    { id: 'a', name: 'Alex', total: 2100, days: 7, hasOpening: false },
    { id: 'b', name: 'Jamie', total: 2500, days: 8, today: 400, hasOpening: false },
    { id: 'c', name: 'Sam', total: 800, days: 2, hasOpening: false },
  ]);
  assert.deepEqual(rows.map(p => p.average), [300, 312.5, 400]);
  assert.deepEqual(rankPlayers(rows, 'average').map(p => p.id), ['c', 'b', 'a']);
});

test('Zero games are unranked, a zero score counts, and opening totals are not guessed', () => {
  const rows = withGameAverages([
    { name: 'New', total: 0, days: 0 },
    { name: 'Zero', total: 0, days: 1 },
    { name: 'Imported balance', total: 2000, days: 2, hasOpening: true },
  ]);
  assert.deepEqual(rows.map(p => p.average), [null, 0, null]);
  assert.deepEqual(rankPlayers(rows, 'average').map(p => p.name), ['Zero']);
});

test('Corrections replace points without adding a game, and equal averages share ranks', () => {
  const before = { name: 'Alex', total: 900, days: 3 };
  const corrected = { ...before, total: before.total - 300 + 450 };
  assert.equal(withGameAverages([corrected])[0].average, 350);
  const rows = withGameAverages([corrected, { name: 'Jamie', total: 700, days: 2 }, { name: 'Sam', total: 100, days: 1 }]);
  assert.deepEqual(rankPlayers(rows, 'average').map(p => p.rank), [1, 1, 3]);
});
