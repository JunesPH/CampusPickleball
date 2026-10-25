import 'server-only';
import { GameInputError, GameProfileError } from './games.mjs';
import { profileResponse } from './me-handler.mjs';

export async function handleCreateGame(request, { getSubject, findProfile, createGame, appBaseUrl }) {
  try {
    const subject = await getSubject();
    if (!subject) return profileResponse({ error: 'Sign in before creating a game.' }, 401);
    if (!await findProfile(subject)) return profileResponse({ error: 'Complete your profile before creating a game.' }, 403);
    const site = request.headers.get('sec-fetch-site');
    if (!appBaseUrl || request.headers.get('origin') !== new URL(appBaseUrl).origin || (site && site !== 'same-origin')) return profileResponse({ error: 'Reload this page and try again from this site.' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return profileResponse({ error: 'Send game fields as JSON.' }, 400);
    const reader = request.body?.getReader();
    if (!reader) return profileResponse({ error: 'Enter the game fields.' }, 400);
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return profileResponse({ error: 'Game request is too large.' }, 400); }
      chunks.push(value);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return profileResponse({ error: 'Send valid JSON game fields.' }, 400); }
    return profileResponse(await createGame(subject, input), 201);
  } catch (error) {
    if (error instanceof GameInputError) return profileResponse({ error: error.message }, 400);
    if (error instanceof GameProfileError) return profileResponse({ error: error.message }, 403);
    console.error('Campus Pickleball: game creation failed.');
    return profileResponse({ error: 'Games are temporarily unavailable. Please try again.' }, 503);
  }
}
