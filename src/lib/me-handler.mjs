import "server-only";
import { ProfileInputError } from "./profiles.mjs";

export function profileResponse(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

// Injectable dependencies let tests exercise the same authorization boundary
// as the route, without adding an authentication bypass to the application.
export async function handleMe(request, { getSubject, findProfile, saveProfile, appBaseUrl }) {
  try {
    const subject = await getSubject();
    if (!subject) return profileResponse({ error: "Sign in to access your profile." }, 401);
    if (request.method === "GET") {
      const profile = await findProfile(subject);
      return profile ? profileResponse(profile) : profileResponse({ error: "Complete your profile to get started." }, 404);
    }
    if (request.method !== "PUT") return profileResponse({ error: "Method not allowed." }, 405);

    // Use the configured canonical origin, never a submitted Host/forwarded Host.
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (!appBaseUrl || origin !== new URL(appBaseUrl).origin || (site && site !== "same-origin")) {
      return profileResponse({ error: "Reload this page and try again from this site." }, 403);
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return profileResponse({ error: "Send profile fields as JSON." }, 400);
    }
    // Bound the body even when Content-Length is absent (chunked requests).
    const reader = request.body?.getReader();
    if (!reader) return profileResponse({ error: "Enter your profile fields." }, 400);
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        return profileResponse({ error: "Profile request is too large." }, 400);
      }
      chunks.push(value);
    }
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return profileResponse({ error: "Send valid JSON profile fields." }, 400);
    }
    return profileResponse(await saveProfile(subject, input));
  } catch (error) {
    if (error instanceof ProfileInputError) return profileResponse({ error: error.message }, 400);
    // pg/SDK errors can include private information. Do not log raw errors.
    console.error("Campus Pickleball: profile request failed.");
    return profileResponse({ error: "Your profile is temporarily unavailable. Please try again." }, 503);
  }
}
