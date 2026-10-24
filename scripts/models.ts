// Lists the Nebius Token Factory catalogue and pins a roster into lib/models.pinned.json.
// Usage: npm run models
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { pickRoster } from '../lib/models';

config({ path: '.env.local' });

async function main() {
  const client = new OpenAI({ baseURL: process.env.NEBIUS_BASE_URL, apiKey: process.env.NEBIUS_API_KEY });
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  ids.sort();
  console.log(`Catalogue (${ids.length} models):`);
  for (const id of ids) console.log('  ' + id);
  const roster = pickRoster(ids);
  console.log('\nPicked roster:', JSON.stringify(roster, null, 2));
  fs.writeFileSync(path.join('lib', 'models.pinned.json'), JSON.stringify(roster, null, 2));
  console.log('Wrote lib/models.pinned.json (edit by hand to override).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
