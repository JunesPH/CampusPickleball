import './load-production-env.mjs';
import { readdir, readFile } from 'node:fs/promises';

const secrets = ['DATABASE_URL', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET']
  .map(key => process.env[key]).filter(Boolean);
if (secrets.length !== 3) throw new Error('Required audit configuration is missing.');
let files = 0;
let leaked = false;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else {
      files++;
      const contents = await readFile(path, 'utf8');
      if (secrets.some(value => contents.includes(value))) leaked = true;
    }
  }
}
await scan('.next/static');
console.log(JSON.stringify({ browserAssetsScanned: files, secretValuesFound: leaked }));
if (leaked) process.exitCode = 1;
