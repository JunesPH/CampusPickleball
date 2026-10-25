import Link from "next/link";
import PageShell from "@/components/page-shell";

export default function SignInErrorPage() {
  return (
    <PageShell>
      <h1 className="text-3xl font-bold">We couldn’t finish signing you in</h1>
      <p role="alert" className="mt-4 text-slate-300">Your login may have expired or been cancelled. Please try again.</p>
      <a href="/auth/login" className="mt-6 inline-block rounded-xl bg-lime-300 px-6 py-3 font-semibold text-slate-950">Try signing in again</a>
      <Link href="/" className="ml-5 inline-block underline">Home</Link>
    </PageShell>
  );
}
