'use client';
export default function GamesError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-bold">Games are temporarily unavailable</h1><p className="mt-4">Please try again.</p><button onClick={reset} className="mt-6 rounded-xl bg-lime-300 px-6 py-3 text-slate-950">Try again</button></main>;
}
