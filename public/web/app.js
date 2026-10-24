/* Crowdsight front end, wired to the live backend: /api/ground (Tavily + Nebius brief), /api/crowd (1,000 personas
   across 6 Nebius model families), /api/optimise (agent loop + final summary). The local simulated engine below is
   only used for the mono baseline preview; every score, quote and colour after a run comes from real reactions. */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ---------------- Config ---------------- */
const MODELS = [
  {fam:'Qwen', id:'Qwen/Qwen3-30B-A3B-Instruct-2507', c:'#6E56FF', bias:.05, lat:2.6},
  {fam:'Gemma', id:'google/gemma-3-27b-it', c:'#2F80ED', bias:-.02, lat:3.1},
  {fam:'DeepSeek', id:'deepseek-ai/DeepSeek-V4.1-Flash-1017', c:'#0EA5A0', bias:-.09, lat:2.2},
  {fam:'gpt-oss', id:'openai/gpt-oss-120b', c:'#E39A0B', bias:.01, lat:2.9},
  {fam:'MiniMax', id:'MiniMaxAI/MiniMax-M3.1-Flash', c:'#E5489B', bias:.08, lat:2.4},
  {fam:'Hermes', id:'NousResearch/Hermes-4-405B', c:'#65A30D', bias:-.05, lat:4.8},
];
const STRONG = 'Qwen/Qwen3-235B-A22B-Instruct-2507';
const SEGS = [
  {id:'general', label:'General population', base:-.04, sens:1, imp:1},
  {id:'icp', label:'Target customers', base:.2, sens:1.25, imp:2},
  {id:'expert', label:'Domain experts', base:-.02, sens:.8, imp:1.5},
  {id:'marketing', label:'Marketing experts', base:.04, sens:1.1, imp:1},
  {id:'skeptic', label:'Skeptics & loyalists', base:-.46, sens:.55, imp:1},
];
const CATS = {
  general: {label:'General', hello:'What are you launching?', sub:'Test it on 1,000 people before you tell one.', price:false,
    shares:{general:50, icp:22, expert:12, marketing:8, skeptic:8},
    text:"Meet Loop: the London gym you only pay for when you go. £14/mo gets you 8 visits, a monthly 1:1 coaching session and priority booking. We've raised our prices for your benefit.",
    ideas:['Pay-per-visit gym','Student meal kit','B2B scheduling tool']},
  ads: {label:'Ads', hello:'Who clicks, and who buys?', sub:'Show your ad to 1,000 people and watch the funnel.', price:true,
    shares:{general:45, icp:20, expert:5, marketing:20, skeptic:10},
    text:"Only pay for the gym when you actually go. Loop: 8 visits, a monthly 1:1 coach and priority booking for £14/mo. We've raised our prices for your benefit.",
    ideas:['Instagram ad','Launch tweet','Landing page hero']},
  pricing: {label:'Pricing', hello:'Find the price people will pay', sub:'Every persona names the most they would pay.', price:true,
    shares:{general:35, icp:35, expert:15, marketing:5, skeptic:10},
    text:"Loop is moving from £9/mo to £14/mo. The new price adds a monthly 1:1 coaching session and priority booking at peak times.",
    ideas:['£9 → £14 price rise','Annual plan discount','Free tier removal']},
  launch: {label:'Product launch', hello:'Launch something new', sub:'See who would try it in the next 30 days, and why not.', price:true,
    shares:{general:30, icp:25, expert:30, marketing:5, skeptic:10},
    text:"Loop Teams: a pay-per-visit gym plan for companies. Employers buy visit credits, staff book any Loop site, and there are no contracts.",
    ideas:['Loop Teams for companies','New mobile app','Coaching add-on']},
};
const STAKES = {general:['prospect'], icp:['customer','prospect'], expert:['expert','partner','investor'], marketing:['marketer'], skeptic:['critic','competitor user']};
const ROLES = {
  general:['student nurse','retail assistant','teacher','delivery driver','accountant','barista','civil servant','electrician','junior lawyer','care worker','pharmacist','bus driver','graphic designer','university student','chef','plumber','NHS administrator','sales rep'],
  icp:['shift worker who trains twice a week','new parent getting back to fitness','freelancer with an irregular week','runner who lifts in winter','consultant who travels Mon–Thu','lapsed gym member'],
  expert:['gym franchise owner','personal trainer','fitness-tech product lead','seed-stage VC','leisure industry analyst','physiotherapist'],
  marketing:['growth marketer','brand strategist','performance ad buyer','agency creative director','social media lead'],
  skeptic:['GymFlex member of 4 years','consumer-rights blogger','budget-gym loyalist','ex-member who hit cancellation fees'],
};
const PERS = ['early adopter','pragmatist','skeptic','price-sensitive','status seeker'];
const FIRST = ['Priya','Tom','Aisha','Jack','Mei','Oliver','Zara','Kwame','Sophie','Liam','Fatima','Dan','Elena','Ravi','Grace','Sam','Nadia','Ben','Chloe','Arjun','Hannah','Luca','Amara','Josh','Yuki','Ella','Omar','Ruth','Felix','Leah'];
const LAST = ['Shah','Evans','Okafor','Hughes','Chen','Patel','Wright','Mensah','Clarke','Nowak','Ali','Murphy','Rossi','Kaur','Bennett','Ibrahim','Fischer','Doyle','Haddad','Tanaka'];
const INCOME = {low:9, mid:16, high:30};
const COMPETITORS = [{name:'GymFlex', p:10}, {name:'PulsePass', p:16}];
const SOURCES = [['gymflex.co.uk','#2F80ED'],['pulsepass.com','#E5489B'],['reddit.com','#FF5A1F'],['reviewhub.co.uk','#0EA5A0'],['leisureweek.co.uk','#6E56FF'],['classbox.app','#E39A0B'],['forum.liftlondon.org','#65A30D'],['fitbiz-news.com','#0B0B10']];
const Q = {
  pos:['Pay per visit is exactly how I actually use a gym.','No contract and a coaching slot? I would try it next week.','This kills the guilt of paying for months I skip.','I would send this to my running club.'],
  neu:['Interesting, but I need to see the locations first.','Depends how many sites are near my office.','Decent idea. I would wait for reviews.'],
  neg:['£14 for a gym I visit twice a month? No.','Sounds like every other subscription trap.','GymFlex is £10 and has more sites.','"For your benefit" means it is for yours.'],
  expert:['Pay-per-visit economics get tight past three visits a week.','Retention depends on coaching slots actually being bookable.'],
  marketing:['Strong hook. The last line reads defensive and will hurt CTR.','Lead with "only pay when you go", not the price.'],
  v1:['Cancel anytime and the first visit is free. That is fair.','No strings is what gets me through the door.'],
  v2:['At £12 with no contract I would switch from GymFlex.','£12 makes this an easy yes.'],
};
const OBJ = ['Too expensive for occasional use','"For your benefit" feels dishonest','Worried about cancellation terms','GymFlex is cheaper with more sites','Unclear what happens after 8 visits'];

