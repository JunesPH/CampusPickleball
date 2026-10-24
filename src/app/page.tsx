export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white sm:px-10">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl sm:p-12">
        <p className="mb-6 inline-flex rounded-full bg-lime-300 px-4 py-2 text-sm font-semibold text-slate-950">
          Coming soon to campus
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Campus Pickleball
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
          More rallies. More connections. A simpler way to find your next game.
        </p>
        <p className="mt-4 leading-7 text-slate-400">
          We’re building a place for university players to meet, find games at
          their skill level, and get out on the court. Check back soon.
        </p>
      </section>
    </main>
  );
}
