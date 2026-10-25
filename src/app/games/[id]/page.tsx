import { notFound } from 'next/navigation';
import PageShell from '@/components/page-shell';
import Link from 'next/link';
import { getSubject } from '@/lib/auth0';
import { findProfile } from '@/lib/profiles.mjs';
import GameMembership from '@/components/game-membership';
import { findGame } from '@/lib/games.mjs';
import { skillLabel } from '@/lib/skill-levels.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const subject = await getSubject();
  const profile = subject ? await findProfile(subject) : null;
  const game = await findGame((await params).id);
  if (!game) notFound();
  const formatTime = (date: Date) => new Intl.DateTimeFormat('en-US', { timeZone: game.timezone, dateStyle: 'full', timeStyle: 'long' }).format(date);
  const joined = game.participants.some((player: { id: string }) => player.id === profile?.id);
  const capacity = game.format === 'singles' ? 2 : 4;
  return <PageShell signedIn={Boolean(subject)}>
    <Link href="/games" className="mb-5 inline-block text-sm text-lime-300 underline">Back to games</Link>
    <p className="mb-4 text-sm font-semibold text-lime-300">Game details</p>
    <h1 className="text-3xl font-bold">{game.court_name}</h1>
    <p className="mt-3 text-slate-300">{game.address}</p>
    <dl className="mt-8 space-y-4">
      <div><dt className="text-slate-400">Scheduled time ({game.timezone})</dt><dd><time dateTime={game.starts_at.toISOString()}>{formatTime(game.starts_at)}</time><br />Ends: <time dateTime={game.ends_at.toISOString()}>{formatTime(game.ends_at)}</time></dd></div>
      <div><dt className="text-slate-400">Format</dt><dd>{game.format === 'singles' ? 'Singles' : 'Doubles'}</dd></div>
      <div><dt className="text-slate-400">Accepted skill levels</dt><dd>{skillLabel(game.skill_min)} through {skillLabel(game.skill_max)}</dd></div>
      <div><dt className="text-slate-400">Host</dt><dd>{game.host_name}</dd></div>
    </dl>
    <p className="mt-5 font-medium">{Math.max(0, capacity - game.participants.length)} spots available · {game.status === 'cancelled' ? 'Cancelled' : game.starts_at <= new Date() ? 'Started' : 'Scheduled'}</p>
    <GameMembership id={game.id} signedIn={Boolean(subject)} hasProfile={Boolean(profile)} joined={joined} host={game.host_id === profile?.id} full={game.participants.length >= capacity} eligible={Boolean(profile && profile.skill_level >= game.skill_min && profile.skill_level <= game.skill_max)} started={game.starts_at <= new Date()} cancelled={game.status === 'cancelled'} />
    <h2 className="mt-8 text-xl font-semibold">Participants ({game.participants.length}/{game.format === 'singles' ? 2 : 4})</h2>
    <ul className="mt-3 space-y-2">{game.participants.map((player: { id: string; display_name: string }) => <li key={player.id}>{player.display_name}{player.id === game.host_id ? ' · Host' : ''}</li>)}</ul>
    <p className="mt-8 text-sm text-slate-400">This game organizes players; it does not reserve a physical court.</p>
  </PageShell>;
}
