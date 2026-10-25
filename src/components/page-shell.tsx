import Link from "next/link";

export default function PageShell({ children, signedIn = false, overview = false }: { children: React.ReactNode; signedIn?: boolean; overview?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-10">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:mb-4 focus:inline-block focus:rounded-lg focus:bg-slate-900 focus:p-3 focus:text-lime-300">Skip to content</a>
      <header className={`mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-12 ${overview ? "max-w-6xl" : "max-w-3xl"}`}>
        <Link href="/" className="inline-flex min-h-11 items-center font-bold text-lime-300">Campus Pickleball</Link>
        <nav aria-label="Account" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:w-auto">
          <Link href="/games">Find games</Link>
          {signedIn ? <><Link href="/games/new">Create game</Link><Link href="/my-games">My Games</Link><Link href="/profile">My profile</Link><a href="/auth/logout">Log out</a></> : <a href="/auth/login">Sign in</a>}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className={overview ? "mx-auto min-w-0 max-w-6xl" : "mx-auto max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 min-w-0 p-4 shadow-xl sm:p-12"}>
        {children}
      </main>
    </div>
  );
}
