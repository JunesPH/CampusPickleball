"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = { display_name: string; university_id: string; skill_level: number };
type University = { id: string; name: string };

export default function ProfileForm({ profile, universities }: { profile: Profile | null; universities: University[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fieldClass = "mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          display_name: fields.get("display_name"),
          university_id: fields.get("university_id"),
          skill_level: Number(fields.get("skill_level")),
        }),
      });
      if (response.status === 401) {
        setError("Your session has ended. Sign in again using the link below, then retry.");
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "We couldn’t save your profile. Please try again.");
        return;
      }
      if (!profile) router.replace("/profile?saved=1");
      else setSaved(true);
      router.refresh();
    } catch {
      setError("We couldn’t reach the server. Your entries are still here; please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6" aria-busy={saving} onChange={() => setSaved(false)}>
      <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
        <legend className="sr-only">Player details</legend>
        <div>
          <label htmlFor="display_name" className="font-medium">Display name</label>
          <input id="display_name" name="display_name" autoComplete="nickname" required maxLength={80}
            defaultValue={profile?.display_name ?? ""} className={fieldClass} aria-describedby="name-help" />
          <p id="name-help" className="mt-2 text-sm text-slate-400">Use 1–80 characters. This is how other players will know you.</p>
        </div>
        <div>
          <label htmlFor="university_id" className="font-medium">University</label>
          <select id="university_id" name="university_id" required defaultValue={profile?.university_id ?? ""}
            className={fieldClass} aria-describedby="university-help">
            <option value="" disabled>Choose your university</option>
            {universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
          </select>
          <p id="university-help" className="mt-2 text-sm text-slate-400">Campus affiliation is self-declared; it does not verify student status.</p>
        </div>
        <div>
          <label htmlFor="skill_level" className="font-medium">Self-reported skill level</label>
          <select id="skill_level" name="skill_level" required defaultValue={profile?.skill_level ?? ""}
            className={fieldClass} aria-describedby="skill-help">
            <option value="" disabled>Choose your level</option>
            <option value="1">Beginner</option><option value="2">Intermediate</option><option value="3">Advanced</option>
          </select>
          <p id="skill-help" className="mt-2 text-sm text-slate-400">These are self-reported app labels, not official ratings. You can change your level later.</p>
        </div>
      </fieldset>
      {error && <div role="alert" className="rounded-xl border border-red-400/50 p-4 text-red-200">
        <p>{error}</p><a className="mt-2 inline-block underline" href="/auth/login?returnTo=%2Fprofile">Sign in again</a>
      </div>}
      <p role="status" aria-live="polite" className="text-lime-300">{saving ? "Saving your profile…" : saved ? "Profile saved." : ""}</p>
      {universities.length === 0 && <p role="alert" className="text-amber-200">No universities are available yet. Please try again later.</p>}
      <button type="submit" disabled={saving || universities.length === 0}
        className="w-full rounded-xl bg-lime-300 px-6 py-3 font-semibold text-slate-950 disabled:cursor-wait disabled:opacity-60">
        {saving ? "Saving…" : profile ? "Save changes" : "Save my profile"}
      </button>
    </form>
  );
}
