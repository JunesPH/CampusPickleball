import 'server-only';
import { GameMembershipError, GameProfileError } from './games.mjs';
import { profileResponse } from './me-handler.mjs';
import { hasRequestBody } from './request-body.mjs';

export async function handleCancellation(request, id, { getSubject, findProfile, cancelGame, appBaseUrl }) {
  try {
    if (request.method !== 'POST') return profileResponse({ error: 'Method not allowed.' }, 405);
    const subject = await getSubject();
    if (!subject) return profileResponse({ error: 'Sign in before cancelling a game.' }, 401);
    if (!await findProfile(subject)) return profileResponse({ error: 'Complete your profile before cancelling a game.' }, 403);
    const site = request.headers.get('sec-fetch-site');
    if (!appBaseUrl || request.headers.get('origin') !== new URL(appBaseUrl).origin || (site && site !== 'same-origin')) return profileResponse({ error: 'Reload this page and try again from this site.' }, 403);
    if (await hasRequestBody(request)) return profileResponse({ error: 'Do not submit player information or other fields.' }, 400);
    return profileResponse(await cancelGame(subject, id));
  } catch (error) {
    if (error instanceof GameMembershipError) return profileResponse({ error: error.message }, error.status);
    if (error instanceof GameProfileError) return profileResponse({ error: error.message }, 403);
    console.error('Campus Pickleball: cancellation request failed.');
    return profileResponse({ error: 'Games are temporarily unavailable. Please try again.' }, 503);
  }
}
