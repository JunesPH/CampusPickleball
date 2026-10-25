'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import GameCancellation from './game-cancellation';
import { useRouter } from 'next/navigation';

export default function GameMembership({ id, signedIn, hasProfile, joined, host, full, eligible, started, cancelled }: {
  id: string; signedIn: boolean; hasProfile: boolean; joined: boolean; host: boolean;
  full: boolean; eligible: boolean; started: boolean; cancelled: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0);
  const [message, setMessage] = useState('');
  const busy = saving || refreshing;

  async function update() {
    if (pending.current || busy) return;
    pending.current = true;
    setSaving(true); setError(''); setMessage(''); setStatus(0);
    try {
      const response = await fetch(`/api/games/${id}/membership`, {
        method: joined ? 'DELETE' : 'POST', credentials: 'same-origin', cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not update your membership. Please try again.'); setStatus(response.status); }
      else setMessage(result.joined ? 'You have joined this game.' : 'You have left this game.');
      startTransition(() => router.refresh());
    } catch { setError('Could not reach the server. Refresh to check your membership before trying again.'); }
    finally { pending.current = false; setSaving(false); }
  }

  const buttonClass = 'mt-4 inline-block rounded-xl bg-lime-300 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50';
  return <section aria-label="Your game membership" aria-busy={busy} className="mt-8 rounded-2xl border border-slate-600 p-5">
    <h2 className="text-lg font-semibold">{host ? 'You’re hosting this game' : joined ? 'You’re on the roster' : 'Play with this group'}</h2>
    {cancelled ? <p className="mt-2 text-amber-200">This game has been cancelled. Joining is closed.</p> : started ? <p className="mt-2 text-slate-300">This game has started. Joining and leaving are closed.</p> : null}
    {host ? <div><p className="mt-2 text-sm text-slate-300">{cancelled ? "The roster is kept as a record of this cancelled game." : "The host occupies one spot. You can cancel before the game starts."}</p>{!cancelled && !started && <GameCancellation id={id} />}</div>
      : (cancelled || started) && !joined ? <Link href="/games" className="mt-4 inline-block rounded-xl border border-slate-600 px-5 py-3 text-lime-300">Find another game</Link>
      : !signedIn ? <Link href="/auth/login" className={buttonClass}>Sign in to join</Link>
      : !hasProfile ? <Link href="/profile/setup" className={buttonClass}>Complete your profile</Link>
      : joined ? <button type="button" onClick={update} disabled={busy || started} className={buttonClass}>{busy ? 'Updating…' : 'Leave game'}</button>
      : <>
        {!eligible && <p className="mt-2 text-slate-300">Your skill level is outside this game’s accepted range. <Link href="/profile" className="text-lime-300 underline">Review your profile</Link>.</p>}
        {full && <p className="mt-2 text-slate-300">This game is full. Check back if a spot opens.</p>}
        <button type="button" onClick={update} disabled={busy || started || cancelled || full || !eligible} className={buttonClass}>{busy ? 'Updating…' : 'Join game'}</button>
      </>}
    <p role="status" className="mt-3 text-sm text-lime-300">{busy ? 'Updating membership and availability…' : message}</p>
    {error && <div role="alert" className="mt-3 text-sm text-red-200"><p>{error}</p>{status === 401 && <Link href="/auth/login" className="underline">Sign in again</Link>}{status === 403 && <Link href="/profile" className="underline">Review your profile</Link>}</div>}
  </section>;
}
