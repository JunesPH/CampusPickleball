import { notFound } from 'next/navigation';
import PageShell from '@/components/page-shell';
import { requireProfile } from '@/lib/require-profile';
import { findGame } from '@/lib/games.mjs';
import { skillLabel } from '@/lib/skill-levels.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const game = await findGame((await params).id);
  if (!game) notFound();
  const formatTime = (date: Date) => new Intl.DateTimeFormat('en-US', { timeZone: game.timezone, dateStyle: 'full', timeStyle: 'long' }).format(date);
  return <PageShell signedIn>
    <p className="mb-4 text-sm font-semibold text-lime-300">Game details</p>
    <h1 className="text-3xl font-bold">{game.court_name}</h1>
    <p className="mt-3 text-slate-300">{game.address}</p>
    <dl className="mt-8 space-y-4">
      <div><dt className="text-slate-400">Scheduled time ({game.timezone})</dt><dd><time dateTime={game.starts_at.toISOString()}>{formatTime(game.starts_at)}</time><br />Ends: <time dateTime={game.ends_at.toISOString()}>{formatTime(game.ends_at)}</time></dd></div>
      <div><dt className="text-slate-400">Format</dt><dd>{game.format === 'singles' ? 'Singles' : 'Doubles'}</dd></div>
      <div><dt className="text-slate-400">Accepted skill levels</dt><dd>{skillLabel(game.skill_min)} through {skillLabel(game.skill_max)}</dd></div>
      <div><dt className="text-slate-400">Host</dt><dd>{game.host_name}</dd></div>
    </dl>
    <h2 className="mt-8 text-xl font-semibold">Participants ({game.participants.length}/{game.format === 'singles' ? 2 : 4})</h2>
    <ul className="mt-3 space-y-2">{game.participants.map((player: { id: string; display_name: string }) => <li key={player.id}>{player.display_name}{player.id === game.host_id ? ' · Host' : ''}</li>)}</ul>
    <p className="mt-8 text-sm text-slate-400">This game organizes players; it does not reserve a physical court.</p>
  </PageShell>;
}