/* ---------------- Live backend ---------------- */
const REAL = new Map();          // version index -> Map(persona index -> reaction in this UI's shape)
let RAW = [];                    // raw v0 reactions, sent to /api/optimise so it doesn't re-run v0
let BRIEF = null, BRIEF_STR = '';
const LIVE = true;
async function sse(url, body, on){
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const {value, done} = await rd.read(); if (done) break; buf += dec.decode(value, {stream:true});
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = 'message', data = '';
      chunk.split('\n').forEach(l => { if (l.startsWith('event: ')) ev = l.slice(7); else if (l.startsWith('data: ')) data += l.slice(6); });
      try { on(ev, data ? JSON.parse(data) : null); } catch (e) { console.error('[crowdsight]', ev, e); } } }
}
const pidx = id => parseInt(String(id).slice(1), 10);
function toUI(r, price){
  const clicked = r.intent > .5 || r.wouldShare > .6;
  const mp = r.maxPrice ?? 0;
  return { st: r.stance, intent: r.intent, share: r.wouldShare, maxPrice: mp, clicked, bought: clicked && r.intent > .6 && (!price || mp >= price),
    quote: r.quote, objection: r.objection, comparedTo: r.comparedTo || null, model: r.model };
}
const has = (p, vi = curV) => !LIVE || REAL.get(vi)?.has(p.i);
const shareMap = () => Object.fromEntries(SEGS.map(s => [s.id, weights[s.id]?.share ?? CATS[cat].shares[s.id]]));
const impMap = () => Object.fromEntries(SEGS.map(s => [s.id, weights[s.id]?.imp ?? s.imp]));

/* ---------------- State ---------------- */
let cat = 'general', personas = [], reacted = new Set(), curV = 0, mono = false, token = 0, run = null;
const weights = {}; const meter = {calls:0, tokens:0, cost:0, searches:0, sources:0};
let V = []; // versions for the current run

function buildPersonas(){
  const r = rng(20261024 + Object.keys(CATS).indexOf(cat)); personas = []; let i = 0;
  SEGS.forEach(s => {
    const n = Math.round(CATS[cat].shares[s.id] * 10);
    for (let k = 0; k < n; k++) {
      const inc = r() < .3 ? 'low' : r() < .75 ? 'mid' : 'high';
      personas.push({ i:i++, seg:s.id, name:`${FIRST[Math.floor(r()*FIRST.length)]} ${LAST[Math.floor(r()*LAST.length)]}`,
        age:Math.round(19 + r()*48), role:ROLES[s.id][Math.floor(r()*ROLES[s.id].length)], stake:STAKES[s.id][Math.floor(r()*STAKES[s.id].length)],
        pers:PERS[Math.floor(r()*PERS.length)], inc, model:i % 6, n1:r()*2-1, n2:r()*2-1, n3:r()*2-1, n4:r(), q:r(), o:r(), c1:r(), c2:r() });
    }
  });
  SEGS.forEach(s => weights[s.id] = {share: CATS[cat].shares[s.id], imp: s.imp});
}
function react(p, vi = curV, isMono = mono){
  if (LIVE && !isMono) { const real = REAL.get(vi)?.get(p.i) ?? REAL.get(0)?.get(p.i); if (real) return real; }
  const s = SEGS.find(x => x.id === p.seg), v = V[vi] || V[0], m = MODELS[p.model];
  let st = isMono ? .12 + p.n1*.13 + v.shift*.7
    : s.base + m.bias + p.n1*.58 + v.shift*s.sens + (p.pers === 'price-sensitive' ? (v.price && v.price < V[0].price ? .14 : -.1) : 0);
  st = clamp(st, -1, 1);
  const intent = clamp((st+1)/2*.92 + p.n2*.14, 0, 1);
  const share = clamp((st+.55)/2 + p.n3*.14, 0, 1);
  const maxPrice = Math.max(0, Math.round(INCOME[p.inc] * (.55 + p.n4*.75) * (1 + st*.3)));
  const clickP = clamp(.03 + .5*Math.max(0, share - .25) + .25*Math.max(0, st) + v.shift*.12, 0, .85);
  const clicked = p.c1 < clickP;
  const price = v.price ?? 0;
  const bought = clicked && intent > .5 && maxPrice >= price && p.c2 < .8;
  let pool = st > .25 ? Q.pos : st < -.15 ? Q.neg : Q.neu;
  if (st > .25 && vi === 1) pool = Q.v1.concat(Q.pos);
  if (st > .25 && vi === 2) pool = Q.v2.concat(Q.v1);
  if (p.seg === 'expert' && p.q < .5) pool = Q.expert;
  if (p.seg === 'marketing' && p.q < .5 && vi === 0) pool = Q.marketing;
  const quote = pool[Math.floor(p.q * pool.length)];
  const objection = st < .15 ? OBJ[Math.floor(p.o * (vi === 0 ? 5 : vi === 1 ? 4 : 3)) + (vi > 0 && p.o > .15 ? 0 : 0)] : null;
  return {st, intent, share, maxPrice, clicked, bought, quote, objection};
}
function score(vi = curV, isMono = false){
  const segs = SEGS.map(s => {
    const ps = personas.filter(p => p.seg === s.id && has(p, vi)); let a=0,b=0,c=0,cl=0,bo=0;
    ps.forEach(p => { const r = react(p, vi, isMono); a += (r.st+1)/2; b += r.intent; c += r.share; cl += r.clicked; bo += r.bought; });
    const n = ps.length || 1; return {s, n:ps.length, score:100*(.5*a/n + .35*b/n + .15*c/n), ctr:cl/n, buy:bo/n, intent:b/n};
  });
  let num=0, den=0; segs.forEach(x => { if (!x.n) return; const w = weights[x.s.id].share * weights[x.s.id].imp; num += w*x.score; den += w; });
  const all = personas.filter(p => isMono || has(p, vi)).map(p => react(p, vi, isMono));
  if (!all.length) all.push({st:0, intent:0, share:0, maxPrice:0, clicked:false, bought:false});
  const price = V[vi]?.price ?? 0;
  return { launch: den ? num/den : 0, segs, all,
    ctr: all.filter(r => r.clicked).length / all.length, buy: all.filter(r => r.bought).length / all.length,
    pay: price ? all.filter(r => r.maxPrice >= price).length / all.length : 0,
    try30: all.filter(r => r.intent > .6).length / all.length,
    pos: all.filter(r => r.st > .25).length / all.length, neg: all.filter(r => r.st < -.15).length / all.length };
}
function diversity(vi = curV, isMono = false){
  if (LIVE && isMono && !REAL.has('mono')) return NaN;
  const src = LIVE ? [...(isMono ? REAL.get('mono') : REAL.get(vi) ?? new Map()).values()] : personas.map(p => react(p, vi, isMono));
  const b = [0,0,0,0,0]; src.forEach(r => b[Math.min(4, Math.floor((r.st+1)/2*5))]++);
  let h = 0; b.forEach(x => { if (x) { const q = x/src.length; h -= q*Math.log(q); } }); return src.length ? 100*h/Math.log(5) : 0;
}
const monoTxt = () => { const d = diversity(0, true); return Number.isNaN(d) ? '—' : d.toFixed(0); };
function makeVersions(text, price){
  const hasBenefit = /for your benefit\.?/i.test(text);
  const from1 = hasBenefit ? text.match(/[^.]*for your benefit\.?/i)[0].trim() : null;
  V = [
    {v:0, text, price, shift:0},
    {v:1, price, shift:.19, lever:'message', reason: hasBenefit ? 'Skeptics and target customers read "for your benefit" as defensive.' : 'The offer never says how to leave. Lead with cancel-anytime.',
      from: from1, to:'Cancel anytime. Your first visit is free.'},
    {v:2, price: price ? price - 2 : null, shift:.31, lever: price ? 'price' : 'spec',
      reason: price ? `38% of target customers cap out at £${price-2}, and GymFlex anchors at £10.` : 'A smaller starter tier lowers the risk of trying it.',
      from: price ? `£${price}` : null, to: price ? `£${price-2}` : 'Starter tier: 4 visits.'},
  ];
}

