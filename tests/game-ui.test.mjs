import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SKILL_LEVELS } from '../src/lib/skill-levels.mjs';
import { loadModule, loadTsx } from './helpers/tsx.mjs';

let dom, root, container, calls, refreshes;
const originalFetch = globalThis.fetch;
const Link = ({ children, ...props }) => React.createElement('a', props, children);
const mocks = () => ({ 'next/navigation': { useRouter: () => ({ refresh: () => { refreshes++; } }) }, 'next/link': Link });
const button = (text) => [...container.querySelectorAll('button')].find((element) => element.textContent === text);
const click = async (element) => { assert.ok(element, 'Button must exist'); await act(async () => element.click()); };
const mount = async (Component, props = {}) => { await act(async () => root.render(React.createElement(Component, props))); };
const cancellation = () => loadTsx('../../src/components/game-cancellation.tsx', mocks());
const membership = () => loadTsx('../../src/components/game-membership.tsx', { ...mocks(), './game-cancellation': cancellation() });

beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:3000' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no native modal implementation. These shims test component
  // open/close decisions only, not browser focus trapping or layout.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  container = document.getElementById('root'); root = createRoot(container);
  calls = []; refreshes = 0;
  globalThis.fetch = async (...args) => { calls.push(args); return Response.json({ status: 'cancelled' }); };
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close(); globalThis.fetch = originalFetch;
  delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('Keep game closes confirmation and never sends a write', async () => {
  await mount(cancellation(), { id: 'game' });
  await click(button('Cancel game')); assert.ok(container.querySelector('dialog').open);
  assert.equal(container.querySelector('dialog').getAttribute('aria-labelledby'), 'cancel-title');
  await click(button('Keep game')); assert.equal(container.querySelector('dialog').open, false);
  assert.equal(calls.length, 0); assert.equal(refreshes, 0);
});

test('rapid double confirmation sends one request and success closes the dialog', async () => {
  let finish;
  globalThis.fetch = (...args) => { calls.push(args); return new Promise((resolve) => { finish = resolve; }); };
  await mount(cancellation(), { id: 'game' }); await click(button('Cancel game'));
  const confirm = button('Yes, cancel game');
  await act(async () => { confirm.click(); confirm.click(); });
  assert.equal(calls.length, 1); assert.equal(confirm.disabled, true); assert.equal(button('Keep game').disabled, true);
  const escape = new dom.window.Event('cancel', { cancelable: true });
  await act(async () => container.querySelector('dialog').dispatchEvent(escape)); assert.equal(escape.defaultPrevented, true);
  assert.equal(calls[0][0], '/api/games/game/cancel'); assert.equal(calls[0][1].method, 'POST'); assert.equal(calls[0][1].body, undefined);
  await act(async () => finish(Response.json({ status: 'cancelled' })));
  assert.equal(container.querySelector('dialog').open, false); assert.equal(button('Cancel game'), undefined);
  assert.match(container.textContent, /Game cancelled/); assert.equal(refreshes, 1);
});

test('expired sessions and server errors never show cancellation success and can be retried', async () => {
  for (const status of [401, 403, 404, 409, 503]) {
    globalThis.fetch = async () => Response.json({ error: `Failed ${status}` }, { status });
    await mount(cancellation(), { id: String(status), key: status }); await click(button('Cancel game')); await click(button('Yes, cancel game'));
    assert.match(container.querySelector('[role="alert"]').textContent, new RegExp(`Failed ${status}`));
    assert.doesNotMatch(container.textContent, /Game cancelled\./); assert.ok(container.querySelector('dialog').open);
    if (status === 401) assert.equal(container.querySelector('[role="alert"] a').getAttribute('href'), '/auth/login');
    assert.equal(button('Yes, cancel game').disabled, false);
    await click(button('Keep game')); await click(button('Cancel game'));
    assert.ok(!container.querySelector('[role="alert"]'), 'Reopening must clear stale errors');
  }
});

test('network and malformed/unexpected responses cannot falsely report cancellation', async () => {
  for (const [index, response] of [
    () => { throw new Error('network unavailable'); },
    () => new Response('not JSON', { status: 502 }),
    () => Response.json({ status: 'scheduled' }),
    () => Response.json({}),
  ].entries()) {
    globalThis.fetch = async () => response();
    await mount(cancellation(), { id: 'game', key: index }); await click(button('Cancel game')); await click(button('Yes, cancel game'));
    assert.ok(container.querySelector('[role="alert"]'));
    assert.doesNotMatch(container.textContent, /Game cancelled\./); assert.ok(container.querySelector('dialog').open);
  }
});

