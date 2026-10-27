export const TIMEZONE = 'America/New_York';
export function easternDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function nextMidnight(date = new Date()) {
  const day = easternDay(date);
  let lo = date.getTime(), hi = lo + 26 * 3600000;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (easternDay(new Date(mid)) === day) lo = mid; else hi = mid; }
  return new Date(hi).toISOString();
}
export function rankPlayers(players, key) {
  const rows = [...players].filter(p => (key !== 'today' || p.today !== null) && (key !== 'average' || Number.isFinite(p.average)))
    .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((p, i) => { if (i === 0 || rows[i - 1][key] !== p[key]) rank = i + 1; return { ...p, rank }; });
}
export function withGameAverages(players) {
  return players.map(player => {
    const games = Number(player.days ?? 0);
    const total = Number(player.total ?? 0);
    // Opening balances have no game count. Never mix them into a daily-score average.
    const eligible = games > 0 && Number.isSafeInteger(games) && Number.isFinite(total) && !player.hasOpening;
    return { ...player, games, average: eligible ? total / games : null };
  });
}
export function scoreValue(value) {
  if (!/^\d+$/.test(String(value).trim())) throw new Error('Enter a whole-number score, such as 350.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000) throw new Error('Enter a score between 0 and 1,000,000,000.');
  return n;
}
export function formatDay(day, short = false) {
  return new Intl.DateTimeFormat('en-US', { month: short ? 'short' : 'long', day: 'numeric', ...(short ? {} : { weekday: 'long' }), timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}
export function countdown(resetAt, now) {
  const seconds = Math.max(0, Math.floor((new Date(resetAt).getTime() - now) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
