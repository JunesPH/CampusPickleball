import { getSubject } from '@/lib/auth0';
import { findProfile } from '@/lib/profiles.mjs';
import { changeMembership } from '@/lib/games.mjs';
import { handleMembership } from '@/lib/membership-handler.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function membership(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleMembership(request, (await params).id, { getSubject, findProfile, changeMembership, appBaseUrl: process.env.APP_BASE_URL });
}
export { membership as POST, membership as DELETE };