test('cancelled games never invite anonymous or profiled nonmembers to join', async () => {
  for (const signedIn of [false, true]) {
    await mount(membership(), { id: 'game', signedIn, hasProfile: signedIn, joined: false, host: false, full: true, eligible: true, started: false, cancelled: true });
    assert.match(container.textContent, /cancelled/);
    assert.doesNotMatch(container.textContent, /Sign in to join|Join game|This game is full/);
  }
});

test('hosts cannot leave; cancellation is hidden on started and cancelled games', async () => {
  for (const [started, cancelled] of [[false, false], [true, false], [false, true]]) {
    await mount(membership(), { id: 'game', signedIn: true, hasProfile: true, joined: true, host: true, full: false, eligible: true, started, cancelled });
    assert.equal(button('Leave game'), undefined);
    assert.equal(Boolean(button('Cancel game')), !started && !cancelled);
  }
});

const game = { id: 'game', host_id: 'host', status: 'cancelled', starts_at: new Date('2099-01-01T18:00Z'), ends_at: new Date('2099-01-01T19:00Z'), timezone: 'America/New_York', court_name: 'Test Court', host_name: 'Host', address: 'Test address', format: 'singles', skill_min: 2, skill_max: 4, member_count: 2, participants: [{ id: 'host', display_name: 'Host' }, { id: 'guest', display_name: 'Guest' }] };

test('fresh game detail renders cancellation for both identities without a stale creation success', async () => {
  for (const id of ['host', 'guest']) {
    const Page = loadTsx('../../src/app/games/[id]/page.tsx', {
      'next/navigation': { notFound: () => assert.fail('Found fixture') }, 'next/link': Link,
      '@/components/page-shell': ({ children }) => React.createElement('main', null, children),
      '@/components/game-membership': membership(),
      '@/lib/auth0': { getSubject: async () => id }, '@/lib/profiles.mjs': { findProfile: async () => ({ id, skill_level: 3 }) },
      '@/lib/games.mjs': { findGame: async () => game },
    });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: 'game' }), searchParams: Promise.resolve({ created: '1' }) }));
    assert.match(html, /Cancelled by the host/); assert.doesNotMatch(html, /Game created\.|spots available/);
    assert.match(html, /Host/); assert.match(html, /Guest/);
  }
});

test('My Games renders roles, cancellations, empty state, pagination and invalid filter feedback', async () => {
  const { GameInputError, parseGameFilters } = loadModule('../../src/lib/games.mjs', { 'server-only': {}, './db.mjs': {}, './skill-levels.mjs': { SKILL_LEVELS } });
  for (const [games, hasNext, page, expected] of [
    [[game, { ...game, id: 'joined', host_id: 'other' }], true, '1', /Hosting.*Cancelled.*Joined.*Cancelled/s],
    [[], false, '1', /Your next rally starts here/],
    [[], false, '2', /No more games/],
    [[], false, 'invalid', /Choose a valid results page/],
  ]) {
    const Page = loadTsx('../../src/app/my-games/page.tsx', {
      'next/link': Link, '@/components/page-shell': ({ children }) => React.createElement('main', null, children),
      '@/lib/require-profile': { requireProfile: async () => ({ id: 'host' }) },
      '@/lib/games.mjs': { GameInputError, parseGameFilters, listMyGames: async () => ({ games, hasNext }) },
    });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ page }) }));
    assert.match(html, expected);
    if (hasNext) assert.match(html, /my-games\?page=2/);
    if (page === '2') assert.match(html, /my-games\?page=1/);
  }
});


test('My Games data failures propagate to a retryable error state instead of an empty list', async () => {
  const Page = loadTsx('../../src/app/my-games/page.tsx', {
    'next/link': Link, '@/components/page-shell': ({ children }) => React.createElement('main', null, children),
    '@/lib/require-profile': { requireProfile: async () => ({ id: 'host' }) },
    '@/lib/games.mjs': { GameInputError: class extends Error {}, parseGameFilters: () => ({ page: 1 }), listMyGames: async () => { throw new Error('Games unavailable'); } },
  });
  await assert.rejects(Page({ searchParams: Promise.resolve({}) }), /Games unavailable/);
  let retries = 0;
  const ErrorState = loadTsx('../../src/app/games/error.tsx');
  const MyGamesError = loadTsx('../../src/app/my-games/error.tsx', { '../games/error': { __esModule: true, default: ErrorState } });
  await mount(MyGamesError, { reset: () => { retries++; } });
  assert.match(container.textContent, /temporarily unavailable/); await click(button('Try again')); assert.equal(retries, 1);
  const Loading = loadTsx('../../src/app/games/loading.tsx');
  const html = renderToStaticMarkup(React.createElement(Loading));
  assert.match(html, /aria-busy="true"/); assert.match(html, /role="status"/);
});
