import { getSubject } from '@/lib/auth0';
import { findProfile } from '@/lib/profiles.mjs';
import { cancelGame } from '@/lib/games.mjs';
import { handleCancellation } from '@/lib/cancellation-handler.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleCancellation(request, (await params).id, { getSubject, findProfile, cancelGame, appBaseUrl: process.env.APP_BASE_URL });
}
