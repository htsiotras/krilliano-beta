import React, { useEffect, useState } from 'react';
import { TIERS, validateRounds, rarityCounts, estimateRounds } from './rarity';

export default function RarityUpload({ day, expectedScore, onSave, disabled = false, demo = false }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [rounds, setRounds] = useState(Array(7).fill(null));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function choose(event) {
    const selected = event.target.files?.[0];
    setFile(selected || null); setRounds(Array(7).fill(null)); setMessage('');
    if (!selected) return;
    if (!selected.type.startsWith('image/') || selected.size > 8_000_000) {
      setMessage('Choose an image under 8 MB.'); setFile(null); return;
    }
    try {
      const suggested = await estimateRounds(selected);
      if (suggested) {
        setRounds(suggested);
        setMessage('Experimental depth estimates are shown below. Check all seven answers and correct any mistakes before saving. Missing markers are not automatically treated as misses.');
      } else setMessage('This screenshot layout was not recognized. Select each answer manually.');
    } catch {
      setMessage('Could not automatically read this image. Select each answer manually.');
    }
  }
  const complete = rounds.every(v => v !== null);
  const total = complete ? validateRounds(rounds) : null;
  const matching = total === expectedScore;
  async function submit(e) {
    e.preventDefault();
    if (!complete || !matching) return;
    setBusy(true); setMessage('');
    try { await onSave([...rounds]); setMessage(demo ? 'Demo preview confirmed. No real data was saved.' : 'Rarity breakdown saved.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{padding:24, marginTop:20}}>
    <h2>Screenshot rarity breakdown</h2>
    <p>Upload your final dive screen. Depth-based guesses are experimental; review each prompt. Your screenshot stays on this device and is not uploaded to Supabase.</p>
    <form onSubmit={submit}>
      <label htmlFor="rarity-upload">Final results screenshot</label>
      <input id="rarity-upload" type="file" accept="image/*" onChange={choose} disabled={disabled || busy}/>
      {preview && <img src={preview} alt="Uploaded final result screenshot" style={{maxWidth:'100%',maxHeight:320,objectFit:'contain',display:'block',margin:'12px 0'}}/>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:12,marginTop:14}}>
        {rounds.map((value,i)=><label key={i}>Prompt {i+1}
          <select value={value ?? ''} onChange={e=>setRounds(old=>old.map((v,j)=>j===i ? (e.target.value==='' ? null : Number(e.target.value)) : v))} disabled={disabled||busy}>
            <option value="">Select result</option>
            {TIERS.map(t=><option value={t.points} key={t.key}>{t.label} ({t.points})</option>)}
          </select>
        </label>)}
      </div>
      <p><strong>Breakdown: {total ?? 'Incomplete'} / {expectedScore} points</strong> {total !== null && (matching ? '✓ Matches saved score' : '— Fix the results or your saved daily score before submitting.')}</p>
      {complete && <p>Krillions: {rarityCounts(rounds).krillion} · Deep Cuts: {rarityCounts(rounds).deepCut} · Rare: {rarityCounts(rounds).rare}</p>}
      {message && <p role="status">{message}</p>}
      <button className="button button-mint" disabled={disabled||busy||!complete||!matching}>{busy?'Saving…':'Save confirmed rarity results'}</button>
    </form>
    <small>Day: {day}. Corrections are allowed until midnight Eastern, just like daily scores.</small>
  </section>;
}
