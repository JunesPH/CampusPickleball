import Link from "next/link";

export default function PageShell({ children, signedIn = false }: { children: React.ReactNode; signedIn?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-white sm:px-10">
      <header className="mx-auto mb-12 flex max-w-3xl flex-wrap items-center justify-between gap-4">
        <Link href="/" className="font-bold text-lime-300">Campus Pickleball</Link>
        <nav aria-label="Account" className="flex flex-wrap gap-5 text-sm">
          <Link href="/games">Find games</Link>
          {signedIn ? <><Link href="/games/new">Create game</Link><Link href="/profile">My profile</Link><a href="/auth/logout">Log out</a></> : <a href="/auth/login">Sign in</a>}
        </nav>
      </header>
      <main className="mx-auto max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl sm:p-12">
        {children}
      </main>
    </div>
  );
}
