# Campus Pickleball development

The foundation uses the official `create-next-app` starter with Next.js App Router,
React, TypeScript, Tailwind CSS, ESLint, and npm. The homepage is a static placeholder.

## Local setup

Node.js 24 is recommended (scaffolded with Node.js 24.14.1 and npm 11.11.0).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Changes to `src/app/page.tsx` appear automatically.
The placeholder homepage needs no external services. Database commands require
local Tiger Cloud configuration; see [database setup](db/README.md).

## Checks and production preview

```sh
npm run lint
npm run build
npm start
```

Run `npm start` after a successful build to preview the production app locally.

## Main files and folders

- `src/app/`: App Router routes, shared layout, global styles, and favicon.
  `page.tsx` is the homepage; `layout.tsx` sets page metadata and the document shell.
- `src/app/globals.css`: Tailwind import and global styling.
- `public/`: Static assets served directly from the site root.
- `package.json` and `package-lock.json`: npm commands and locked dependencies.
- `next.config.ts`, `tsconfig.json`, and `eslint.config.mjs`: Framework,
  TypeScript, and lint configuration. `postcss.config.mjs` connects Tailwind.
  The dev and build commands use Next.js’s supported Webpack option because the
  starter’s Turbopack CSS worker could not open a local port in this environment.
- `.next/` and `node_modules/`: Generated build output and installed packages,
  both ignored by Git.

The original `README.md` and `Campus_Pickleball_Website_Specification.md` are
preserved. The database foundation is implemented; authentication, game APIs,
join/leave behavior, and hosting remain future work.

## Database foundation

Copy `.env.example` to `.env.local` and configure the existing Tiger Cloud service
locally. Keep credentials out of chat, source files, and `NEXT_PUBLIC_` variables.
See [db/README.md](db/README.md) for configuration, verified court sources,
migration safety, scope, and verification results.

```sh
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:verify
```

Run migration and seed again to check repeatability. `db:check` and `db:verify`
use read-only transactions. `npm run test:db` checks connection safety offline.
