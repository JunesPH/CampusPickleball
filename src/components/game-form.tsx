'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SKILL_LEVELS, skillLabel } from '@/lib/skill-levels.mjs';
import CourtDateTimePicker from './court-date-time-picker';

type Court = { id: string; name: string; address: string; timezone: string };
export default function GameForm({ courts, skillLevel }: { courts: Court[]; skillLevel: number }) {
  const router = useRouter();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0);
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '');
  const [localTime, setLocalTime] = useState('');
  const court = courts.find((value) => value.id === courtId);
  const fieldClass = 'mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!localTime) {
      setError('Choose a date and time at the court.');
      setStatus(0);
      event.currentTarget.querySelector<HTMLButtonElement>('#local_time')?.focus();
      return;
    }
    const fields = new FormData(event.currentTarget);
    pending.current = true;
    setSaving(true); setError(''); setStatus(0);
    try {
      const response = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({
        court_id: fields.get('court_id'), local_time: fields.get('local_time'), duration_minutes: Number(fields.get('duration_minutes')), format: fields.get('format'), skill_min: Number(fields.get('skill_min')), skill_max: Number(fields.get('skill_max')),
      }) });
      const result = await response.json();
      if (!response.ok) { setStatus(response.status); setError(result.error || 'Could not create the game. Please try again.'); return; }
      router.push(`/games/${result.id}`);
      router.refresh();
    } catch { setError('Could not reach the server. Your entries are still here; please try again.'); }
    finally { pending.current = false; setSaving(false); }
  }
  return <form onSubmit={submit} className="mt-8 space-y-6" aria-busy={saving}>
    <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
      <legend className="sr-only">Game details</legend>
      <div><label htmlFor="court_id">Court</label><select id="court_id" name="court_id" required value={courtId} onChange={(event) => setCourtId(event.target.value)} className={fieldClass}>{courts.map((value) => <option key={value.id} value={value.id}>{value.name} — {value.address}</option>)}</select></div>
      <div><label htmlFor="local_time">Date and time at the court</label><CourtDateTimePicker value={localTime} onChange={setLocalTime} timezone={court?.timezone} /><p id="time-help" className="mt-2 text-sm text-slate-400">Timezone: {court?.timezone ?? 'Choose a court'}. Choose a future time. Repeated or skipped daylight-saving times cannot be selected.</p></div>
      <div><label htmlFor="duration_minutes">Duration</label><select id="duration_minutes" name="duration_minutes" defaultValue="60" className={fieldClass}>{[30, 60, 90, 120, 150, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></div>
      <div><label htmlFor="format">Format</label><select id="format" name="format" className={fieldClass}><option value="singles">Singles · 2 players</option><option value="doubles">Doubles · 4 players</option></select></div>
      <p className="text-sm text-slate-400">Accepted levels must include your rating ({skillLabel(skillLevel)}). All ratings are self-reported.</p>
      {(['skill_min', 'skill_max'] as const).map((name) => <div key={name}><label htmlFor={name}>{name === 'skill_min' ? 'Minimum' : 'Maximum'} accepted skill level</label><select id={name} name={name} defaultValue={name === 'skill_min' ? 2 : 5.5} className={fieldClass}>{SKILL_LEVELS.map((level) => <option key={level} value={level}>{skillLabel(level)}</option>)}</select></div>)}
    </fieldset>
    {error && <div role="alert" className="rounded-xl border border-red-400/50 p-4 text-red-200"><p>{error}</p>{status === 401 && <a href="/auth/login" className="underline">Sign in again</a>}{status === 403 && <a href="/profile" className="underline">Review your profile</a>}</div>}
    {!courts.length && <p role="alert">No courts are available yet. Please try again later.</p>}
    <p className="text-sm text-slate-400">Creating a game does not reserve a court. Confirm venue access independently.</p>
    <p role="status" className="text-lime-300">{saving ? 'Creating your game…' : ''}</p>
    <button disabled={saving || !courts.length} className="w-full rounded-xl bg-lime-300 px-6 py-3 font-semibold text-slate-950 disabled:opacity-60">{saving ? 'Creating…' : 'Create game'}</button>
  </form>;
}
