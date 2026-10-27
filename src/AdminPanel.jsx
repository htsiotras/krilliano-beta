import React, { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { rpc } from './api';
import { scoreValue } from './rules';

const emptyPlayer = { id: null, name: '', email: '', openingPoints: 0, openingWins: 0, openingThrough: '', linked: false };
const demoRoster = state => state.adminPlayers || state.players.map(p => ({ ...emptyPlayer, id: p.id, name: p.name, linked: p.id === 'demo-you' }));
function previousDay(day) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0,10); }

export default function AdminPanel({ today, demo, state, setState, history, setHistory, onChange }) {
  const [section, setSection] = useState('scores');
  const [day, setDay] = useState(today);
  const [players, setPlayers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remove, setRemove] = useState(null);
  const loadVersion = useRef(0);

  async function load() {
    const version = ++loadVersion.current;
    setLoading(true); setError(''); setRemove(null);
    try {
      let roster, rows;
      if (demo) {
        roster = demoRoster(state);
        rows = roster.map(p => ({ id: p.id, name: p.name, score: day === today ? state.players.find(s => s.id === p.id)?.today ?? null : history.find(h => h.day === day)?.entries.find(e => e.id === p.id)?.score ?? null, includedInOpening: Boolean(p.openingThrough && day <= p.openingThrough) }));
      } else [roster, rows] = await Promise.all([rpc('admin_players'), rpc('admin_day', { p_day: day })]);
      if (version !== loadVersion.current) return;
      setPlayers(roster); setEntries(rows); setDrafts(Object.fromEntries(rows.map(p => [p.id, p.score === null ? '' : String(p.score)])));
    } catch (e) { if (version === loadVersion.current) setError(e.message); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { loadVersion.current++; }; }, [day, demo]);

  async function saveEntry(playerId, removing = false) {
    setError(''); setNotice(''); setBusy(true);
    try {
      const value = removing ? null : scoreValue(drafts[playerId]);
      if (demo) {
        const row = entries.find(e => e.id === playerId);
        const previous = row?.score ?? null;
        if (row?.includedInOpening) throw new Error('This date is already included in opening totals.');
        let formerWinners = [], nextWinners = [];
        if (day !== today) {
          const previousDayEntries = history.find(h => h.day === day)?.entries || [];
          const beforeMax = Math.max(...previousDayEntries.map(e => e.score));
          formerWinners = previousDayEntries.filter(e => e.score === beforeMax).map(e => e.id);
          const next = previousDayEntries.filter(e => e.id !== playerId);
          if (value !== null) next.push({ id: playerId, name: row.name, score: value });
          next.sort((a,b) => b.score - a.score);
          const best = Math.max(...next.map(e => e.score));
          nextWinners = next.filter(e => e.score === best).map(e => e.id);
          setHistory(old => [...old.filter(h => h.day !== day), ...(next.length ? [{ day, best, entries: next }] : [])].sort((a,b) => b.day.localeCompare(a.day)));
        }
        setState(old => ({ ...old, players: old.players.map(p => ({ ...p,
          ...(p.id === playerId ? { total: p.total - (previous ?? 0) + (value ?? 0), days: p.days - (previous === null ? 0 : 1) + (value === null ? 0 : 1), ...(day === today ? { today: value } : {}) } : {}),
          wins: p.wins - (formerWinners.includes(p.id) ? 1 : 0) + (nextWinners.includes(p.id) ? 1 : 0)
        })) }));
      } else { await rpc('admin_save_score', { p_player: playerId, p_day: day, p_score: value }); await onChange(); }
      setEntries(old => old.map(e => e.id === playerId ? { ...e, score: value } : e));
      if (removing) setDrafts(old => ({ ...old, [playerId]: '' }));
      setRemove(null); setNotice(`${demo ? 'Preview: ' : ''}${removing ? 'Score removed.' : 'Score saved.'} Wins and total points have been recalculated.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveProfile(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const name = profile.name.trim(), email = profile.email.trim().toLowerCase();
      const wins = Number(profile.openingWins), points = Number(profile.openingPoints), through = profile.openingThrough || null;
      if (name.length < 2 || name.length > 24) throw new Error('Choose a name with 2–24 characters.');
      if (!Number.isSafeInteger(points) || points < 0 || points > 1e12 || !Number.isSafeInteger(wins) || wins < 0 || wins > 1e6) throw new Error('Enter nonnegative whole numbers for wins and points.');
      if ((wins || points) && !through) throw new Error('Choose the last date included in the opening totals.');
      if (through && through >= today) throw new Error('Opening totals must end before today.');
      let id = profile.id;
      if (demo) {
        if (players.some(p => p.id !== id && (p.name.toLowerCase() === name.toLowerCase() || email && p.email === email))) throw new Error('That name or email is already in the club.');
        if (through && history.some(h => h.day <= through && h.entries.some(p => p.id === id))) throw new Error('These totals overlap daily scores. Choose an earlier cutoff.');
        const before = players.find(p => p.id === id) || emptyPlayer;
        id ||= `demo-${crypto.randomUUID()}`;
        const next = { ...profile, id, name, email, openingPoints: points, openingWins: wins, openingThrough: through };
        const roster = [...players.filter(p => p.id !== id), next]; setPlayers(roster);
        setState(old => ({ ...old, adminPlayers: roster, players: old.players.some(p => p.id === id)
          ? old.players.map(p => p.id === id ? { ...p, name, total: p.total - before.openingPoints + points, wins: p.wins - before.openingWins + wins, hasOpening: Boolean(through) } : p)
          : [...old.players, { id, name, total: points, wins, today: null, days: 0, hasOpening: Boolean(through) }] }));
        setEntries(old => [...old.filter(p => p.id !== id), { id, name, score: entries.find(p => p.id === id)?.score ?? null, includedInOpening: Boolean(through && day <= through) }]);
        setDrafts(old => ({ ...old, [id]: old[id] ?? '' }));
      } else {
        await rpc('admin_save_player', { p_id: id, p_name: name, p_email: email || null, p_points: points, p_wins: wins, p_through: through });
        await onChange(); await load();
      }
      setProfile(null); setNotice(`${demo ? 'Preview: ' : ''}Player saved. Their opening totals are included on the leaderboards.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="admin-section">
    <div className="admin-title"><div><span className="tiny-label"><ShieldCheck size={12}/> YOUR ADMIN AREA</span><h2>Keep the club in order.</h2><p>Correct scores, add your friends, and bring your history along.</p></div><span className="admin-badge">{demo ? 'Demo admin' : 'Admin access'}</span></div>
    <div className="admin-tabs"><button className={section === 'scores' ? 'selected' : ''} onClick={() => { setSection('scores'); setProfile(null); }}>Daily scores</button><button className={section === 'players' ? 'selected' : ''} onClick={() => setSection('players')}>Players & opening totals</button></div>
    {error && <div role="alert" className="alert error"><span>{error}</span><button aria-label="Dismiss admin error" onClick={() => setError('')}><X size={16}/></button></div>}
    {notice && <div role="status" className="alert notice"><Check size={17}/><span>{notice}</span><button aria-label="Dismiss admin message" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {section === 'scores' ? <div className="card admin-card"><div className="admin-card-heading"><div><h3>Scores by day</h3><p>Past-day changes recalculate wins for everyone, including ties.</p></div><label className="admin-date">Day to edit<input type="date" value={day} max={today} onChange={e => { if (e.target.value) setDay(e.target.value); }} disabled={busy}/></label></div>
      <div className="admin-table"><div className="admin-table-label"><span>PLAYER</span><span>SCORE</span><span>ACTIONS</span></div>{loading ? <p className="admin-empty">Loading players…</p> : !entries.length ? <p className="admin-empty">Add your first player under “Players & opening totals”.</p> : entries.map(p => <div className="admin-score-row" key={p.id}><span className="admin-player-name">{p.name}</span>{p.includedInOpening ? <span className="opening-covered">Included in opening totals</span> : <><label className="sr-only" htmlFor={`admin-score-${p.id}`}>Score for {p.name}</label><input id={`admin-score-${p.id}`} inputMode="numeric" value={drafts[p.id] ?? ''} placeholder="—" disabled={busy} onChange={e => setDrafts(old => ({ ...old, [p.id]: e.target.value }))}/><div className="admin-actions"><button className="button button-small button-outline" aria-label={`Save score for ${p.name}`} disabled={busy || drafts[p.id] === '' || Number(drafts[p.id]) === p.score} onClick={() => saveEntry(p.id)}><Save size={14}/><span>Save</span></button>{p.score !== null && (remove === p.id ? <button className="remove-confirm" onClick={() => saveEntry(p.id, true)} disabled={busy}>Confirm removal</button> : <button className="icon-button" aria-label={`Remove score for ${p.name}`} onClick={() => setRemove(p.id)} disabled={busy}><Trash2 size={15}/></button>)}</div></>}</div>)}</div><p className="admin-footnote">A blank entry means the player didn’t play. Zero is a valid submitted score.</p></div>
    : <><div className="admin-guide"><strong>Two ways to bring your history.</strong><p>Enter individual past scores under Daily scores. For older results you only have as a leaderboard, enter opening points and wins below, with the last date included. Add daily results after that cutoff to avoid counting them twice.</p></div>
      {profile ? <form className="card profile-editor" onSubmit={saveProfile}><div className="admin-card-heading"><h3>{profile.id ? `Edit ${profile.name || 'player'}` : 'Add a player'}</h3><button type="button" className="icon-button" aria-label="Close player editor" disabled={busy} onClick={() => setProfile(null)}><X size={19}/></button></div><div className="profile-fields"><label>Player name<input value={profile.name} minLength={2} maxLength={24} required onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}/></label><label>Google email <span>(optional until they join)</span><input type="email" value={profile.email || ''} disabled={profile.linked} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}/><small>{profile.linked ? 'Already linked to their signed-in account.' : 'Their history connects automatically when this verified Google email signs in.'}</small></label><label>Opening total points<input type="number" min="0" max="1000000000000" step="1" required value={profile.openingPoints} onChange={e => setProfile(p => ({ ...p, openingPoints: e.target.value }))}/></label><label>Opening daily wins<input type="number" min="0" max="1000000" step="1" required value={profile.openingWins} onChange={e => setProfile(p => ({ ...p, openingWins: e.target.value }))}/></label><label className="cutoff-field">Totals include all results through<input type="date" max={previousDay(today)} value={profile.openingThrough || ''} required={Number(profile.openingPoints) > 0 || Number(profile.openingWins) > 0} onChange={e => setProfile(p => ({ ...p, openingThrough: e.target.value }))}/><small>Leave blank if you’re entering every past day individually.</small></label></div><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save player'} <Check size={16}/></button></form>
      : <div className="card admin-card"><div className="admin-card-heading"><div><h3>Your players</h3><p>Opening totals are added to points and wins earned on the site.</p></div><button className="button button-small" onClick={() => setProfile({ ...emptyPlayer })}><Plus size={16}/> Add player</button></div>{loading ? <p className="admin-empty">Loading players…</p> : players.map(p => <div className="admin-roster-row" key={p.id}><div><strong>{p.name}</strong><span>{p.linked ? 'Account linked' : p.email ? 'Ready for first Google sign-in' : 'Email needed to link account'}</span></div><div className="opening-summary"><strong>{Number(p.openingPoints).toLocaleString()} pts <span>·</span> {p.openingWins} wins</strong><span>{p.openingThrough ? `Through ${p.openingThrough}` : 'No opening totals'}</span></div><button className="icon-button" aria-label={`Edit player ${p.name}`} onClick={() => setProfile({ ...p, email: p.email || '', openingThrough: p.openingThrough || '' })}><Pencil size={16}/></button></div>)}</div>}
    </>}
    <p className="admin-security"><ShieldCheck size={14}/> Only your approved Google account can make these changes. Admin changes are logged.</p>
  </section>;
}
