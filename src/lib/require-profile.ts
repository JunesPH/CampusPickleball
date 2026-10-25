import "server-only";
import { redirect } from "next/navigation";
import { getSubject } from "./auth0";
import { findProfile } from "./profiles.mjs";

/** For protected server pages. APIs must enforce the same checks with 401/403. */
export async function requireProfile() {
  const subject = await getSubject();
  if (!subject) redirect("/auth/login?returnTo=%2Fprofile");
  const profile = await findProfile(subject);
  if (!profile) redirect("/profile/setup");
  return profile;
}
