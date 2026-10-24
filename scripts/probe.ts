import { config } from 'dotenv'; config({ path: '.env.local' });
import { runCrowd } from '../lib/crowd';
import { defaultConfigs, samplePersonas } from '../lib/personas';
import { getRoster } from '../lib/nebius';
(async () => {
  const r = await getRoster();
  const ps = samplePersonas(defaultConfigs("ad"), Number(process.env.N) || 1000, 7, r.crowd.length);
  const t = Date.now();
  const res = await runCrowd(ps, 'ad', 'Meet Loop: the gym that charges per visit. No contracts. £14/mo gets you four visits, then £3 a visit.', 14, (e, d: any) => {
    if (e === 'batch_done' && process.env.V) console.log('done', d.model, d.ms + 'ms', d.reactions.length, 'rows', 'mean stance', (d.reactions.reduce((s: number, x: any) => s + x.stance, 0) / Math.max(1, d.reactions.length)).toFixed(2), '|', d.reactions[0]?.quote);
    if (e === 'batch_failed') console.log('FAIL', d.model, d.error);
  });
  console.log('total', res.size, 'in', Date.now() - t, 'ms');
})();