/* ---------------- Sidebar & home ---------------- */
function setCat(c){
  cat = c; $$('#nav button').forEach(b => b.setAttribute('aria-current', b.dataset.cat === c));
  const C = CATS[c]; $('#hello').textContent = C.hello; $('#homeSub').textContent = C.sub;
  $('#inp').value = C.text; $('#inp').placeholder = 'Describe what you want to test…';
  $('#prPill').hidden = !C.price; autosize();
  $('#ideas').innerHTML = C.ideas.map(t => `<button type="button">${esc(t)}</button>`).join('');
  $$('#ideas button').forEach((b, i) => b.onclick = () => { $('#inp').value = i === 0 ? C.text : `${b.textContent}: ${C.text.split(':').slice(1).join(':').trim() || C.text}`; autosize(); $('#inp').focus(); });
  buildPersonas();
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (!$('#home').hidden) setCat(b.dataset.cat); else { goHome(); setCat(b.dataset.cat); } $('#side').classList.remove('on'); });
$('#newBtn').addEventListener('click', () => { goHome(); $('#side').classList.remove('on'); });
$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('on'));
function autosize(){ const t = $('#inp'); t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight) + 'px'; }
$('#inp').addEventListener('input', autosize);
$('#inp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });

function moveComposer(toSlot){
  const c = $('#composer'), first = c.getBoundingClientRect();
  toSlot.appendChild(c);
  const last = c.getBoundingClientRect();
  if (reduce || !first.width) return;
  c.style.transition = 'none';
  c.style.transform = `translate(${first.left - last.left}px, ${first.top - last.top}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = 'transform .55s cubic-bezier(.2,.8,.2,1)'; c.style.transform = 'none'; }));
}
function goHome(){
  token++; closeDrawer(); tin.innerHTML = ''; run = null;
  $('#home').hidden = false; $('#thread').hidden = true; $('#dock').hidden = true; $('#detailsBtn').hidden = true; $('#title').textContent = '';
  moveComposer($('#composerSlot')); $('#inp').value = CATS[cat].text; autosize();
}

/* ---------------- Submit → run ---------------- */
$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#inp').value.trim(); if (!text) { $('#inp').focus(); return; }
  const price = CATS[cat].price ? (+$('#pr').value || null) : (+(/£\s?(\d+)/.exec(text)?.[1]) || null);
  const market = $('#mkt').value.trim();
  if (!$('#home').hidden) {
    $('#home').classList.add('out'); await sleep(260);
    $('#home').hidden = true; $('#home').classList.remove('out'); $('#thread').hidden = false; $('#dock').hidden = false;
    moveComposer($('#dockSlot'));
  }
  $('#inp').value = ''; autosize(); $('#inp').placeholder = 'Revise it, or try a new price…';
  addRecent(text);
  startRun(text, market, price);
});
function addRecent(text){
  const r = $('#recent'); if (r.querySelector('span')) r.innerHTML = '';
  const b = document.createElement('button'); b.type = 'button'; b.textContent = `${CATS[cat].label} · ${text.slice(0, 40)}`; b.title = text;
  const c = cat; b.onclick = () => { setCat(c); $('#inp').value = text; autosize(); if ($('#home').hidden) $('#composer').requestSubmit(); };
  r.prepend(b);
}

/* ---------------- Thread rendering ---------------- */
const tin = $('#tin');
function add(html){ const d = document.createElement('div'); d.className = 'item'; d.innerHTML = html; tin.appendChild(d); scrollEnd(); return d; }
function scrollEnd(){ const t = $('#thread'); t.scrollTop = t.scrollHeight; }
const TICK = '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>';
const favs = n => `<span class="favs">${SOURCES.slice(0, n).map(([d, c]) => `<span class="fav" style="background:${c}" title="${d}">${d[0].toUpperCase()}</span>`).join('')}</span>`;
const pct = x => `${Math.round(x*100)}%`;

async function startRun(text, market, price){
  const my = ++token; const alive = () => my === token;
  reacted.clear(); curV = 0; mono = false; buildPersonas(); makeVersions(text, price);
  $('#title').textContent = `${CATS[cat].label} · ${text.slice(0, 48)}${text.length > 48 ? '…' : ''}`;
  $('#detailsBtn').hidden = false;
  add(`<div class="user">${esc(text)}<div class="meta"><span>${CATS[cat].label}</span>${market ? `<span>${esc(market)}</span>` : ''}${price ? `<span>£${price}/mo</span>` : ''}</div></div>`);
  const ans = add(`<div class="ans"></div>`).firstElementChild;

  REAL.clear(); RAW = [];
  // Ground (Tavily search -> Nebius brief)
  const s1 = document.createElement('div'); s1.className = 'step'; s1.innerHTML = `<span class="spin"></span>Searching the market for <b>${esc(market || 'this category')}</b>`; ans.appendChild(s1);
  BRIEF = null; BRIEF_STR = '';
  if (market) {
    const domains = [];
    try {
      await sse('/api/ground', {category: market}, (ev, d) => {
        if (ev === 'ground_source') { meter.searches++; meter.sources++; try { domains.push(new URL(d.url).hostname.replace(/^www\./, '')); } catch {} }
        if (ev === 'brief') BRIEF = d;
      });
    } catch {}
    if (!alive()) return;
    if (BRIEF) {
      BRIEF_STR = `Competitors: ${BRIEF.competitors.map(c => `${c.name}${c.price ? ` (${c.price})` : ''}`).join(', ') || 'unknown'}. Known pain points: ${BRIEF.painPoints.join('; ')}. Trends: ${BRIEF.trends.join('; ')}.`;
      const comp = BRIEF.competitors.map(c => ({name: c.name, p: parseFloat(String(c.price || '').match(/£\s?(\d+(?:\.\d+)?)/)?.[1])})).filter(c => Number.isFinite(c.p) && c.p <= 40);
      COMPETITORS.length = 0; COMPETITORS.push(...comp.slice(0, 3));
    }
    const uniq = [...new Set(domains)];
    const fv = uniq.slice(0, 6).map(d => `<img class="fav" src="https://www.google.com/s2/favicons?domain=${d}&sz=32" alt="" title="${esc(d)}">`).join('');
    const names = BRIEF?.competitors?.slice(0, 2).map(c => `${esc(c.name)}${c.price ? ` ${esc(c.price)}` : ''}`).join(', ');
    s1.innerHTML = `${TICK}<span>Searched the market</span><span class="favs">${fv}</span><span class="dim">${domains.length} sources${names ? ` · ${names}` : ''}</span>`;
  } else {
    s1.innerHTML = `${TICK}<span>No market given, skipped web search</span>`;
  }

  // Load the exact personas the server will sample
  try {
    const list = await (await fetch('/api/personas', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({shares: shareMap(), importance: impMap()})})).json();
    list.forEach((q, i) => { const p = personas[i]; if (!p) return; Object.assign(p, {name: q.name, role: q.role, age: q.age, stake: q.stake.replace('_', ' '), pers: q.personality.replace('_', ' '), inc: q.incomeBand, model: q.model, seg: q.segment}); });
  } catch {}
  if (!alive()) return;

  // Crowd
  const s2 = document.createElement('div'); s2.className = 'step'; s2.innerHTML = `<span class="spin"></span>Asking <b>1,000 people</b> across 6 models`; ans.appendChild(s2);
  const card = document.createElement('div'); card.className = 'card item';
  card.innerHTML = `<div class="hd">The crowd${cat === 'ads' ? `<div class="seg" style="margin-left:auto" role="group" aria-label="Colour by"><button type="button" data-m="opinion" aria-pressed="false">Opinion</button><button type="button" data-m="funnel" aria-pressed="true">Click &amp; buy</button></div>` : `<span class="r num" data-reacted>0 / 1,000</span>`}</div>
    <div class="bd"><canvas class="crowd" aria-label="1,000 personas"></canvas><div class="legend" data-legend></div></div>`;
  ans.appendChild(card); scrollEnd();
  run = {canvas: card.querySelector('canvas'), card, colorBy: cat === 'ads' ? 'funnel' : 'opinion'};
  setupCrowd(); legend();
  $$('.seg button', card).forEach(b => b.onclick = () => { run.colorBy = b.dataset.m; $$('.seg button', card).forEach(x => x.setAttribute('aria-pressed', x === b)); retarget(); legend(); });

  const v0 = new Map(); REAL.set(0, v0);
  let done = 0, failed = 0;
  try {
    await sse('/api/crowd', {type: cat === 'pricing' ? 'price' : cat === 'launch' ? 'spec' : 'ad', text, price, shares: shareMap(), importance: impMap(), brief: BRIEF_STR || undefined}, (ev, d) => {
      if (!alive()) return;
      if (ev === 'meter') { meter.calls = d.calls; meter.tokens = d.promptTokens + d.completionTokens; meter.cost = meter.tokens / 1e6 * .3; }
      if (ev === 'batch_failed') failed++;
      if (ev === 'batch_done') {
        done++;
        d.reactions.forEach(r => { const i = pidx(r.personaId); RAW.push(r); v0.set(i, toUI(r, price)); reacted.add(i); });
        retarget();
        const rc = card.querySelector('[data-reacted]'); if (rc) rc.textContent = `${reacted.size} / 1,000`;
      }
    });
  } catch (e) { console.error('[crowdsight] crowd', e); }
  if (!alive()) return;
  s2.innerHTML = `${TICK}<span>${reacted.size.toLocaleString()} people reacted</span><span class="dim">${done} batches · 6 Nebius model families${failed ? ` · ${failed} failed` : ''}</span>`;
  showResult(ans, 0);
  if (!$('#drawer').hidden && $('#drawer').classList.contains('on')) renderDrawer();
}

function legend(){
  const el = run.card.querySelector('[data-legend]');
  el.innerHTML = run.colorBy === 'funnel'
    ? `<span><i class="dot" style="background:#DADAE2"></i>Scrolled past</span><span><i class="dot" style="background:var(--click)"></i>Clicked</span><span><i class="dot" style="background:var(--pos)"></i>Bought</span>`
    : `<span><i class="dot" style="background:var(--neg)"></i>Against</span><span><i class="dot" style="background:var(--mid)"></i>Unsure</span><span><i class="dot" style="background:var(--pos)"></i>For</span>`;
}

function showResult(ans, vi){
  const S = score(vi), price = V[vi].price, base = vi ? score(0) : null;
  const k2 = cat === 'ads' ? [pct(S.ctr) + ' / ' + pct(S.buy), 'Clicked / bought']
    : cat === 'pricing' ? [pct(S.pay), `Would pay £${price}`]
    : cat === 'launch' ? [pct(S.try30), 'Would try in 30 days']
    : [pct(S.pos), 'Are for it'];
  const div = document.createElement('div'); div.className = 'card item';
  div.innerHTML = `<div class="kpis">
      <div class="kpi"><div class="v num">${S.launch.toFixed(1)}</div><div class="k">Launch Score ${base ? `<span class="d">+${(S.launch - base.launch).toFixed(1)}</span>` : ''}</div></div>
      <div class="kpi"><div class="v num">${k2[0]}</div><div class="k">${k2[1]}</div></div>
      <div class="kpi"><div class="v num">${diversity(vi).toFixed(0)}</div><div class="k">Diversity · mono ${monoTxt()}</div></div>
    </div>`;
  ans.appendChild(div);

  if (vi === 0) {
    const body = document.createElement('div'); body.className = 'card item';
    body.innerHTML = `<div class="bd">${catBody(S, vi)}</div>`; ans.appendChild(body);
    requestAnimationFrame(() => $$('.frow .bar i', body).forEach(i => i.style.width = i.dataset.w));
    const ins = document.createElement('div'); ins.className = 'insight item'; ins.innerHTML = insight(S); ans.appendChild(ins);
    const act = document.createElement('div'); act.className = 'actions item';
    act.innerHTML = `<button class="btn brand" type="button" data-a="opt">Optimise it</button><button class="btn" type="button" data-a="det">Details</button><button class="btn" type="button" data-a="be">See all 1,000</button>`;
    ans.appendChild(act);
    act.querySelector('[data-a="opt"]').onclick = () => { act.remove(); optimise(ans); };
    act.querySelector('[data-a="det"]').onclick = () => openDrawer('models');
    act.querySelector('[data-a="be"]').onclick = e => openSheet(e.currentTarget);
  }
  scrollEnd();
}
function catBody(S, vi){
  const price = V[vi].price;
  if (cat === 'ads') {
    const clicked = S.all.filter(r => r.clicked).length, bought = S.all.filter(r => r.bought).length;
    return `<div class="funnel">
      <div class="frow"><span>Saw the ad</span><div class="bar"><i data-w="100%" style="background:#DADAE2"></i></div><span class="n">1,000</span></div>
      <div class="frow"><span>Clicked</span><div class="bar"><i data-w="${clicked/10}%" style="background:var(--click)"></i></div><span class="n">${clicked} <small>${pct(S.ctr)}</small></span></div>
      <div class="frow"><span>Bought</span><div class="bar"><i data-w="${bought/10}%" style="background:var(--pos)"></i></div><span class="n">${bought} <small>${pct(S.buy)}</small></span></div>
    </div>
    <table class="segtbl"><thead><tr><th>Segment</th><th>Clicked</th><th>Bought</th></tr></thead><tbody>${S.segs.map(x => `<tr><td>${x.s.label}</td><td>${pct(x.ctr)}</td><td>${pct(x.buy)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (cat === 'pricing') return demandSVG(S.all, price) + `<table class="segtbl"><thead><tr><th>Segment</th><th>Would pay £${price}</th></tr></thead><tbody>${S.segs.map(x => { const ps = personas.filter(p => p.seg === x.s.id); return `<tr><td>${x.s.label}</td><td>${pct(ps.filter(p => react(p, vi).maxPrice >= price).length / (ps.length||1))}</td></tr>`; }).join('')}</tbody></table>`;
  if (cat === 'launch') return `<div class="funnel">${S.segs.map(x => `<div class="frow"><span style="font-size:12.5px">${x.s.label.split(' ')[0]}</span><div class="bar"><i data-w="${Math.round(x.intent*100)}%" style="background:var(--brand)"></i></div><span class="n">${pct(x.intent)}</span></div>`).join('')}</div>` + objList(S);
  return objList(S) + quotes(vi);
}
function objList(S){
  const o = {}; S.all.forEach(r => { if (r.objection) o[r.objection] = (o[r.objection]||0) + 1; });
  const top = Object.entries(o).sort((a,b) => b[1]-a[1]).slice(0, 3), mx = top[0]?.[1] || 1;
  return `<div><div class="eyebrow" style="margin-bottom:8px">Top objections</div><div class="objs">${top.map(([t,n]) => `<div class="obj"><span>${t}</span><span class="num muted">${n}</span><i style="width:${100*n/mx}%"></i></div>`).join('')}</div></div>`;
}
function quotes(vi){
  const s = personas.filter(p => has(p, vi)).map(p => ({p, r: react(p, vi)})).sort((a,b) => b.r.st - a.r.st);
  if (s.length < 5) return '';
  const a = s[Math.min(4, s.length - 1)], b = [...s].reverse().find(x => x.p.seg === 'skeptic') || s[s.length - 1];
  const q = x => `<div class="quote"><div class="who"><i class="dot" style="background:${MODELS[x.p.model].c}"></i>${esc(x.p.name)} · ${esc(x.p.role)}${x.r.comparedTo ? ` · vs ${esc(x.r.comparedTo)}` : ''}</div>"${esc(x.r.quote)}"</div>`;
  return `<div class="qgrid">${q(a)}${q(b)}</div>`;
}
function insight(S){
  if (LIVE) {
    const o = {}; S.all.forEach(r => { if (r.objection) o[r.objection] = (o[r.objection]||0) + 1; });
    const top = Object.entries(o).sort((a,b) => b[1]-a[1])[0];
    const lead = cat === 'ads' ? `${pct(S.ctr)} would click and ${pct(S.buy)} would buy.` : cat === 'pricing' ? `${pct(S.pay)} would pay £${V[0].price}.` : cat === 'launch' ? `${pct(S.try30)} would try it within 30 days.` : `${pct(S.pos)} are for it and ${pct(S.neg)} against.`;
    return `${lead} <span>${top ? `Top objection: "${esc(top[0])}".` : ''}</span>`;
  }
  if (cat === 'ads') return `${pct(S.ctr)} clicked but only ${pct(S.buy)} bought. <span>The last line loses skeptics and marketing experts.</span>`;
  if (cat === 'pricing') return `${pct(S.pay)} would pay £${V[0].price}. <span>Target customers cluster just under it.</span>`;
  if (cat === 'launch') return `${pct(S.try30)} would try it within 30 days. <span>Experts doubt the unit economics.</span>`;
  return `${pct(S.pos)} are for it and ${pct(S.neg)} against. <span>"For your benefit" is doing the damage.</span>`;
}
function demandSVG(all, price){
  const W = 640, H = 220, L = 40, B = 28, maxP = 40;
  const x = p => L + p/maxP*(W - L - 12), y = v => 12 + (1 - v/100)*(H - B - 12);
  let d = ''; for (let p = 0; p <= maxP; p++) { const v = 100*all.filter(r => r.maxPrice >= p).length/all.length; d += (p ? 'L' : 'M') + x(p).toFixed(1) + ' ' + y(v).toFixed(1); }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of people who would pay at each price">
    ${[0,25,50,75,100].map(v => `<line x1="${L}" x2="${W-12}" y1="${y(v)}" y2="${y(v)}" stroke="#EEEEF2"/><text x="${L-8}" y="${y(v)+4}" font-size="11" fill="#9A9AA6" text-anchor="end" font-family="Geist Mono, monospace">${v}%</text>`).join('')}
    ${[0,10,20,30,40].map(v => `<text x="${x(v)}" y="${H-8}" font-size="11" fill="#9A9AA6" text-anchor="middle" font-family="Geist Mono, monospace">£${v}</text>`).join('')}
    ${COMPETITORS.map(c => `<line x1="${x(c.p)}" x2="${x(c.p)}" y1="12" y2="${H-B}" stroke="#0EA5A0" stroke-dasharray="3 4"/><text x="${x(c.p)+4}" y="24" font-size="11" fill="#0EA5A0" font-family="Geist, sans-serif">${c.name} £${c.p}</text>`).join('')}
    <path d="${d} L${x(maxP)} ${y(0)} L${x(0)} ${y(0)} Z" fill="rgba(79,70,229,.08)"/><path d="${d}" fill="none" stroke="#4F46E5" stroke-width="2.2"/>
    ${price ? `<line x1="${x(price)}" x2="${x(price)}" y1="12" y2="${H-B}" stroke="#0B0B10" stroke-width="1.5"/><text x="${x(price)+4}" y="${H-B-8}" font-size="11.5" font-weight="600" fill="#0B0B10" font-family="Geist, sans-serif">You · £${price}</text>` : ''}
  </svg>`;
}

/* ---------------- Optimise loop ---------------- */
async function optimise(ans){
  const my = token, alive = () => my === token;
  const s = document.createElement('div'); s.className = 'step item'; s.innerHTML = `<span class="spin"></span>Optimising with <b>${STRONG.split('/')[1]}</b>`; ans.appendChild(s);
  const loop = document.createElement('div'); loop.className = 'loop'; ans.appendChild(loop);
  let row = null, lastV = 0, summary = null, endReason = '';
  const scores = {};
  try {
    await sse('/api/optimise', {type: cat === 'pricing' ? 'price' : cat === 'launch' ? 'spec' : 'ad', text: V[0].text, price: V[0].price, shares: shareMap(), importance: impMap(), reactions: RAW, brief: BRIEF_STR || undefined}, (ev, d) => {
      if (!alive()) return;
      if (ev === 'meter') { meter.calls = d.calls; meter.tokens = d.promptTokens + d.completionTokens; meter.cost = meter.tokens / 1e6 * .3; }
      if (ev === 'version') {
        scores[d.version] = d.score;
        V[d.version] = {v: d.version, text: d.text, price: d.price, lever: d.lever, reason: d.change, shift: 0};
        if (d.version > 0) {
          const prev = V[d.version - 1]?.text || '';
          if (row) row.innerHTML = `<span class="lv">${esc(d.lever)}</span><div class="txt"><span>${esc(d.change)}</span><span><del>${esc(prev)}</del> <ins>${esc(d.text)}</ins></span></div><span class="sc">${(scores[d.version - 1] ?? 0).toFixed(1)} → <b>${d.score.toFixed(1)}</b></span>`;
          lastV = d.version; curV = d.version; retarget(); row = null;
        }
      }
      if (ev === 'batch_done' && d.phase === 'confirm' && d.iter > 0) {
        if (!REAL.has(d.iter)) REAL.set(d.iter, new Map());
        d.reactions.forEach(r => REAL.get(d.iter).set(pidx(r.personaId), toUI(r, V[d.iter]?.price ?? V[0].price)));
        if (curV !== d.iter) { curV = d.iter; } retarget();
      }
      if (ev === 'proposal') {
        loop.insertAdjacentHTML('beforeend', `<div class="lrow"><span class="lv">${esc(d.lever)}</span><div class="txt"><span>${esc(d.reason)}</span><span class="dim" data-t>Testing 3 variants on the same 200 people…</span></div><span class="sc dim" data-s>…</span></div>`);
        row = loop.lastElementChild; scrollEnd();
      }
      if ((ev === 'variant_done' || ev === 'baseline') && row) {
        const t = row.querySelector('[data-t]'); if (!t) return;
        t.dataset.v = (t.dataset.v || '') + (ev === 'baseline' ? `current ${d.baseline.toFixed(1)} · ` : d.rejected ? `v${d.variant + 1} skipped · ` : `v${d.variant + 1} ${Number(d.score).toFixed(1)} · `);
        t.textContent = t.dataset.v.replace(/ · $/, '');
      }
      if (ev === 'iter_done' && !d.applied && row) {
        row.querySelector('[data-s]').textContent = '—';
        const t = row.querySelector('[data-t]'); if (t) t.textContent += ` · best gain under 2 points, kept the current version`;
        row = null;
      }
      if (ev === 'summary_start') s.innerHTML = `<span class="spin"></span>Writing the final summary from every reaction`;
      if (ev === 'summary') summary = d;
      if (ev === 'loop_done') endReason = d.reason;
    });
  } catch (e) { console.error('[crowdsight] optimise', e); }
  if (!alive()) return;
  const changes = Object.keys(scores).length - 1;
  s.innerHTML = `${TICK}<span>${changes > 0 ? `Optimised in ${changes} change${changes > 1 ? 's' : ''}` : 'Optimiser kept the original'}</span><span class="dim">${esc(endReason)}</span>`;
  curV = lastV; retarget();
  if (lastV > 0) showResult(ans, lastV);
  if (summary) {
    const sm = document.createElement('div'); sm.className = 'card item';
    const li = (xs) => (xs || []).map(x => `<li>${esc(x)}</li>`).join('');
    sm.innerHTML = `<div class="hd">Final summary<span class="r">${esc(summary.verdict)}</span></div>
      <div class="bd">
        <div style="font-size:18px;line-height:1.35;font-weight:600">${esc(summary.headline)}</div>
        ${summary.whatChanged ? `<p class="muted" style="margin:8px 0 0">${esc(summary.whatChanged)}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
          <div><div class="eyebrow" style="margin-bottom:6px">What worked</div><ul style="margin:0;padding-left:18px">${li(summary.worked)}</ul></div>
          <div><div class="eyebrow" style="margin-bottom:6px">Risks</div><ul style="margin:0;padding-left:18px">${li(summary.risks)}</ul></div>
        </div>
        <div class="eyebrow" style="margin:14px 0 6px">Next steps</div><ol style="margin:0;padding-left:18px">${li(summary.nextSteps)}</ol>
        <p class="muted" style="font-size:12px;margin:12px 0 0">Written by ${STRONG.split('/')[1]} from every final reaction. Simulated market response, an early signal.</p>
      </div>`;
    ans.appendChild(sm);
  }
  if (lastV > 0) {
    const fv = document.createElement('div'); fv.className = 'card item';
    fv.innerHTML = `<div class="hd">Version ${lastV}<span class="r">copy to use</span></div><div class="bd" style="font-size:15px">${esc(V[lastV].text)}</div>`;
    ans.appendChild(fv);
  }
  scrollEnd();
  if ($('#drawer').classList.contains('on')) renderDrawer();
}
const applyV1 = t => V[1].from && t.includes(V[1].from) ? t.replace(V[1].from, V[1].to) : `${t} ${V[1].to}`;
const applyV2 = t => { const a = applyV1(t); return V[2].from && a.includes(V[2].from) ? a.split(V[2].from).join(V[2].to) : `${a} ${V[2].to}`; };

/* ---------------- Crowd canvas ---------------- */
let cur = [], tgt = [], crowdLoop = false;
const EMPTY = [237,237,241];
function setupCrowd(){
  cur = personas.map(() => [...EMPTY]); tgt = personas.map(() => [...EMPTY]);
  if (!crowdLoop) { crowdLoop = true; requestAnimationFrame(drawCrowd); }
}
function colorFor(p){
  if (!reacted.has(p.i)) return EMPTY;
  const r = react(p);
  if (run.colorBy === 'funnel') return r.bought ? [18,161,80] : r.clicked ? [47,107,255] : [218,218,226];
  const neg = [229,72,77], mid = [161,161,170], pos = [18,161,80], t = r.st;
  const [a, b, k] = t < 0 ? [mid, neg, Math.min(1, -t*1.4)] : [mid, pos, Math.min(1, t*1.4)];
  return [a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k];
}
function retarget(){ if (!run) return; personas.forEach(p => tgt[p.i] = colorFor(p)); }
function drawCrowd(){
  if (!run || !run.canvas.isConnected) { crowdLoop = false; return; }
  const cv = run.canvas, ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
  const w = cv.clientWidth || 600, cols = 40, gap = w / cols, rows = Math.ceil(personas.length / cols), h = rows * gap;
  if (cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)) { cv.width = w*dpr; cv.height = h*dpr; cv.style.height = h + 'px'; }
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const rad = Math.min(5, gap*.34);
  personas.forEach((p, k) => {
    const c = cur[p.i], g = tgt[p.i]; c[0] += (g[0]-c[0])*.1; c[1] += (g[1]-c[1])*.1; c[2] += (g[2]-c[2])*.1;
    ctx.fillStyle = `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
    ctx.beginPath(); ctx.arc((k % cols + .5)*gap, (Math.floor(k / cols) + .5)*gap, rad, 0, 7); ctx.fill();
  });
  requestAnimationFrame(drawCrowd);
}

/* ---------------- Meter ---------------- */
function tick(tokens, perM){ meter.calls++; meter.tokens += tokens; meter.cost += tokens/1e6*perM; }

/* ---------------- Voice mode (ElevenLabs-style orb) ---------------- */
let vOn = false, vMuted = false, analyser = null, stream = null, rec = null, finalText = '', simTimer = null;
const SIM = () => CATS[cat].text.replace(/£(\d+)/g, '$1 pounds').split(' ');
$('#micBtn').addEventListener('click', startVoice);
$('#muteBtn').addEventListener('click', () => { vMuted = !vMuted; $('#vstate').textContent = vMuted ? 'Muted' : 'Listening'; $('#vdot').style.background = vMuted ? 'var(--neg)' : 'var(--pos)'; stream?.getAudioTracks().forEach(t => t.enabled = !vMuted); });
$('#endBtn').addEventListener('click', endVoice);
async function startVoice(){
  vOn = true; vMuted = false; finalText = ''; $('#voice').classList.add('on'); $('#vtext').innerHTML = '<span class="interim">Pitch your launch out loud.</span>';
  $('#vstate').textContent = 'Listening'; $('#vdot').style.background = 'var(--pos)';
  requestAnimationFrame(drawOrb);
  let live = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser); analyser._ac = ac; live = true;
  } catch { analyser = null; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (live && SR) {
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-GB';
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + t.trim(); else interim += t; }
      $('#vtext').innerHTML = `${esc(finalText)} <span class="interim">${esc(interim)}</span>`; };
    rec.onend = () => { if (vOn) try { rec.start(); } catch {} };
    try { rec.start(); } catch {}
    $('#vnote').textContent = 'Listening through your microphone.';
  } else {
    $('#vnote').textContent = 'Demo voice: microphone not available here, so a sample pitch plays.';
    const words = SIM(); let i = 0;
    simTimer = setInterval(() => { if (!vOn) return clearInterval(simTimer); if (vMuted) return; if (i >= words.length) { clearInterval(simTimer); return; }
      finalText += (finalText ? ' ' : '') + words[i++]; $('#vtext').innerHTML = esc(finalText); }, reduce ? 0 : 160);
  }
}
function endVoice(){
  vOn = false; clearInterval(simTimer);
  try { rec?.stop(); } catch {} rec = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null; try { analyser?._ac?.close(); } catch {} analyser = null;
  $('#voice').classList.remove('on');
  const t = finalText.trim().replace(/(\d+) pounds/g, '£$1');
  if (t) { $('#inp').value = t.endsWith('.') ? t : t + '.'; autosize(); }
  $('#inp').focus();
}
const buf = new Uint8Array(1024);
let ampS = 0;
function drawOrb(now){
  if (!vOn) return;
  const cv = $('#orb'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1, s = cv.clientWidth;
  if (cv.width !== Math.round(s*dpr)) { cv.width = cv.height = s*dpr; }
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,s,s);
  let amp = 0;
  if (analyser && !vMuted) { analyser.getByteTimeDomainData(buf); let r = 0; for (const v of buf) { const x = (v-128)/128; r += x*x; } amp = Math.min(1, Math.sqrt(r/buf.length)*6); }
  else if (!analyser && !vMuted) amp = .35 + .3*Math.sin(now/180)*Math.sin(now/530);
  ampS += (amp - ampS) * .15;
  const c = s/2, R = s*.42*(1 + ampS*.06);
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI*2); ctx.clip();
  const layers = [[now/4200, ['#2792DC','#9CE6E6','#FFFFFF','#2792DC','#1B4FD8','#9CE6E6','#2792DC'], 1],
                  [-now/3100 + 1, ['rgba(79,70,229,0)','rgba(79,70,229,.55)','rgba(156,230,230,0)','rgba(39,146,220,.5)','rgba(79,70,229,0)'], .9],
                  [now/2300 + 2, ['rgba(255,255,255,0)','rgba(255,255,255,.7)','rgba(255,255,255,0)','rgba(156,230,230,.6)','rgba(255,255,255,0)'], .6 + ampS*.4]];
  for (const [a, cols, alpha] of layers) {
    let g;
    if (ctx.createConicGradient) { g = ctx.createConicGradient(a, c, c); cols.forEach((col, i) => g.addColorStop(i/(cols.length-1), col)); }
    else { g = ctx.createLinearGradient(0, 0, s, s); cols.forEach((col, i) => g.addColorStop(i/(cols.length-1), col)); }
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }
  ctx.globalAlpha = 1;
  const rg = ctx.createRadialGradient(c, c, R*.1, c, c, R); rg.addColorStop(0, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, s, s); ctx.restore();
  ctx.beginPath(); ctx.arc(c, c, R + 6 + ampS*10, 0, Math.PI*2); ctx.strokeStyle = `rgba(39,146,220,${.08 + ampS*.18})`; ctx.lineWidth = 2; ctx.stroke();
  requestAnimationFrame(drawOrb);
}

