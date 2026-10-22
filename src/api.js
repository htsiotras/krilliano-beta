import { createClient } from '@supabase/supabase-js';
import { easternDay, nextMidnight } from './rules';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT'));
export const supabase = configured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;

export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export function demoState() {
  return { day: easternDay(), serverTime: new Date().toISOString(), resetAt: nextMidnight(), isAdmin: true, meId: 'demo-you', players: [
    { id: 'demo-you', name: 'You', today: null, wins: 4, total: 3420, days: 9 },
    { id: 'demo-jamie', name: 'Jamie', today: 485, wins: 6, total: 4190, days: 10 },
    { id: 'demo-alex', name: 'Alex', today: 420, wins: 3, total: 3810, days: 10 },
    { id: 'demo-sam', name: 'Sam', today: 420, wins: 4, total: 3650, days: 9 },
    { id: 'demo-riley', name: 'Riley', today: 365, wins: 2, total: 3185, days: 10 },
    { id: 'demo-morgan', name: 'Morgan', today: null, wins: 1, total: 2890, days: 8 },
  ] };
}

export function demoHistory() {
  const day = new Date(`${easternDay()}T12:00:00Z`);
  return [1, 2, 3, 4].map((back, i) => {
    const d = new Date(day); d.setUTCDate(d.getUTCDate() - back);
    return { day: d.toISOString().slice(0, 10), best: 510 - i * 25, entries: [
      { id: 'demo-jamie', name: 'Jamie', score: 510 - i * 25 },
      { id: 'demo-you', name: 'You', score: i === 1 ? 485 : 410 - i * 20 },
      { id: 'demo-alex', name: 'Alex', score: 350 - i * 15 },
    ] };
  });
}
