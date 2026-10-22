import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Check, ChevronDown, Clock3, Crown, History, LogOut, Medal, Pencil, RefreshCw, Trophy, Users, Waves, X } from 'lucide-react';
import { configured, supabase, rpc, demoState, demoHistory } from './api';
import { countdown, easternDay, formatDay, nextMidnight, rankPlayers, scoreValue } from './rules';
import './style.css';
import AdminPanel from './AdminPanel';

const number = n => new Intl.NumberFormat('en-US').format(n);
const initials = name => name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const color = name => [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
function Avatar({ name, small = false }) { return <span className={`avatar color-${color(name)} ${small ? 'small' : ''}`}>{initials(name)}</span>; }
function GoogleMark() { return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.7Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.8-2.5l-3.3-2.6a6.2 6.2 0 0 1-9.2-3.2H2.9v2.7A10.2 10.2 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.3 13.7a6.4 6.4 0 0 1 0-3.4V7.6H2.9a10 10 0 0 0 0 8.8l3.4-2.7Z"/><path fill="#ea4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10.2 10.2 0 0 0-9.1 5.6l3.4 2.7A6 6 0 0 1 12 6Z"/></svg>; }

function Board({ players, metric, currentId, title, description, icon: Icon, empty }) {
  const rows = rankPlayers(players, metric);
  const submitted = players.filter(p => p.today !== null).length;
  return <section className={`board card board-${metric}`}>
    <div className="section-heading"><div><div className="heading-line"><span className={`icon-box ${metric}`}><Icon size={18}/></span><h2>{title}</h2></div><p>{description}</p></div>{metric === 'today' && <span className="count-tag">{submitted} / {players.length} played</span>}</div>
    <div className="table-labels"><span>PLAYER</span><span>{metric === 'today' ? 'SCORE' : metric === 'wins' ? 'WINS' : 'POINTS'}</span></div>
    {rows.length ? <ol className="rank-list">{rows.map(p => <li key={p.id} className={p.id === currentId ? 'is-you' : ''}>
      <span className={`rank ${p.rank === 1 && p[metric] > 0 ? 'first' : ''}`}>{p.rank === 1 && p[metric] > 0 ? <Crown size={17}/> : String(p.rank).padStart(2, '0')}</span>
      <Avatar name={p.name}/><span className="player-name">{p.name}{p.id === currentId && <span className="you-tag">YOU</span>}</span>
      <strong className="player-score">{number(p[metric])}{metric === 'today' && <small>pts</small>}</strong>
    </li>)}</ol> : <div className="empty-board"><Waves size={30}/><h3>{empty || 'A clean slate.'}</h3><p>{metric === 'today' ? 'The first score sets the pace. Make it yours.' : 'Your group’s story starts with the first score.'}</p></div>}
    {metric === 'today' && players.some(p => p.today === null) && <div className="waiting"><span className="waiting-avatars">{players.filter(p => p.today === null).slice(0, 4).map(p => <Avatar key={p.id} name={p.name} small/>)}</span><span>{players.filter(p => p.today === null).length} still to play. Plenty of time.</span></div>}
    {metric !== 'today' && <div className="board-foot">{metric === 'wins' ? 'Closed days only. Tied leaders each get a win.' : 'Every submitted day counts, including today.'}</div>}
  </section>;
}

function App() {
  const [demo, setDemo] = useState(new URLSearchParams(location.search).get('demo') === '1');
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('today');
  const [history, setHistory] = useState([]);
  const [moreHistory, setMoreHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [score, setScore] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [rules, setRules] = useState(false);
  const offset = useRef(0);
  const generation = useRef(0);
  const rollover = useRef(false);
  const currentId = demo ? 'demo-you' : state?.meId;
  const me = state?.players.find(p => p.id === currentId);
  const signedIn = demo || Boolean(session);
  const today = state?.day || easternDay();
  const resetAt = state?.resetAt || nextMidnight();
  const expired = now >= new Date(resetAt).getTime();

  useEffect(() => {
    const url = new URL(location.href);
    const authError = url.searchParams.get('error_description') || new URLSearchParams(url.hash.slice(1)).get('error_description');
    if (authError) { setError(authError); window.history.replaceState({}, '', location.pathname); }
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => { if (error) setError(error.message); setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function refresh() {
    if (!signedIn || demo) return;
    const gen = generation.current;
    const fresh = await rpc('club_state');
    if (gen !== generation.current) return;
    offset.current = new Date(fresh.serverTime).getTime() - Date.now();
    setNow(Date.now() + offset.current);
    setState(fresh);
  }

  useEffect(() => {
    generation.current++;
    const gen = generation.current;
    setState(null); setHistory([]); setHistoryLoaded(false); setScore(''); setEditing(false);
    if (demo) { offset.current = 0; setState(demoState()); setHistory(demoHistory()); setHistoryLoaded(true); setLoading(false); return; }
    if (!session) { setLoading(false); return; }
    let alive = true; setLoading(true);
    const load = async () => {
      try {
        await rpc('claim_player');
        const fresh = await rpc('club_state');
        if (!alive || gen !== generation.current) return;
        offset.current = new Date(fresh.serverTime).getTime() - Date.now();
        setState(fresh); setNow(Date.now() + offset.current);
      } catch (e) { if (alive) setError(e.message); } finally { if (alive) setLoading(false); }
    };
    load();
    const interval = setInterval(load, 30000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [session?.user?.id, demo]);

  useEffect(() => { const id = setInterval(() => setNow(Date.now() + offset.current), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { setEditing(false); setScore(''); setHistoryLoaded(demo); rollover.current = false; }, [today, demo]);
  useEffect(() => {
    if (!expired || !state || rollover.current) return;
    rollover.current = true;
    setNotice('A fresh day is here. Yesterday’s scores are now locked.');
    if (demo) {
      setHistory(prev => [{ day: state.day, best: Math.max(0, ...state.players.map(p => p.today ?? 0)), entries: state.players.filter(p => p.today !== null).map(p => ({ id: p.id, name: p.name, score: p.today })).sort((a, b) => b.score - a.score) }, ...prev]);
      const best = Math.max(...state.players.filter(p => p.today !== null).map(p => p.today));
      setState(s => ({ ...s, day: easternDay(), resetAt: nextMidnight(), players: s.players.map(p => ({ ...p, wins: p.wins + (p.today !== null && p.today === best ? 1 : 0), today: null })) }));
    } else refresh().catch(e => { setError(e.message); rollover.current = false; });
  }, [expired, state, demo]);

  async function loadHistory(append = false) {
    if (demo) return;
    setLoading(true);
    try {
      const items = await rpc('club_history', { p_before: append ? history.at(-1)?.day : null });
      setHistory(prev => append ? [...prev, ...items] : items); setMoreHistory(items.length === 30); setHistoryLoaded(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (tab === 'history' && signedIn && !demo && !historyLoaded) loadHistory(); }, [tab, signedIn, demo, historyLoaded]);

  async function signIn() {
    setError('');
    if (!configured) { setNotice('Google sign-in will be available once the site’s accounts are connected. You can explore the preview now.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/', queryParams: { prompt: 'select_account' } } });
    if (error) { setError(error.message); setBusy(false); }
  }
  async function signOut() {
    if (demo) { setDemo(false); window.history.replaceState({}, '', '/'); }
    else { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) { setError(error.message); return; } }
    setState(null); setNotice(''); setError(''); setTab('today');
  }
  async function createPlayer(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await rpc('create_player', { p_name: name.trim() }); await refresh(); setNotice('You’re in. Time to make your mark.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveScore(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const value = scoreValue(score);
      if (expired) throw new Error('A new day has started. Refresh before submitting.');
      if (demo) setState(prev => ({ ...prev, players: prev.players.map(p => p.id !== currentId ? p : { ...p, today: value, total: p.total - (p.today ?? 0) + value, days: p.days + (p.today === null ? 1 : 0) }) }));
      else { await rpc('save_score', { p_score: value, p_expected_day: state.day }); await refresh(); }
      setEditing(false); setNotice(demo ? 'Preview score saved. This is sample data, visible only in this preview.' : 'Score saved. You can correct it until midnight Eastern.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <>
    {demo && <div className="preview-banner"><span><strong>INTERACTIVE PREVIEW</strong> Sample players & scores · changes stay in this tab</span><button onClick={signOut}>Exit preview <X size={13}/></button></div>}
    <header className="header"><a href="/" className="brand" aria-label="Krilliano Beta home"><span className="brand-symbol"><Waves size={25}/></span><span>Krilliano<span className="brand-club">Beta</span></span></a>
      <nav aria-label="Main navigation">{[['today', 'Today'], ['rankings', 'All-time'], ['history', 'History'], ...(state?.isAdmin ? [['admin', 'Admin']] : [])].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav>
      <div className="account">{signedIn ? <><span className="account-name">{me?.name || 'Your account'}</span>{me && <Avatar name={me.name} small/>}<button className="icon-button" title={demo ? 'Exit preview' : 'Sign out on this device'} aria-label={demo ? 'Exit preview' : 'Sign out on this device'} onClick={signOut}><LogOut size={18}/></button></> : <button className="button button-small button-outline" onClick={signIn} disabled={busy || !authReady}>Sign in <ArrowRight size={15}/></button>}</div>
    </header>
    <main>
      <section className="hero"><div><div className="eyebrow"><span className="live-dot"/> THE DAILY RITUAL, TOGETHER</div><h1>{tab === 'history' ? <>Good games.<br/><em>Great memories.</em></> : tab === 'rankings' ? <>A little glory.<br/><em>A lot of bragging rights.</em></> : <>Same game.<br/><em>Friendly rivalry.</em></>}</h1><p>{tab === 'history' ? 'Every score has a story. Here’s your group’s so far.' : tab === 'rankings' ? 'The daily wins. The long game. Two ways to make your mark.' : 'Log your Krillion score. See where you stand. Do it all again tomorrow.'}</p></div>
        <div className="reset-card"><span className="reset-caption"><Clock3 size={15}/> NEXT FRESH START</span><strong className="countdown">{countdown(resetAt, now)}</strong><span className="reset-bottom">Midnight, US Eastern <span>↻</span></span></div>
      </section>

      {error && <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={18}/></button></div>}
      {notice && <div className="alert notice" role="status"><Check size={18}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={18}/></button></div>}

      {!signedIn ? <section className="welcome card"><div className="welcome-art"><Waves size={60} strokeWidth={1.3}/><span className="art-orbit orbit-one"/><span className="art-orbit orbit-two"/><span className="art-dot dot-one"/><span className="art-dot dot-two"/></div><div className="welcome-copy"><span className="eyebrow">YOUR PEOPLE. YOUR LEADERBOARD.</span><h2>A place for your daily<br/>bragging rights.</h2><p>One Google sign-in. Pick your name. Your scores and your place in the club follow you on every device.</p><button className="button button-google" onClick={signIn} disabled={busy || !authReady}><GoogleMark/> Continue with Google <ArrowRight size={17}/></button>{!configured && <p className="setup-note">The site is ready for account setup. Google sign-in isn’t connected yet.</p>}<button className="text-button" onClick={() => { setDemo(true); setNotice(''); window.history.replaceState({}, '', '?demo=1'); }}>Explore an interactive preview <ArrowRight size={15}/></button></div><div className="welcome-perks"><span><Trophy size={18}/> Daily wins</span><span><Medal size={18}/> Total points</span><span><History size={18}/> Every day saved</span></div></section>
      : loading && !state ? <div className="loading card"><RefreshCw className="spinning"/> Getting the club together…</div>
      : !state ? <div className="loading card"><p>We couldn’t load the club.</p><button className="button" onClick={() => refresh().catch(e => setError(e.message))}>Try again</button></div>
      : !me ? <section className="onboarding card"><span className="icon-box today"><Users size={22}/></span><h2>What should we call you?</h2><p>Choose a unique name for the leaderboard. It stays with your Google account.</p><form onSubmit={createPlayer}><label htmlFor="player-name">Your player name</label><input id="player-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={24} required autoComplete="nickname" placeholder="Pick your leaderboard name"/><small>2–24 characters. Make it yours.</small><button className="button" disabled={busy}>{busy ? 'Joining…' : 'Join the club'} <ArrowRight size={17}/></button></form></section>
      : <>
        {tab === 'admin' && state.isAdmin && <AdminPanel today={today} demo={demo} state={state} setState={setState} history={history} setHistory={setHistory} onChange={async () => { await refresh(); setHistoryLoaded(false); }}/ >}
        {tab === 'today' && <><div className="day-heading"><div><span className="tiny-label">TODAY’S CHAPTER</span><h2>{formatDay(today)}<span>{today.slice(0,4)}</span></h2></div><button className="text-button" onClick={() => setRules(!rules)}>How it works <ChevronDown size={15} className={rules ? 'rotated' : ''}/></button></div>
        {rules && <div className="rules card"><p><strong>One score, every day.</strong> Enter your score after you play. You can correct it until midnight US Eastern, including daylight saving time.</p><p><strong>Share the top spot.</strong> At midnight, everyone tied for the highest score earns a win. Previous days lock, while all your points stay in the total.</p><p><strong>Missed a day?</strong> No problem. It simply adds no points or win. Scores are entered on trust.</p></div>}
        <div className="daily-grid"><section className="score-card"><div className="score-card-top"><span className="eyebrow">YOUR DAILY CHECK-IN</span><span className="mini-wave"><Waves size={22}/></span></div>
          {me.today !== null && !editing ? <div className="saved-score"><span className="saved-pill"><Check size={13}/> YOU’RE ON THE BOARD</span><h2>{number(me.today)}<span>points today</span></h2><p>Nice. Let the friendly competition begin.</p><button className="button button-mint" onClick={() => { setEditing(true); setScore(String(me.today)); }} disabled={expired}><Pencil size={16}/> Correct my score</button></div>
          : <form onSubmit={saveScore}><h2>{editing ? 'Make it right.' : 'How did you do?'}</h2><p>{editing ? 'Your corrected score replaces today’s entry.' : 'Big score or humble day. It all adds up.'}</p><label htmlFor="daily-score">{editing ? 'Corrected score' : 'Your score'}</label><div className="score-input"><input id="daily-score" type="text" inputMode="numeric" pattern="[0-9]+" autoComplete="off" required value={score} onChange={e => setScore(e.target.value)} placeholder="000" aria-describedby="score-help"/><span>pts</span></div><button className="button button-mint" disabled={busy || expired}>{busy ? 'Saving…' : editing ? 'Save correction' : 'Submit my score'}<ArrowRight size={17}/></button>{editing && <button type="button" className="cancel-button" onClick={() => setEditing(false)}>Cancel</button>}</form>}
          <div className="score-note" id="score-help"><Clock3 size={14}/><span>Yours to edit until midnight Eastern.</span></div>
        </section><Board players={state.players} metric="today" currentId={currentId} title="Today’s leaderboard" description="The score to beat is right here." icon={Trophy}/></div></>}
        {(tab === 'today' || tab === 'rankings') && <section className="all-time"><div className="all-time-heading"><div><span className="tiny-label">THE BIGGER PICTURE</span><h2>A little consistency goes a long way.</h2></div><span className="all-time-tag">ALL TIME <span>↗</span></span></div><div className="all-time-grid"><Board players={state.players} metric="wins" currentId={currentId} title="Most daily wins" description="For the ones who keep taking the crown." icon={Crown}/><Board players={state.players} metric="total" currentId={currentId} title="Most total points" description="Every day. Every point. All added up." icon={Medal}/></div></section>}
        {tab === 'history' && <section className="history-section"><div className="day-heading"><div><span className="tiny-label">THE CLUB ARCHIVE</span><h2>Past days, preserved.</h2></div><span className="count-tag">Closed at midnight Eastern</span></div>{!history.length ? <div className="card empty-board"><History size={30}/><h3>{loading ? 'Loading the archive…' : 'The best is yet to come.'}</h3><p>Once the first day closes, its scores and winners will be here.</p></div> : history.map(day => <details className="history-day card" key={day.day}><summary><span className="history-date">{formatDay(day.day, true)}<small>{day.day.slice(0, 4)}</small></span><div className="history-winner"><span className="tiny-label">{day.entries.filter(e => e.score === day.best).length > 1 ? 'SHARED WIN' : 'DAILY WINNER'}</span><strong><Crown size={15}/>{day.entries.filter(e => e.score === day.best).map(e => e.name).join(' & ')}</strong></div><strong className="history-best">{number(day.best)}<small>pts</small></strong><ChevronDown size={18}/></summary><ol>{day.entries.map((p, i, rows) => <li key={p.id}><span className="rank">{rows.findIndex(x => x.score === p.score) + 1}</span><Avatar name={p.name} small/><span className="player-name">{p.name}</span><strong>{number(p.score)}</strong></li>)}</ol></details>)}{moreHistory && <button className="button button-outline history-more" onClick={() => loadHistory(true)} disabled={loading}>Load earlier days</button>}</section>}
      </>}
      <footer><span className="footer-brand"><Waves size={19}/> A little friendly competition.</span><span>Made for the daily ritual. <span className="footer-dot">·</span> Independent fan-made tracker.</span></footer>
    </main>
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
