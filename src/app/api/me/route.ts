import { getSubject } from "@/lib/auth0";
import { findProfile, saveProfile } from "@/lib/profiles.mjs";
import { handleMe } from "@/lib/me-handler.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return handleMe(request, { getSubject, findProfile, saveProfile, appBaseUrl: process.env.APP_BASE_URL });
}

export { handle as GET, handle as PUT };
