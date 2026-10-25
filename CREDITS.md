# Credits and third-party resources

## Starter template

The project was scaffolded with Vercel's official [create-next-app](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) starter, using Next.js App Router, React, TypeScript, Tailwind CSS, and ESLint. The initial project structure, configuration, and retained starter assets in `public/` came from that template. The starter is part of the [Next.js project](https://github.com/vercel/next.js), licensed under MIT.

## Direct open-source dependencies

These citations cover every runtime and development dependency declared in `package.json`. Versions below reflect the installed packages at submission preparation; `package-lock.json` records the resolved dependency tree, including transitive packages. Third-party packages retain their respective upstream licenses and copyright notices.

| Package(s) | Version(s) | Use | Source / license |
| --- | --- | --- | --- |
| `next`, `@next/env`, `eslint-config-next` | 16.4.3 | Application framework, environment loading, and lint configuration | [Vercel / Next.js](https://github.com/vercel/next.js) — MIT |
| `react`, `react-dom` | 19.3.0 | UI components, rendering, and client interactions | [React](https://react.dev/) / [source](https://github.com/facebook/react) — MIT |
| `@auth0/nextjs-auth0` | 4.33.0 | Auth0 login and server sessions | [Auth0 Next.js SDK](https://github.com/auth0/nextjs-auth0) — MIT |
| `pg` | 8.23.1 | PostgreSQL queries, pooling, and transactions | [node-postgres](https://node-postgres.com/) / [source](https://github.com/brianc/node-postgres) — MIT |
| `server-only` | 0.0.1 | Server-only module import guard | [server-only package](https://www.npmjs.com/package/server-only) — MIT |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | Styling and PostCSS integration | [Tailwind CSS](https://tailwindcss.com/) / [source](https://github.com/tailwindlabs/tailwindcss) — MIT |
| `typescript` | 5.9.3 | Type checking | [TypeScript](https://github.com/microsoft/TypeScript) — Apache-2.0 |
| `eslint` | 9.39.5 | Linting | [ESLint](https://github.com/eslint/eslint) — MIT |
| `jsdom` | 26.1.0 | DOM environment for UI tests | [jsdom](https://github.com/jsdom/jsdom) — MIT |
| `@types/node` | 20.19.43 | Node.js type definitions | [DefinitelyTyped / node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) — MIT |
| `@types/pg` | 8.23.1 | PostgreSQL client type definitions | [DefinitelyTyped / pg](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/pg) — MIT |
| `@types/react` | 19.3.0 | React type definitions | [DefinitelyTyped / react](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) — MIT |
| `@types/react-dom` | 19.3.0 | React DOM type definitions | [DefinitelyTyped / react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) — MIT |

## Services and deployment tools

- [Auth0](https://auth0.com/): hosted authentication through the SDK above.
- [Tiger Data / Tiger Cloud](https://www.tigerdata.com/): hosted PostgreSQL database.
- [Vultr](https://www.vultr.com/): application hosting.
- [Caddy](https://caddyserver.com/): HTTPS reverse proxy used by the deployment configuration.
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/): JavaScript runtime and package tooling.

## Venue information and documentation references

Court names, addresses, source links, and verification limits are documented in [db/README.md](db/README.md#verified-seed-sources), including Patton Township, Ferguson Township, and Centre Region Parks and Recreation sources. The additional PSU Outdoor Pickleball Courts and The Picklr State College entries were supplied by the project owner, as noted there.

Additional implementation references are linked in [DEVELOPMENT.md](DEVELOPMENT.md), [db/README.md](db/README.md), and [Campus_Pickleball_Website_Specification.md](Campus_Pickleball_Website_Specification.md).
