import Link from 'next/link';
import PageShell from '@/components/page-shell';
import GameDateFilter from '@/components/game-date-filter';
import { getSubject } from '@/lib/auth0';
import { findProfile } from '@/lib/profiles.mjs';
import { GameInputError, listCourts, listGames, parseGameFilters } from '@/lib/games.mjs';
import { SKILL_LEVELS, skillLabel } from '@/lib/skill-levels.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function GamesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const subject = await getSubject();
  const profile = subject ? await findProfile(subject) : null;
  const courts = await listCourts();
  let filters;
  let error = '';
  try { filters = parseGameFilters(await searchParams, profile ? String(profile.skill_level) : 'all'); }
  catch (caught) {
    if (!(caught instanceof GameInputError)) throw caught;
    error = caught.message;
    filters = parseGameFilters({});
  }
  if (filters.court && !courts.some((court: { id: string }) => court.id === filters.court)) error = 'That court is unavailable. Choose a court from the list.';
  const { games, hasNext } = error ? { games: [], hasNext: false } : await listGames(filters, profile?.id ?? null);
  const pageLink = (page: number) => `/games?${new URLSearchParams({ skill: filters.skill, court: filters.court, date: filters.date, page: String(page) })}`;
  const fieldClass = 'mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-white';

  return <PageShell signedIn={Boolean(subject)}>
    <p className="mb-4 text-sm font-semibold text-lime-300">Find your next rally</p>
    <h1 className="text-3xl font-bold">Upcoming games</h1>
    <p className="mt-3 text-slate-300">Find a group at your level and a court that works for you.</p>
    {profile && <p className="mt-2 text-sm text-slate-400">Your rating is {skillLabel(profile.skill_level)}. Games match your rating by default; you can browse any level.</p>}
    <form key={`${filters.skill}:${filters.date}:${filters.court}`} action="/games" method="get" className="mt-6 space-y-4 rounded-2xl border border-slate-700 p-4" aria-label="Filter games">
      <label className="block" htmlFor="filter-skill">Player skill level<select id="filter-skill" name="skill" defaultValue={filters.skill} className={fieldClass}><option value="all">All levels</option>{SKILL_LEVELS.map((level) => <option key={level} value={level}>{skillLabel(level)}</option>)}</select></label>
      <div><label className="block" htmlFor="filter-date">Date at the court</label><GameDateFilter defaultValue={filters.date} /></div>
      <p id="filter-date-help" className="text-sm text-slate-400">The date is matched in each court’s local timezone, as shown on the game.</p>
      <label className="block" htmlFor="filter-court">Court<select id="filter-court" name="court" defaultValue={filters.court} className={fieldClass}><option value="">All courts</option>{courts.map((court: { id: string; name: string }) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-4"><button className="rounded-xl bg-lime-300 px-5 py-3 font-semibold text-slate-950">Apply filters</button><Link href="/games?skill=all" className="text-sm text-lime-300 underline">Clear filters</Link></div>
    </form>
    {error && <p role="alert" className="mt-5 text-red-200">{error}</p>}
    {!error && !games.length && <div className="mt-8"><h2 className="text-xl font-semibold">No upcoming games found</h2><p className="mt-2 text-slate-300">Try another date or court, clear the filters, or host your own game.</p><Link href={subject ? '/games/new' : '/auth/login'} className="mt-4 inline-block text-lime-300 underline">{subject ? 'Create a game' : 'Sign in to host a game'}</Link></div>}
    <ul aria-label="Upcoming games" className="mt-8 space-y-5">{games.map((game) => {
      const capacity = game.format === 'singles' ? 2 : 4;
      const spots = Math.max(0, capacity - game.member_count);
      return <li key={game.id} className="rounded-2xl border border-slate-700 p-5">
        <h2 className="text-xl font-semibold"><Link href={`/games/${game.id}`} className="text-lime-300 underline decoration-lime-300/40 underline-offset-4">{game.court_name}</Link></h2>
        <p className="mt-2 text-sm text-slate-400">{game.address}</p>
        <p className="mt-3"><time dateTime={game.starts_at.toISOString()}>{new Intl.DateTimeFormat('en-US', { timeZone: game.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(game.starts_at)}</time></p>
        <p className="text-sm text-slate-400">{game.timezone}</p>
        <p className="mt-3">{game.format === 'singles' ? 'Singles' : 'Doubles'} · {skillLabel(game.skill_min)}–{skillLabel(game.skill_max)}</p>
        <p className="mt-2 font-medium">{spots ? `${spots} ${spots === 1 ? 'spot' : 'spots'} available` : 'Full'} <span className="font-normal text-slate-400">· {game.member_count}/{capacity} players</span></p>
        {game.joined && <p className="mt-2 text-sm text-lime-300">{game.host_id === profile?.id ? 'You’re hosting' : 'You’ve joined'}</p>}
        <Link href={`/games/${game.id}`} className="mt-4 inline-block rounded-lg border border-slate-600 px-4 py-2 text-sm hover:border-lime-300">View game</Link>
      </li>;
    })}</ul>
    {!error && (filters.page > 1 || hasNext) && <nav aria-label="Results pages" className="mt-6 flex items-center justify-between gap-4">
      {filters.page > 1 ? <Link href={pageLink(filters.page - 1)} className="text-lime-300 underline">Previous</Link> : <span />}
      <span className="text-sm text-slate-400">Page {filters.page}</span>
      {hasNext ? <Link href={pageLink(filters.page + 1)} className="text-lime-300 underline">Next</Link> : <span />}
    </nav>}
    <p className="mt-8 text-sm text-slate-400">Joining a game does not reserve a physical court. Confirm venue access independently.</p>
  </PageShell>;
}
