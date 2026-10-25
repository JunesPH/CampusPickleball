import Link from 'next/link';
import PageShell from '@/components/page-shell';
export default function GameNotFound() {
  return <PageShell><h1 className="text-3xl font-bold">Game not found</h1><p className="mt-4 text-slate-300">This link may be incorrect. Browse upcoming games to find a group.</p><Link href="/games" className="mt-6 inline-block rounded-xl bg-lime-300 px-5 py-3 text-slate-950">Find games</Link></PageShell>;
}
