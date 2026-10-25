import { requireProfile } from "@/lib/require-profile";
import { listUniversities } from "@/lib/profiles.mjs";
import PageShell from "@/components/page-shell";
import ProfileForm from "@/components/profile-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const profile = await requireProfile();
  const universities = await listUniversities();
  const { saved } = await searchParams;
  return (
    <PageShell signedIn>
      <p className="mb-4 text-sm font-semibold text-lime-300">Ready for your next rally</p>
      <h1 className="text-3xl font-bold">Your player profile</h1>
      <p className="mt-4 text-slate-300">Welcome, {profile.display_name}. Keep your details up to date for your games.</p>
      {saved === "1" && <p role="status" className="mt-4 text-lime-300">Your profile is saved. You can edit it below.</p>}
      <ProfileForm profile={{ display_name: profile.display_name, university_id: profile.university_id, skill_level: profile.skill_level }} universities={universities} />
    </PageShell>
  );
}
