import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { loadModule, loadTsx } from './helpers/tsx.mjs';

const Link = ({ children, ...props }) => React.createElement('a', props, children);
const PageShell = loadTsx('../../src/components/page-shell.tsx', { 'next/link': Link });
const CourtIllustration = loadTsx('../../src/components/court-illustration.tsx');
const documentFor = element => new JSDOM(renderToStaticMarkup(element)).window.document;

async function home(subject, configured = true) {
  const Home = loadTsx('../../src/app/page.tsx', {
    'next/link': Link,
    '@/lib/auth0': { getSubject: async () => subject, isAuthConfigured: () => configured },
    '@/components/page-shell': PageShell,
    '@/components/court-illustration': CourtIllustration,
    './home.module.css': {},
  });
  return documentFor(await Home());
}

test('anonymous visitors see the overview, public discovery and normal Auth0 links', async () => {
  const doc = await home(null);
  assert.match(doc.querySelector('h1').textContent, /Your next rally/);
  assert.equal(doc.querySelector('nav a:last-child').getAttribute('href'), '/auth/login');
  assert.equal([...doc.querySelectorAll('main a')].find(a => a.textContent.includes('Browse games')).getAttribute('href'), '/games');
  assert.equal([...doc.querySelectorAll('main a')].find(a => a.textContent === 'Sign in to play').getAttribute('href'), '/auth/login');
  assert.equal(doc.querySelector('a[href="/games/new"]'), null);
  assert.equal(doc.querySelector('meta[http-equiv="refresh"]'), null);
});

test('signed-in visitors stay on the overview and can find games, host or reach their profile', async () => {
  // Home uses only the session, so players without a profile also see this page.
  const doc = await home('auth0|student');
  assert.match(doc.querySelector('h1').textContent, /Your next rally/);
  assert.equal(doc.querySelector('meta[http-equiv="refresh"]'), null);
  const links = [...doc.querySelectorAll('a')];
  for (const [text, href] of [['Find a game', '/games'], ['Create a game', '/games/new'], ['My profile', '/profile'], ['My Games', '/my-games'], ['Log out', '/auth/logout']]) {
    assert.ok(links.some(a => a.textContent.startsWith(text) && a.getAttribute('href') === href), text);
  }
  assert.equal(doc.querySelector('a[href="/auth/login"]'), null);
});

test('brand always links home in the overview and existing page shell for both session states', () => {
  for (const signedIn of [false, true]) for (const overview of [false, true]) {
    const doc = documentFor(React.createElement(PageShell, { signedIn, overview }, 'Page content'));
    const brand = doc.querySelector('header > a');
    assert.equal(brand.textContent, 'Campus Pickleball');
    assert.equal(brand.getAttribute('href'), '/');
    assert.equal(doc.querySelector('a[href="#main-content"]').getAttribute('href'), `#${doc.querySelector('main').id}`);
  }
});

test('overview has semantic sections, self-reported skills, court disclaimer and decorative art', async () => {
  const doc = await home(null);
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelectorAll('section[aria-labelledby]').length, 4);
  for (const section of doc.querySelectorAll('section')) assert.ok(doc.getElementById(section.getAttribute('aria-labelledby')));
  assert.equal(doc.querySelectorAll('ol > li').length, 3);
  assert.match(doc.querySelector('main').textContent, /self-reported skill level/);
  assert.match(doc.querySelector('main').textContent, /does not reserve a court/);
  const art = doc.querySelector('svg');
  assert.equal(art.getAttribute('aria-hidden'), 'true');
  assert.equal(art.getAttribute('focusable'), 'false');
  assert.equal(art.querySelector('a'), null);
});

test('unconfigured sign-in retains its helpful status', async () => {
  const doc = await home(null, false);
  assert.match(doc.querySelector('[role="status"]').textContent, /Sign-in is being set up/);
});

test('existing profile gate still sends anonymous visitors to login and incomplete profiles to setup', async () => {
  for (const [subject, profile, expected] of [[null, null, '/auth/login?returnTo=%2Fprofile'], ['auth0|new', null, '/profile/setup']]) {
    const { requireProfile } = loadModule('../../src/lib/require-profile.ts', {
      'server-only': {},
      'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
      './auth0': { getSubject: async () => subject },
      './profiles.mjs': { findProfile: async () => { assert.ok(subject); return profile; } },
    });
    await assert.rejects(requireProfile(), { message: `redirect:${expected}` });
  }
  const profile = { id: 'student', skill_level: 3 };
  const { requireProfile } = loadModule('../../src/lib/require-profile.ts', {
    'server-only': {},
    'next/navigation': { redirect: () => assert.fail('Completed profile must not redirect') },
    './auth0': { getSubject: async () => 'auth0|student' },
    './profiles.mjs': { findProfile: async () => profile },
  });
  assert.equal(await requireProfile(), profile);
});
