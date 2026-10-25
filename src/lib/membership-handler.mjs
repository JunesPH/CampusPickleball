import 'server-only';
import { GameMembershipError, GameProfileError } from './games.mjs';
import { profileResponse } from './me-handler.mjs';
import { hasRequestBody } from './request-body.mjs';

export async function handleMembership(request, id, { getSubject, findProfile, changeMembership, appBaseUrl }) {
  try {
    if (!['POST', 'DELETE'].includes(request.method)) return profileResponse({ error: 'Method not allowed.' }, 405);
    const subject = await getSubject();
    if (!subject) return profileResponse({ error: 'Sign in before joining or leaving a game.' }, 401);
    if (!await findProfile(subject)) return profileResponse({ error: 'Complete your profile before joining or leaving a game.' }, 403);
    const site = request.headers.get('sec-fetch-site');
    if (!appBaseUrl || request.headers.get('origin') !== new URL(appBaseUrl).origin || (site && site !== 'same-origin')) return profileResponse({ error: 'Reload this page and try again from this site.' }, 403);
    // Identity and operation come exclusively from the session and HTTP method.
    if (await hasRequestBody(request)) return profileResponse({ error: 'Do not submit player information or other fields.' }, 400);
    return profileResponse(await changeMembership(subject, id, request.method === 'POST'));
  } catch (error) {
    if (error instanceof GameMembershipError) return profileResponse({ error: error.message }, error.status);
    if (error instanceof GameProfileError) return profileResponse({ error: error.message }, 403);
    console.error('Campus Pickleball: membership request failed.');
    return profileResponse({ error: 'Games are temporarily unavailable. Please try again.' }, 503);
  }
}
