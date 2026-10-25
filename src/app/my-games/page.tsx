import Link from 'next/link';
import PageShell from '@/components/page-shell';
import { requireProfile } from '@/lib/require-profile';
import { GameInputError, listMyGames, parseGameFilters } from '@/lib/games.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MyGamesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile();
  let page = 1;
  let error = '';
  try { page = parseGameFilters({ page: (await searchParams).page }).page; }
  catch (caught) { if (!(caught instanceof GameInputError)) throw caught; error = caught.message; }
  const { games, hasNext } = await listMyGames(profile.id, page);
  return <PageShell signedIn>
    <h1 className="text-3xl font-bold">My Games</h1>
    <p className="mt-3 text-slate-300">Your upcoming games, including cancellations. All times are local to the court.</p>
    {error && <p role="alert" className="mt-4 text-red-200">{error}</p>}
    {!games.length && <div className="mt-8 rounded-2xl border border-slate-700 p-5">
      <h2 className="text-xl font-semibold">{page > 1 ? 'No more games' : 'Your next rally starts here'}</h2>
      <p className="mt-2 text-slate-300">{page > 1 ? 'Go back to see your upcoming games.' : 'Games you host or join will appear here.'}</p>
      <div className="mt-4 flex flex-wrap gap-4"><Link href="/games" className="text-lime-300 underline">Find games</Link><Link href="/games/new" className="text-lime-300 underline">Create a game</Link></div>
    </div>}
    <ul aria-label="My Games" className="mt-8 space-y-5">{games.map((game) => <li key={game.id} className="rounded-2xl border border-slate-700 p-5">
      <div className="mb-3 flex flex-wrap gap-2"><span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-lime-300">{game.host_id === profile.id ? 'Hosting' : 'Joined'}</span><span className={`rounded-full px-3 py-1 text-sm ${game.status === 'cancelled' ? 'bg-amber-950 text-amber-200' : 'bg-slate-800 text-slate-200'}`}>{game.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}</span></div>
      <h2 className="text-xl font-semibold"><Link href={`/games/${game.id}`} className="text-lime-300 underline">{game.court_name}</Link></h2>
      <p className="mt-3"><time dateTime={game.starts_at.toISOString()}>{new Intl.DateTimeFormat('en-US', { timeZone: game.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(game.starts_at)}</time></p>
      <p className="text-sm text-slate-400">{game.timezone}</p>
      <p className="mt-3">{game.format === 'singles' ? 'Singles' : 'Doubles'} · {game.member_count}/{game.format === 'singles' ? 2 : 4} players</p>
      {game.status === 'cancelled' && <p className="mt-2 text-amber-200">The host cancelled this game. You are no longer committed to this time.</p>}
      <Link href={`/games/${game.id}`} className="mt-4 inline-block rounded-lg border border-slate-600 px-4 py-3 text-sm">View game</Link>
    </li>)}</ul>
    {(page > 1 || hasNext) && <nav aria-label="My Games pages" className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? <Link href={`/my-games?page=${page - 1}`} className="text-lime-300 underline">Previous</Link> : <span />}
      <span>Page {page}</span>{hasNext ? <Link href={`/my-games?page=${page + 1}`} className="text-lime-300 underline">Next</Link> : <span />}
    </nav>}
  </PageShell>;
}
