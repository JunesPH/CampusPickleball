import PageShell from '@/components/page-shell';
import GameForm from '@/components/game-form';
import { requireProfile } from '@/lib/require-profile';
import { listCourts } from '@/lib/games.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function NewGamePage() {
  const profile = await requireProfile();
  const courts = await listCourts();
  return <PageShell signedIn>
    <h1 className="text-3xl font-bold">Create a game</h1>
    <p className="mt-4 text-slate-300">Pick a court and invite your next rally. You’ll automatically join as host.</p>
    <GameForm courts={courts} skillLevel={profile.skill_level} />
  </PageShell>;
}
