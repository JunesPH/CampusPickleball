'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function GameCancellation({ id }: { id: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0);
  const [done, setDone] = useState(false);
  const busy = saving || refreshing;

  function open() {
    setError(''); setStatus(0);
    dialog.current?.showModal();
  }

  async function cancel() {
    if (pending.current || busy) return;
    pending.current = true;
    setSaving(true); setError(''); setStatus(0);
    try {
      const response = await fetch(`/api/games/${id}/cancel`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not cancel the game. Please try again.'); setStatus(response.status); }
      else if (result?.status === 'cancelled') { setDone(true); dialog.current?.close(); }
      else setError('Could not confirm cancellation. Refresh to check the game status before trying again.');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not confirm cancellation. Refresh to check the game status before trying again.');
      startTransition(() => router.refresh());
    }
    finally { pending.current = false; setSaving(false); }
  }
  return <div className="mt-4" aria-busy={busy}>
    {done ? <p role="status" className="text-amber-200">Game cancelled. Your roster can see the cancellation in My Games.</p> : <button type="button" disabled={busy} onClick={open} className="rounded-xl border border-red-300 px-5 py-3 text-red-200 disabled:opacity-50">Cancel game</button>}
    <dialog ref={dialog} aria-labelledby="cancel-title" aria-describedby="cancel-description" onCancel={(event) => { if (busy) event.preventDefault(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-5 text-white backdrop:bg-slate-950/75">
      <h2 id="cancel-title" className="text-xl font-semibold">Cancel this game?</h2>
      <p id="cancel-description" className="mt-3 text-slate-300">This cannot be undone. Joining will close and everyone on the roster will see the cancellation in My Games. Their time will be freed for other games.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()} className="rounded-xl border border-slate-600 px-4 py-3 disabled:opacity-50">Keep game</button><button type="button" disabled={busy} onClick={cancel} className="rounded-xl bg-red-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Cancelling…' : 'Yes, cancel game'}</button></div>
      <p role="status" className="mt-3">{busy ? 'Updating game status…' : ''}</p>
      {error && <div role="alert" className="mt-3 text-red-200"><p>{error}</p>{status === 401 && <Link href="/auth/login" className="underline">Sign in again</Link>}</div>}
    </dialog>
  </div>;
}
