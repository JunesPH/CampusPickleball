import { redirect } from "next/navigation";
import { getSubject, isAuthConfigured } from "@/lib/auth0";
import PageShell from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getSubject()) redirect("/profile");
  return (
    <PageShell>
      <p className="mb-6 inline-flex rounded-full bg-lime-300 px-4 py-2 text-sm font-semibold text-slate-950">Meet your campus crew</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">More rallies.<br />More connections.</h1>
      <p className="mt-6 text-lg leading-8 text-slate-300">A simpler way for university pickleball players to connect. Sign in and set up your player profile.</p>
      <a href="/auth/login" className="mt-8 inline-block rounded-xl bg-lime-300 px-6 py-3 font-semibold text-slate-950">Sign in to get started</a>
      {!isAuthConfigured() && <p role="status" className="mt-6 text-sm text-amber-200">Sign-in is being set up. Please check back soon.</p>}
      <p className="mt-8 text-sm text-slate-400">Game discovery, hosting, and joining are coming next.</p>
    </PageShell>
  );
}