/* ---------------- Details drawer ---------------- */
let dtab = 'models';
function openDrawer(t){ dtab = t; $('#drawer').classList.add('on'); renderDrawer(); }
function closeDrawer(){ $('#drawer').classList.remove('on'); }
$('#detailsBtn').addEventListener('click', () => $('#drawer').classList.contains('on') ? closeDrawer() : openDrawer(dtab));
$('#dclose').addEventListener('click', closeDrawer);
$('#dtabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { dtab = b.dataset.t; renderDrawer(); } });
function renderDrawer(){
  $$('#dtabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === dtab));
  const P = $('#dpane'), has = reacted.size > 0;
  if (!has) { P.innerHTML = `<div class="muted">Run a test to see how each model, segment and price behaves.</div>`; return; }
  const S = score();
  if (dtab === 'models') {
    P.innerHTML = `<div class="toggle"><span><b>Crowd mode</b><br><span class="muted" style="font-size:12.5px">Diversity: mixed ${diversity(curV).toFixed(0)} · mono ${monoTxt()}</span></span>
      <div class="seg" role="group" aria-label="Crowd mode"><button type="button" data-m="0" aria-pressed="${!mono}">Mixed</button><button type="button" data-m="1" aria-pressed="${mono}">Mono</button></div></div>
      <div class="muted" style="font-size:12.5px">One model agrees with itself. Six families disagree like a real market. Mono recolours the crowd with a single model.</div>` +
      MODELS.map((m, mi) => { const rs = personas.filter(p => p.model === mi).map(p => react(p)); const n = rs.length || 1;
        const neg = rs.filter(r => r.st < -.15).length, pos = rs.filter(r => r.st > .25).length;
        return `<div class="mrow"><i class="dot" style="background:${m.c};width:10px;height:10px"></i><b>${m.fam}</b><span class="num muted" style="font-size:12px">${rs.length} people · ${m.lat.toFixed(1)}s</span>
          <span class="id">${m.id}</span><div class="sbar" style="grid-column:1/-1"><i style="width:${100*neg/n}%;background:var(--neg)"></i><i style="width:${100*(n-neg-pos)/n}%;background:#D4D4DB"></i><i style="width:${100*pos/n}%;background:var(--pos)"></i></div></div>`; }).join('') +
      `<div class="mrow"><i class="dot" style="background:var(--ink);width:10px;height:10px"></i><b>Optimiser + market brief</b><span></span><span class="id">${STRONG}</span></div>`;
    $$('.seg button', P).forEach(b => b.onclick = () => { mono = b.dataset.m === '1'; retarget(); renderDrawer(); });
  } else if (dtab === 'segments') {
    P.innerHTML = `<div class="toggle"><b>Launch Score</b><span class="num" style="font-size:20px;font-weight:700">${S.launch.toFixed(1)}</span></div>` +
      SEGS.map((s, i) => `<div class="sgc"><div class="hd2"><span>${s.label}</span><span class="num">${S.segs[i].score.toFixed(1)}</span></div>
        <input type="range" min="0" max="80" value="${weights[s.id].share}" id="w-${s.id}" aria-label="${s.label} share">
        <div class="row"><span class="num">${weights[s.id].share}% of the crowd</span><span class="imp">${[1,1.5,2].map(v => `<button type="button" data-s="${s.id}" data-v="${v}" aria-pressed="${weights[s.id].imp === v}">×${v}</button>`).join('')}</span></div></div>`).join('') +
      `<div class="muted" style="font-size:12.5px">Weights change the blended score now. Run again to resample the crowd at this mix.</div>`;
    SEGS.forEach(s => $('#w-' + s.id).oninput = e => rebalance(s.id, +e.target.value));
    $$('.imp button', P).forEach(b => b.onclick = () => { weights[b.dataset.s].imp = +b.dataset.v; renderDrawer(); });
  } else if (dtab === 'marketing') {
    P.innerHTML = `<div class="toggle"><span>Clicked</span><b class="num">${pct(S.ctr)}</b></div><div class="toggle"><span>Bought</span><b class="num">${pct(S.buy)}</b></div>
      <table class="segtbl"><thead><tr><th>Segment</th><th>Clicked</th><th>Bought</th></tr></thead><tbody>${S.segs.map(x => `<tr><td>${x.s.label}</td><td>${pct(x.ctr)}</td><td>${pct(x.buy)}</td></tr>`).join('')}</tbody></table>
      <div class="muted" style="font-size:12.5px">A persona clicks if the ad grabs them and buys only if they also want it and can afford the price.</div>`;
  } else {
    const price = V[curV].price || 14;
    P.innerHTML = `<div class="toggle"><span>Would pay £${price}</span><b class="num">${pct(S.all.filter(r => r.maxPrice >= price).length / S.all.length)}</b></div>${demandSVG(S.all, price)}
      <div class="muted" style="font-size:12.5px">Each persona names the most they would pay per month. Dashed lines are competitor prices from the market search.</div>`;
  }
}
function rebalance(id, v){
  const others = SEGS.filter(s => s.id !== id), rest = others.reduce((a, s) => a + weights[s.id].share, 0) || 1;
  weights[id].share = v; others.forEach(s => weights[s.id].share = Math.round(weights[s.id].share / rest * (100 - v)));
  weights[others[0].id].share += 100 - SEGS.reduce((a, s) => a + weights[s.id].share, 0);
  renderDrawer(); $('#w-' + id)?.focus();
}

/* ---------------- Backend sheet ---------------- */
SEGS.forEach(s => $('#fseg').insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.label}</option>`));
MODELS.forEach((m, i) => $('#fmod').insertAdjacentHTML('beforeend', `<option value="${i}">${m.fam}</option>`));
let sel = -1;
$('#beBtn').addEventListener('click', e => openSheet(e.currentTarget));
$('#sheetClose').addEventListener('click', () => $('#sheet').classList.remove('on'));
addEventListener('keydown', e => { if (e.key === 'Escape') { $('#sheet').classList.remove('on'); closeDrawer(); if (vOn) endVoice(); } });
['#fq','#fseg','#fmod','#fout'].forEach(s => $(s).addEventListener('input', renderTable));
$('#tbody').addEventListener('click', e => { const tr = e.target.closest('tr'); if (!tr) return; sel = +tr.dataset.i; $$('#tbody tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); renderInspect(); });
function openSheet(btn){
  if (!V.length) makeVersions(CATS[cat].text, CATS[cat].price ? 14 : null);
  const r = btn.getBoundingClientRect(), sh = $('#sheet');
  sh.style.setProperty('--rx', (r.left + r.width/2) + 'px'); sh.style.setProperty('--ry', (r.top + r.height/2) + 'px');
  $('#pipe').innerHTML = [['Tavily','Market search',`${meter.searches} searches · ${meter.sources} sources`],['Nebius','Market brief',STRONG.split('/')[1]],['Nebius','Crowd','6 families · 25 per call'],['Code','Score','segments × importance'],['Nebius','Optimiser','one lever, 3 variants'],['Usage','Meter',`${meter.calls} calls · $${meter.cost.toFixed(3)}`]]
    .map(n => `<div class="pn"><small>${n[0]}</small><b>${n[1]}</b><span>${n[2]}</span></div>`).join('');
  $('#meterTxt').textContent = `${(meter.tokens/1000).toFixed(0)}k tokens`;
  renderTable(); renderInspect(); sh.classList.add('on'); $('#sheetClose').focus();
}
function renderTable(){
  const q = $('#fq').value.toLowerCase(), sg = $('#fseg').value, md = $('#fmod').value, out = $('#fout').value;
  const rows = personas.filter(p => {
    if (sg && p.seg !== sg) return false; if (md !== '' && p.model !== +md) return false;
    const r = react(p), has = reacted.has(p.i);
    if (out && (!has || (out === 'bought' ? !r.bought : out === 'clicked' ? !(r.clicked && !r.bought) : r.clicked))) return false;
    if (q && !(p.name + ' ' + p.role + ' ' + (has ? r.quote : '')).toLowerCase().includes(q)) return false;
    return true;
  });
  $('#fcount').textContent = `${rows.length.toLocaleString()} of ${personas.length.toLocaleString()}`;
  $('#tbody').innerHTML = rows.map(p => {
    const has = reacted.has(p.i), r = react(p), m = MODELS[mono ? 0 : p.model];
    const sc = r.st < -.15 ? 'var(--neg)' : r.st > .25 ? 'var(--pos)' : 'var(--muted)';
    return `<tr data-i="${p.i}" class="${p.i === sel ? 'sel' : ''}"><td><b style="font-weight:600">${p.name}</b><div class="dim" style="font-size:12px">${p.age} · ${p.role}</div></td>
      <td>${SEGS.find(s => s.id === p.seg).label}</td><td><span style="display:inline-flex;gap:6px;align-items:center"><i class="dot" style="background:${m.c}"></i>${m.fam}</span></td>
      <td class="num" style="color:${has ? sc : 'var(--dim)'}">${has ? r.st.toFixed(2) : 'pending'}</td>
      <td>${has ? (r.clicked ? '<span class="badge" style="background:#E8EFFF;color:var(--click)">Yes</span>' : '<span class="dim">No</span>') : ''}</td>
      <td>${has ? (r.bought ? '<span class="badge" style="background:#E7F7EE;color:var(--pos)">Yes</span>' : '<span class="dim">No</span>') : ''}</td>
      <td class="num">${has ? '£' + r.maxPrice : ''}</td><td class="q">${has ? '"' + esc(r.quote) + '"' : ''}</td></tr>`;
  }).join('');
}
function renderInspect(){
  const el = $('#inspect');
  if (sel < 0 || !personas[sel]) { el.innerHTML = `<div class="eyebrow">Persona</div><div class="muted">Pick a row to see the exact card a model received and the JSON it sent back.</div><div class="eyebrow">One request, abridged</div><pre><span class="k1">POST</span> /v1/chat/completions
model: ${MODELS[0].id}
response_format: json_object

Simulate these 25 people independently.
They live in this market: GymFlex £10/mo,
PulsePass £16/mo. Pain: cancellation fees.
Return one JSON object per person.</pre>`; return; }
  const p = personas[sel], r = react(p), m = MODELS[mono ? 0 : p.model], has = reacted.has(p.i);
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><i class="dot" style="background:${m.c};width:10px;height:10px"></i><b style="font-size:16px">${p.name}</b></div>
    <div class="eyebrow">Card sent to ${m.fam}</div><pre>${p.name}, ${p.age}, ${p.inc} income
role: ${p.role}
stake: ${p.stake} · ${p.pers}
segment: ${SEGS.find(s => s.id === p.seg).label}</pre>
    <div class="eyebrow">Returned</div>${has ? `<pre>{
  <span class="k1">"stance"</span>: <span class="k3">${r.st.toFixed(2)}</span>,
  <span class="k1">"quote"</span>: <span class="k2">"${esc(r.quote)}"</span>,
  <span class="k1">"clicked"</span>: <span class="k3">${r.clicked}</span>,
  <span class="k1">"bought"</span>: <span class="k3">${r.bought}</span>,
  <span class="k1">"intent"</span>: <span class="k3">${r.intent.toFixed(2)}</span>,
  <span class="k1">"maxPrice"</span>: <span class="k3">${r.maxPrice}</span>,
  <span class="k1">"objection"</span>: ${r.objection ? `<span class="k2">"${r.objection}"</span>` : 'null'}
}</pre>` : '<div class="muted">Run a test first.</div>'}<div class="eyebrow">Model</div><pre>${m.id}</pre>`;
}

/* ---------------- Hero crowd field ---------------- */
function heroField(){
  const cv = $('#field'); if (!cv) return; const ctx = cv.getContext('2d'); const r = rng(7);
  const dots = Array.from({length: 1000}, () => ({x: r(), y: r(), p: r()*Math.PI*2, s: r()*2-1}));
  function frame(t){
    const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)) { cv.width = w*dpr; cv.height = h*dpr; }
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const cols = Math.ceil(Math.sqrt(1000 * w / h)), gap = w / cols;
    dots.forEach((d, k) => {
      const x = (k % cols + .5) * gap, y = (Math.floor(k / cols) + .5) * gap; if (y > h) return;
      const wave = Math.sin(x*.012 + t/1600) + Math.cos(y*.016 - t/2100) + d.s*1.2;
      const c = wave > 1.25 ? '18,161,80' : wave < -1.35 ? '229,72,77' : '11,11,16';
      const a = c === '11,11,16' ? .07 : .5 + .3*Math.sin(t/700 + d.p);
      ctx.fillStyle = `rgba(${c},${a})`; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
    });
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
['#heroCta', '#navCta'].forEach(s => $(s)?.addEventListener('click', () => setTimeout(() => $('#inp').focus({preventScroll: true}), 700)));

/* ---------------- Boot ---------------- */
setCat('general'); $('#composerSlot').appendChild($('#composer')); heroField();
})();
