"use client";

import Link from "next/link";

export default function ProfileError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="max-w-lg space-y-5 rounded-3xl border border-slate-700 bg-slate-900 p-8">
        <h1 className="text-2xl font-bold">Your profile is temporarily unavailable</h1>
        <p role="alert">We couldn’t load your player details. Please try again in a moment.</p>
        <button onClick={reset} className="rounded-xl bg-lime-300 px-5 py-3 font-semibold text-slate-950">Try again</button>
        <nav aria-label="Account recovery" className="flex gap-5"><Link href="/">Home</Link><a href="/auth/logout">Log out</a></nav>
      </section>
    </main>
  );
}
