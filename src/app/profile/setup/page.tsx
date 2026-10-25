import { redirect } from "next/navigation";
import { getSubject } from "@/lib/auth0";
import { findProfile, listUniversities } from "@/lib/profiles.mjs";
import PageShell from "@/components/page-shell";
import ProfileForm from "@/components/profile-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProfileSetupPage() {
  const subject = await getSubject();
  if (!subject) redirect("/auth/login?returnTo=%2Fprofile");
  if (await findProfile(subject)) redirect("/profile");
  const universities = await listUniversities();
  return (
    <PageShell signedIn>
      <p className="mb-4 text-sm font-semibold text-lime-300">Meet your campus crew</p>
      <h1 className="text-3xl font-bold">Set up your player profile</h1>
      <p className="mt-4 text-slate-300">Tell other players a little about yourself. Complete your profile before hosting or joining games.</p>
      <ProfileForm profile={null} universities={universities} />
    </PageShell>
  );
}
