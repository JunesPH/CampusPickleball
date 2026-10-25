import { getSubject } from '@/lib/auth0';
import { findProfile } from '@/lib/profiles.mjs';
import { createGame } from '@/lib/games.mjs';
import { handleCreateGame } from '@/lib/games-handler.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return handleCreateGame(request, { getSubject, findProfile, createGame, appBaseUrl: process.env.APP_BASE_URL });
}
