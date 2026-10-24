/* Crowdsight front end. Runs on a deterministic simulated engine so it demos anywhere.
   To go live, swap simulateRun() for the /api/crowd + /api/optimise SSE streams (see README). */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = x => `${Math.round(x * 100)}%`;
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/* ---------------- Config ---------------- */
const MODELS = [
  {fam:'Qwen', id:'Qwen/Qwen3-30B-A3B-Instruct-2507', bias:.05},
  {fam:'Gemma', id:'google/gemma-3-27b-it', bias:-.02},
  {fam:'DeepSeek', id:'deepseek-ai/DeepSeek-V4.1-Flash-1017', bias:-.09},
  {fam:'gpt-oss', id:'openai/gpt-oss-120b', bias:.01},
  {fam:'MiniMax', id:'MiniMaxAI/MiniMax-M3.1-Flash', bias:.08},
  {fam:'Hermes', id:'NousResearch/Hermes-4-405B', bias:-.05},
];
const SEGS = [
  {id:'general', label:'General population', short:'General', c:'#A1A1AA', base:-.04, sens:1, imp:1},
  {id:'icp', label:'Target customers', short:'Target', c:'#4F46E5', base:.2, sens:1.25, imp:2},
  {id:'expert', label:'Domain experts', short:'Experts', c:'#0EA5A0', base:-.02, sens:.8, imp:1.5},
  {id:'marketing', label:'Marketing experts', short:'Marketing', c:'#E39A0B', base:.04, sens:1.1, imp:1},
  {id:'skeptic', label:'Skeptics & loyalists', short:'Skeptics', c:'#E5484D', base:-.46, sens:.55, imp:1},
];
const MODES = {
  general: {label:'General', desc:'Opinion, objections and quotes', title:'What are you launching?', shares:{general:50, icp:22, expert:12, marketing:8, skeptic:8},
    text:"Meet Loop: the London gym you only pay for when you go. £14/mo gets you 8 visits, a monthly 1:1 coaching session and priority booking. We've raised our prices for your benefit."},
  ads: {label:'Ads', desc:'Who clicks, and who buys', title:'Who clicks, and who buys?', shares:{general:45, icp:20, expert:5, marketing:20, skeptic:10},
    text:"Only pay for the gym when you actually go. Loop: 8 visits, a monthly 1:1 coach and priority booking for £14/mo. We've raised our prices for your benefit."},
  pricing: {label:'Pricing', desc:'The price people will pay', title:'Find the price people will pay', shares:{general:35, icp:35, expert:15, marketing:5, skeptic:10},
    text:"Loop is moving from £9/mo to £14/mo. The new price adds a monthly 1:1 coaching session and priority booking at peak times."},
  launch: {label:'Product launch', desc:'Who tries it in 30 days', title:'Launch something new', shares:{general:30, icp:25, expert:30, marketing:5, skeptic:10},
    text:"Loop Teams: a pay-per-visit gym plan for companies. Employers buy visit credits at £14 per person a month, staff book any Loop site, and there are no contracts."},
};
const CHAT_COLORS = ['#4F46E5','#0EA5A0','#E39A0B','#E5489B','#2F80ED','#65A30D','#E5484D','#7C3AED'];
const STAKES = {general:['prospect'], icp:['customer','prospect'], expert:['expert','partner','investor'], marketing:['marketer'], skeptic:['critic','competitor user']};
const ROLES = {
  general:['student nurse','retail assistant','teacher','delivery driver','accountant','barista','civil servant','electrician','junior lawyer','care worker','pharmacist','bus driver','graphic designer','university student','chef','plumber'],
  icp:['shift worker who trains twice a week','new parent getting back to fitness','freelancer with an irregular week','runner who lifts in winter','consultant who travels Mon–Thu','lapsed gym member'],
  expert:['gym franchise owner','personal trainer','fitness-tech product lead','seed-stage VC','leisure industry analyst','physiotherapist'],
  marketing:['growth marketer','brand strategist','performance ad buyer','agency creative director','social media lead'],
  skeptic:['GymFlex member of 4 years','consumer-rights blogger','budget-gym loyalist','ex-member who hit cancellation fees'],
};
const PERS = ['early adopter','pragmatist','skeptic','price-sensitive','status seeker'];
const FIRST = ['Priya','Tom','Aisha','Jack','Mei','Oliver','Zara','Kwame','Sophie','Liam','Fatima','Dan','Elena','Ravi','Grace','Sam','Nadia','Ben','Chloe','Arjun','Hannah','Luca','Amara','Josh','Yuki','Ella','Omar','Ruth','Felix','Leah'];
const LAST = ['Shah','Evans','Okafor','Hughes','Chen','Patel','Wright','Mensah','Clarke','Nowak','Ali','Murphy','Rossi','Kaur','Bennett','Ibrahim','Fischer','Doyle','Haddad','Tanaka'];
const INCOME = {low:9, mid:16, high:30};
const Q = {
  pos:['Pay per visit is exactly how I actually use a gym.','No contract and a coaching slot? I would try it next week.','This kills the guilt of paying for months I skip.','I would send this to my running club.'],
  neu:['Interesting, but I need to see the locations first.','Depends how many sites are near my office.','Decent idea. I would wait for reviews.'],
  neg:['£14 for a gym I visit twice a month? No.','Sounds like every other subscription trap.','GymFlex is £10 and has more sites.','"For your benefit" means it is for yours.'],
  expert:['Pay-per-visit economics get tight past three visits a week.','Retention depends on coaching slots actually being bookable.'],
  marketing:['Strong hook. The last line reads defensive and will hurt click-through.','Lead with "only pay when you go", not the price.'],
};
const OBJ = ['Too expensive for occasional use','"For your benefit" feels dishonest','Worried about cancellation terms','GymFlex is cheaper with more sites','Unclear what happens after 8 visits'];

/* ---------------- Chats & state ---------------- */
let chats = [], active = null, seq = 0, draftMode = 'general';
let draftShares = {...MODES.general.shares};
let chips = []; // composer attachments: {kind:'file'|'ref', name, id?, color?}

function newChatObj(mode){
  const id = 'c' + (++seq);
  return {id, title: 'New chat', color: CHAT_COLORS[(seq - 1) % CHAT_COLORS.length], mode, shares: {...draftShares}, started: false,
    text: '', price: null, msgs: [], refs: [], applied: [], selSeg: null, selPersona: null, pmsgs: {}, personas: []};
}

/* ---------------- Engine (simulated) ---------------- */
function buildPersonas(c){
  const r = rng(hash(c.mode + JSON.stringify(c.shares))); const out = []; let i = 0;
  SEGS.forEach(s => { const n = Math.round(c.shares[s.id] * 10);
    for (let k = 0; k < n; k++) { const inc = r() < .3 ? 'low' : r() < .75 ? 'mid' : 'high';
      out.push({i:i++, seg:s.id, name:`${FIRST[Math.floor(r()*FIRST.length)]} ${LAST[Math.floor(r()*LAST.length)]}`, age:Math.round(19 + r()*48),
        role:ROLES[s.id][Math.floor(r()*ROLES[s.id].length)], stake:STAKES[s.id][Math.floor(r()*STAKES[s.id].length)], pers:PERS[Math.floor(r()*PERS.length)],
        inc, model:i % 6, n1:r()*2-1, n2:r()*2-1, n3:r()*2-1, n4:r(), q:r(), o:r(), c1:r(), c2:r()}); } });
  return out;
}
function shiftOf(c){ return c.applied.reduce((a, x) => a + x.shift, 0); }
function priceOf(c){ const p = c.applied.filter(x => x.price != null).pop(); return p ? p.price : c.price; }
function react(c, p, extra = 0){
  if (c.live) { const r = c.live.get(p.id), price = priceOf(c) ?? 0;
    if (!r) return {st:0, intent:0, share:0, maxPrice:0, clicked:false, bought:false, quote:'', objection:null, pending:true};
    const st = clamp(+r.stance || 0, -1, 1), intent = clamp(+r.intent || 0, 0, 1), share = clamp(+r.wouldShare || 0, 0, 1), maxPrice = r.maxPrice == null ? 0 : +r.maxPrice;
    const clicked = share*.6 + Math.max(0, st)*.4 > .42, bought = clicked && intent > .55 && (!price || maxPrice >= price);
    return {st, intent, share, maxPrice, clicked, bought, quote: r.quote || '', objection: r.objection || null, comparedTo: r.comparedTo || null, model: r.model}; }
  const s = SEGS.find(x => x.id === p.seg), m = MODELS[p.model], sh = shiftOf(c) + extra, price = priceOf(c) ?? 0, cut = c.price && price < c.price;
  const st = clamp(s.base + m.bias + p.n1*.58 + sh*s.sens + (p.pers === 'price-sensitive' ? (cut ? .14 : -.1) : 0), -1, 1);
  const intent = clamp((st+1)/2*.92 + p.n2*.14, 0, 1), share = clamp((st+.55)/2 + p.n3*.14, 0, 1);
  const maxPrice = Math.max(0, Math.round(INCOME[p.inc] * (.55 + p.n4*.75) * (1 + st*.3)));
  const clicked = p.c1 < clamp(.03 + .5*Math.max(0, share - .25) + .25*Math.max(0, st) + sh*.12, 0, .85);
  const bought = clicked && intent > .5 && maxPrice >= price && p.c2 < .8;
  let pool = st > .25 ? Q.pos : st < -.15 ? Q.neg : Q.neu;
  if (p.seg === 'expert' && p.q < .5) pool = Q.expert;
  if (p.seg === 'marketing' && p.q < .5 && sh < .1) pool = Q.marketing;
  return {st, intent, share, maxPrice, clicked, bought, quote: pool[Math.floor(p.q * pool.length)], objection: st < .15 ? OBJ[Math.floor(p.o * 5)] : null};
}
function summarise(c, extra = 0){
  const all = c.personas.map(p => ({p, r: react(c, p, extra)})).filter(x => !x.r.pending), price = priceOf(c);
  const segs = SEGS.map(s => { const rs = all.filter(x => x.p.seg === s.id).map(x => x.r), n = rs.length || 1;
    const sc = 100 * (.5*rs.reduce((a,r)=>a+(r.st+1)/2,0)/n + .35*rs.reduce((a,r)=>a+r.intent,0)/n + .15*rs.reduce((a,r)=>a+r.share,0)/n);
    const objs = {}; rs.forEach(r => { if (r.objection) objs[r.objection] = (objs[r.objection]||0) + 1; });
    const mx = [...rs.map(r => r.maxPrice)].sort((a,b)=>a-b);
    return {s, n: rs.length, score: sc, pos: rs.filter(r=>r.st>.25).length/n, neg: rs.filter(r=>r.st<-.15).length/n,
      ctr: rs.filter(r=>r.clicked).length/n, buy: rs.filter(r=>r.bought).length/n, pay: price ? rs.filter(r=>r.maxPrice>=price).length/n : 0,
      med: mx[Math.floor(mx.length/2)] || 0, try30: rs.filter(r=>r.intent>.6).length/n, obj: Object.entries(objs).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—'}; });
  let num = 0, den = 0; segs.forEach(x => { if (!x.n) return; const w = c.shares[x.s.id] * x.s.imp; num += w*x.score; den += w; });
  const rs = all.map(x => x.r), N = rs.length || 1;
  return {launch: den ? num/den : 0, segs, all, price, ctr: rs.filter(r=>r.clicked).length/N, buy: rs.filter(r=>r.bought).length/N,
    pay: price ? rs.filter(r=>r.maxPrice>=price).length/N : 0, try30: rs.filter(r=>r.intent>.6).length/N,
    pos: rs.filter(r=>r.st>.25).length/N, neg: rs.filter(r=>r.st<-.15).length/N};
}
function adviceFor(c){
  const t = c.text, benefit = /for your benefit/i.test(t), price = c.price;
  const list = [];
  if (benefit) list.push({id:'a1', lever:'message', title:'Cut "for your benefit"', why:'Skeptics and target customers read it as defensive. It is the most-cited reason for disliking the pitch.', shift:.12});
  list.push({id:'a2', lever:'message', title:'Lead with "cancel anytime, first visit free"', why:'Cancellation fear is the top objection after price. Removing the risk lifts intent across every segment.', shift:.1});
  if (price) list.push({id:'a3', lever:'price', title:`Test £${price - 2}/mo`, why:`38% of target customers cap out just under £${price}, and GymFlex anchors at £10.`, shift:.09, price: price - 2});
  if (c.mode === 'ads') list.push({id:'a4', lever:'channel', title:'Aim the ad at target customers on Instagram', why:'Target customers click 2× more than the general population. Marketing experts flag the current creative as too wordy.', shift:.05});
  if (c.mode === 'launch') list.push({id:'a5', lever:'spec', title:'Add a 4-visit starter tier', why:'Domain experts doubt the unit economics; a smaller tier lowers the risk of trying it.', shift:.06});
  if (c.mode === 'general' || c.mode === 'pricing') list.push({id:'a6', lever:'spec', title:'Say what happens after 8 visits', why:'"Unclear what happens on visit 9" appears in 1 in 8 objections.', shift:.04});
  return list;
}

/* ---------------- Live backend (Nebius + Tavily via the Next.js API) ---------------- */
let LIVE = null;
async function isLive(){ if (LIVE !== null) return LIVE; try { const r = await fetch('/api/status', {cache:'no-store'}); const j = await r.json(); LIVE = !!j.ok && !j.mock; } catch { LIVE = false; } return LIVE; }
const TYPE = {general:'ad', ads:'ad', pricing:'price', launch:'spec'};
async function sse(url, body, on){
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const {value, done} = await rd.read(); if (done) break; buf += dec.decode(value, {stream:true});
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(chunk)?.[1], data = /^data: (.*)$/m.exec(chunk)?.[1]; if (ev && data) { let d; try { d = JSON.parse(data); } catch { continue; } on(ev, d); } } }
}
async function post(url, body){ const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); return r.json(); }
const briefText = b => b ? `Competitors: ${(b.competitors||[]).map(x => `${x.name}${x.price ? ` (${x.price})` : ''}`).join(', ') || 'unknown'}. Known pain points: ${(b.painPoints||[]).join('; ')}. Trends: ${(b.trends||[]).join('; ')}.` : '';
function mapPersonas(list){ return list.map((p, i) => ({id:p.id, i, seg:p.segment, name:p.name, age:p.age, role:p.role, stake:(p.stake||'').replace('_',' '), pers:(p.personality||'').replace('_',' '), inc:p.incomeBand, model:p.model})); }
async function runCrowdLive(c, text, onBatch){
  const live = new Map(); let done = 0;
  await sse('/api/crowd', {type: TYPE[c.mode], text, price: c.price, shares: c.shares, brief: c.briefTxt}, (ev, d) => {
    if (ev === 'batch_done') { (d.reactions || []).forEach(r => live.set(r.personaId, r)); done++; onBatch?.(done, live.size, d.model, live); }
  });
  return live;
}
function contextFor(c){
  const S = summarise(c); const o = {}; S.all.forEach(x => { if (x.r.objection) o[x.r.objection] = (o[x.r.objection]||0) + 1; });
  return `MODE: ${MODES[c.mode].label}\nPITCH: ${c.text}\nPRICE: ${S.price ? '£' + S.price + '/mo' : 'none'}\nMARKET: ${c.briefTxt || 'n/a'}\nLAUNCH SCORE: ${S.launch.toFixed(1)}\nFOR ${pct(S.pos)} AGAINST ${pct(S.neg)} CLICKED ${pct(S.ctr)} BOUGHT ${pct(S.buy)} WOULD PAY ${pct(S.pay)}\nSEGMENTS: ${S.segs.map(x => `${x.s.label} score ${x.score.toFixed(1)}, for ${pct(x.pos)}, against ${pct(x.neg)}, median max £${x.med}, top objection: ${x.obj}`).join(' | ')}\nTOP OBJECTIONS: ${Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n]) => `${k} (${n})`).join('; ')}\nSAMPLE QUOTES: ${S.all.filter((_, i) => i % 25 === 0).map(x => `"${x.r.quote}"`).join(' ')}${(c.refs||[]).length ? `\nREFERENCED CHATS: ${c.refs.map(r => { const rc = chats.find(x => x.id === r.id); return rc ? `${rc.title} (pitch: ${rc.text})` : r.name; }).join('; ')}` : ''}`;
}
async function liveAdvice(c){
  const q = `Suggest exactly 3 concrete changes to this pitch that would most raise the weighted Launch Score. Output exactly 3 lines, each formatted as: LEVER | short title | one-sentence reason citing the data. LEVER is one of message, price, spec, channel. No other text.`;
  const r = await post('/api/ask', {question: q, context: contextFor(c), history: []});
  const lines = String(r.reply || '').split('\n').map(l => l.replace(/^\s*[\d\-\*\.\)]+\s*/, '').trim()).filter(l => l.includes('|'));
  return lines.slice(0, 3).map((l, i) => { const [lever, title, why] = l.split('|').map(x => x.trim()); return {id:'L' + i, lever:(lever||'message').toLowerCase(), title: title || l, why: why || ''}; });
}

/* ---------------- Rendering: chat column ---------------- */
function renderChats(){
  const list = $('#chatList');
  list.innerHTML = chats.map(c => `<div class="w-chat" draggable="true" data-id="${c.id}" aria-current="${active && c.id === active.id}" title="${esc(c.title)}" tabindex="0">
    <span class="c" style="background:${c.color};color:${c.color}"></span><b>${esc(c.title)}</b><span class="meta">${MODES[c.mode].label}</span></div>`).join('') || '<span class="w-empty" style="padding:6px 10px">No chats yet.</span>';
}
$('#chatList').addEventListener('click', e => { const el = e.target.closest('.w-chat'); if (el && !e.target.closest('input')) openChat(el.dataset.id); });
$('#chatList').addEventListener('keydown', e => { const el = e.target.closest('.w-chat'); if (el && e.key === 'Enter') openChat(el.dataset.id); });
$('#chatList').addEventListener('dragstart', e => { const el = e.target.closest('.w-chat'); if (el) { e.dataTransfer.setData('text/x-chat', el.dataset.id); e.dataTransfer.effectAllowed = 'copy'; } });
let ctxId = null;
$('#chatList').addEventListener('contextmenu', e => {
  const el = e.target.closest('.w-chat'); if (!el) return; e.preventDefault(); ctxId = el.dataset.id;
  const ws = $('#ws').getBoundingClientRect(), m = $('#ctx'); m.hidden = false;
  m.style.left = Math.min(e.clientX - ws.left, ws.width - 210) + 'px'; m.style.top = (e.clientY - ws.top) + 'px';
});
$('#ctx').addEventListener('click', e => {
  const a = e.target.closest('button')?.dataset.a; const c = chats.find(x => x.id === ctxId); $('#ctx').hidden = true; if (!c) return;
  if (a === 'delete') { chats = chats.filter(x => x !== c); if (active === c) { active = null; startDraft(); } renderChats(); }
  if (a === 'ref') addRefChip(c);
  if (a === 'rename') { const el = $(`.w-chat[data-id="${c.id}"] b`); if (!el) return; if ($('#ws').classList.contains('col')) toggleChats();
    const inp = document.createElement('input'); inp.value = c.title; el.replaceWith(inp); inp.focus(); inp.select();
    const done = () => { c.title = inp.value.trim() || c.title; renderChats(); }; inp.addEventListener('blur', done); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = c.title; inp.blur(); } }); }
});
document.addEventListener('click', e => {
  if (!e.target.closest('#ctx')) $('#ctx').hidden = true;
  if (!e.target.closest('.w-plus')) $('#plusMenu').hidden = true;
  if (!e.target.closest('#modeBox')) { $('#modeMenu').hidden = true; $('#modeBtn').setAttribute('aria-expanded', 'false'); }
  if (!e.target.closest('#popBox')) { $('#popMenu').hidden = true; $('#popBtn').setAttribute('aria-expanded', 'false'); }
  if (!e.target.closest('#refPick') && !e.target.closest('.w-plusmenu')) $('#refPick').hidden = true;
});
function toggleChats(){ const ws = $('#ws'); ws.classList.toggle('col'); $('#toggleChats').setAttribute('aria-label', ws.classList.contains('col') ? 'Expand chats' : 'Collapse chats'); }
$('#toggleChats').addEventListener('click', toggleChats);
$('#newChat').addEventListener('click', () => startDraft());
$('#userBtn').addEventListener('click', () => toast('Profile and settings: name, default market, default crowd mix, connected keys (Nebius, Tavily).'));
function toast(t){ let el = $('#wtoast'); if (!el) { el = document.createElement('div'); el.id = 'wtoast'; el.style.cssText = 'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;background:#0B0B10;color:#fff;font-size:13px;padding:10px 14px;border-radius:12px;max-width:80%;box-shadow:0 10px 30px rgba(0,0,0,.2);transition:opacity .3s'; $('#ws').appendChild(el); }
  el.textContent = t; el.style.opacity = '1'; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = '0', 2600); }

/* ---------------- Page 1: mode + population ---------------- */
function renderModeMenu(){
  $('#modeMenu').innerHTML = Object.entries(MODES).map(([k, m]) => `<button type="button" role="option" data-m="${k}" aria-selected="${k === draftMode}"><b>${m.label}</b><span>${m.desc}</span></button>`).join('');
}
$('#modeBtn').addEventListener('click', () => { const m = $('#modeMenu'); m.hidden = !m.hidden; $('#modeBtn').setAttribute('aria-expanded', String(!m.hidden)); renderModeMenu(); });
$('#modeMenu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setDraftMode(b.dataset.m); $('#modeMenu').hidden = true; });
function setDraftMode(m){
  draftMode = m; draftShares = {...MODES[m].shares}; $('#modeLabel').textContent = MODES[m].label; $('#heroTitle').textContent = MODES[m].title;
  $('#inp').value = ''; $('#inp').placeholder = PH[m]; autosize(); renderPop(); renderExamples();
}
const PH = {general:'Describe your product or paste your landing copy…', ads:'Paste your ad copy, launch post or tweet…', pricing:'Describe the price change, e.g. £9/mo → £14/mo and what changes…', launch:'Describe the new product or feature you are launching…'};
const EX = {
  general:[['Gym, pay per visit', MODES.general.text], ['AI note-taker for students', 'Scribe: an AI note-taker that turns any lecture recording into revision notes and flashcards. £6/mo for students.'], ['B2B scheduling', 'Shiftly lets restaurant managers build the weekly rota in 5 minutes. Staff swap shifts in the app. £49/mo per site.']],
  ads:[['Gym ad', MODES.ads.text], ['Coffee subscription', 'Fresh beans from small roasters, delivered every two weeks. First bag free, then £11. Skip or cancel anytime.'], ['Fintech app', 'Round up every card payment and invest the change. Most users save £400 in their first year. Free for 3 months.']],
  pricing:[['Gym £9 → £14', MODES.pricing.text], ['SaaS free tier removal', 'We are removing the free tier of Notely. The Starter plan is now £5/mo and includes unlimited notes and sync.'], ['Streaming price rise', 'Our streaming plan goes from £8.99/mo to £10.99/mo next month, adding 4K and two extra screens.']],
  launch:[['Gym for teams', MODES.launch.text], ['Dog-walking app', 'Pawpal: book a vetted local dog walker in under a minute. Live GPS for every walk. £14 per walk.'], ['E-bike rental', 'Glide: monthly e-bike rental for London commuters. £59/mo, includes servicing, theft cover and a lock.']],
};
function renderExamples(){
  const el = $('#examples'); if (!el) return;
  el.innerHTML = EX[draftMode].map(([t], i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join('');
  $$('#examples button').forEach(b => b.onclick = () => { const [, txt] = EX[draftMode][+b.dataset.i]; $('#inp').value = txt; const pm = /£\s?(\d+(?:\.\d+)?)/g; let m, last = null; while ((m = pm.exec(txt))) last = m[1]; if (last) $('#price').value = last; autosize(); $('#inp').focus(); });
}
function renderPop(){
  $('#popBar').innerHTML = SEGS.map(s => `<i style="width:${draftShares[s.id]}%;background:${s.c}"></i>`).join('');
  $('#popMenu').innerHTML = `<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted)"><b style="color:var(--ink)">Who are the 1,000?</b><span class="num">${Object.values(draftShares).reduce((a,b)=>a+b,0)}%</span></div>` +
    SEGS.map(s => `<div class="w-sl"><div class="t"><i style="background:${s.c}"></i>${s.label}<span class="num">${draftShares[s.id]}% · ${draftShares[s.id]*10}</span></div><input type="range" min="0" max="80" value="${draftShares[s.id]}" data-s="${s.id}" aria-label="${s.label} share" style="accent-color:${s.c}"></div>`).join('') +
    `<button type="button" class="w-sbtn" id="popReset" style="justify-self:start">Reset to ${MODES[draftMode].label} default</button>`;
  $$('#popMenu input').forEach(inp => inp.addEventListener('input', () => { rebalance(inp.dataset.s, +inp.value); renderPop(); $(`#popMenu input[data-s="${inp.dataset.s}"]`).focus(); }));
  $('#popReset').onclick = () => { draftShares = {...MODES[draftMode].shares}; renderPop(); };
}
function rebalance(id, v){
  const others = SEGS.filter(s => s.id !== id), rest = others.reduce((a, s) => a + draftShares[s.id], 0) || 1;
  draftShares[id] = v; others.forEach(s => draftShares[s.id] = Math.round(draftShares[s.id] / rest * (100 - v)));
  draftShares[others[0].id] += 100 - SEGS.reduce((a, s) => a + draftShares[s.id], 0);
}
$('#popBtn').addEventListener('click', () => { const m = $('#popMenu'); m.hidden = !m.hidden; $('#popBtn').setAttribute('aria-expanded', String(!m.hidden)); renderPop(); });

/* ---------------- Composer: chips, plus menu, drag & drop ---------------- */
function renderChips(){
  $('#chips').innerHTML = chips.map((c, i) => `<span class="w-chip">${c.kind === 'ref' ? `<i style="background:${c.color}"></i>` : '📎'.replace('📎', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>')}${esc(c.name)}<button type="button" data-i="${i}" aria-label="Remove">×</button></span>`).join('');
}
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { chips.splice(+b.dataset.i, 1); renderChips(); } });
function addRefChip(c){ if (active && c.id === active.id) return toast("That's the chat you're in."); if (!chips.some(x => x.id === c.id)) chips.push({kind:'ref', id:c.id, name:c.title, color:c.color}); renderChips(); $('#inp').focus(); }
$('#plusBtn').addEventListener('click', () => { $('#plusMenu').hidden = !$('#plusMenu').hidden; });
$('#plusMenu').addEventListener('click', e => {
  const k = e.target.closest('button')?.dataset.k; if (!k) return; $('#plusMenu').hidden = true;
  if (k === 'ref') { const pick = $('#refPick'), others = chats.filter(c => c !== active && c.started);
    pick.innerHTML = others.length ? others.map(c => `<button type="button" data-id="${c.id}"><i style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block"></i>${esc(c.title)}</button>`).join('') : '<span class="w-empty" style="padding:8px 10px">Run a test first. Its chat will show up here.</span>';
    const host = $('#composer').getBoundingClientRect(), ws = $('#ws').getBoundingClientRect();
    pick.style.left = (host.left - ws.left) + 'px'; pick.style.top = 'auto'; pick.style.bottom = (ws.bottom - host.top + 8) + 'px'; pick.hidden = false; return; }
  const fi = $('#fileIn'); fi.accept = k === 'photo' ? 'image/*' : k === 'video' ? 'video/*' : ''; fi.click();
});
$('#refPick').addEventListener('click', e => { const id = e.target.closest('button')?.dataset.id; if (id) { addRefChip(chats.find(c => c.id === id)); $('#refPick').hidden = true; } });
$('#fileIn').addEventListener('change', e => { [...e.target.files].forEach(f => chips.push({kind:'file', name:f.name})); renderChips(); e.target.value = ''; });
function wireDrop(form, onChat, onFiles){
  form.addEventListener('dragover', e => { e.preventDefault(); form.classList.add('drag'); });
  form.addEventListener('dragleave', e => { if (!form.contains(e.relatedTarget)) form.classList.remove('drag'); });
  form.addEventListener('drop', e => { e.preventDefault(); form.classList.remove('drag');
    const id = e.dataTransfer.getData('text/x-chat'); if (id) return onChat(chats.find(c => c.id === id));
    if (e.dataTransfer.files?.length) onFiles([...e.dataTransfer.files]); });
}
wireDrop($('#composer'), c => c && addRefChip(c), fs => { fs.forEach(f => chips.push({kind:'file', name:f.name})); renderChips(); });
function autosize(){ const t = $('#inp'); t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
$('#inp').addEventListener('input', autosize);
$('#inp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });

/* ---------------- Start / open chats ---------------- */
function startDraft(){
  active = null; chips = []; renderChips(); const ws = $('#ws'); ws.classList.remove('p2', 'col', 'np'); ws.classList.add('p1');
  setDraftMode(draftMode); renderChats(); $('#inp').placeholder = 'Paste your ad, price change or launch…'; $('#priceField').hidden = false;
}
function openChat(id){
  const c = chats.find(x => x.id === id); if (!c) return;
  if (!c.started) { active = c; return startDraft(); }
  active = c; const ws = $('#ws'); ws.classList.remove('p1', 'drawer'); ws.classList.add('p2', 'col'); setView('chat'); ws.classList.toggle('np', !c.selSeg);
  $('#modeTag').textContent = MODES[c.mode].label; $('#priceField').hidden = true; $('#inp').placeholder = 'Ask a follow-up or paste a new version…';
  renderThread(); renderSummary(); renderAdvice(); renderPersona(); renderChats();
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#inp').value.trim(); if (!text && !chips.length) { $('#inp').focus(); return; }
  const attach = chips.slice(); chips = []; renderChips(); $('#inp').value = ''; autosize();
  if (!active || !active.started) {
    const c = active && !active.started ? active : newChatObj(draftMode);
    c.mode = draftMode; c.shares = {...draftShares}; c.started = true; c.text = text; c.price = (() => { const all = [...text.matchAll(/£\s?(\d+(?:\.\d+)?)/g)].map(m => +m[1]); return all.length ? all[all.length - 1] : (+$('#price').value || null); })();
    c.title = text.split(/[.:!?]/)[0].slice(0, 34) || MODES[c.mode].label; c.refs = attach.filter(a => a.kind === 'ref'); c.personas = buildPersonas(c);
    if (!chats.includes(c)) chats.unshift(c);
    c.msgs.push({role:'u', text, attach});
    openChat(c.id); await simulateRun(c);
  } else {
    const c = active; c.msgs.push({role:'u', text, attach}); renderThread();
    if (c.live) { c.msgs.push({role:'a', html:'<span class="prog"><span class="spin"></span>Thinking…</span>', prog:true}); renderThread();
      const hist = c.msgs.filter(m => !m.prog).slice(-8, -1).map(m => ({role: m.role === 'u' ? 'user' : 'assistant', content: m.role === 'u' ? m.text : m.html.replace(/<[^>]+>/g, '')}));
      let reply; try { const r = await post('/api/ask', {question: text, context: contextFor(c), history: hist}); reply = r.reply ? esc(r.reply).replace(/\n/g, '<br>') : `Couldn't answer: ${esc(r.error || 'no reply')}`; } catch (e) { reply = 'Network error. Try again.'; }
      c.msgs = c.msgs.filter(m => !m.prog); c.msgs.push({role:'a', html: reply}); if (c === active) renderThread(); return; }
    await sleep(500); c.msgs.push({role:'a', html: followUp(c, text)}); if (c === active) { renderThread(); renderSummary(); renderAdvice(); }
  }
});

/* ---------------- Main chat thread ---------------- */
function renderThread(){
  const c = active, th = $('#thread');
  th.innerHTML = c.msgs.map(m => m.role === 'u'
    ? `<div class="m u">${(m.attach||[]).filter(a=>a.kind==='ref').map(a => `<span class="ref"><i class="dot" style="background:${a.color}"></i>${esc(a.name)}</span>`).join('')}${esc(m.text)}${(m.attach||[]).some(a=>a.kind==='file') ? `<div class="files">${m.attach.filter(a=>a.kind==='file').map(a => `<span class="ref">${esc(a.name)}</span>`).join('')}</div>` : ''}</div>`
    : `<div class="m a"><span class="who"><i></i>Crowdsight agent</span><div class="txt">${m.html}</div></div>`).join('');
  th.scrollTop = th.scrollHeight;
}
async function simulateRun(c){
  if (await isLive()) { try { return await liveRun(c); } catch (e) { c.msgs = c.msgs.filter(m => !m.prog); c.msgs.push({role:'a', html:`Live run failed (${esc(String(e.message||e).slice(0,120))}). Showing the example engine instead.`}); c.live = null; c.personas = buildPersonas(c); } }
  return simRun(c);
}
async function liveRun(c){
  const prog = html => { const last = c.msgs.at(-1); const m = {role:'a', html:`<span class="prog"><span class="spin"></span>${html}</span>`, prog:true}; if (last?.prog) c.msgs[c.msgs.length - 1] = m; else c.msgs.push(m); if (c === active) renderThread(); };
  const unprog = () => { if (c.msgs.at(-1)?.prog) c.msgs.pop(); };
  c.personas = mapPersonas(await post('/api/personas', {shares: c.shares}));
  if (c.refs.length) c.msgs.push({role:'a', html:`Loaded context from <b>${c.refs.map(r => esc(r.name)).join(', ')}</b>.`});
  let n = 0, cat = ''; prog('Searching the live market with Tavily…');
  try { await sse('/api/ground', {pitch: c.text}, (ev, d) => {
    if (ev === 'category') { cat = d.category; prog(`Searching the market for <b>${esc(cat)}</b>…`); }
    if (ev === 'ground_source') { n++; prog(`Searching <b>${esc(cat)}</b> · ${n} sources`); }
    if (ev === 'brief') { c.brief = d; c.briefTxt = briefText(d); }
  }); } catch {}
  unprog();
  const b = c.brief;
  c.msgs.push({role:'a', html: b ? `Read <b>${(b.sources||[]).length} sources</b> on ${esc(cat)}. Competitors: ${(b.competitors||[]).slice(0,3).map(x => `${esc(x.name)}${x.price ? ` ${esc(x.price)}` : ''}`).join(', ') || 'none found'}.${(b.painPoints||[])[0] ? ` Top complaint: ${esc(b.painPoints[0])}.` : ''}` : `Market search unavailable, running without it.`});
  prog('Asking 1,000 people across 6 Nebius model families…');
  c.live = new Map(); c.ran = true; let last = 0;
  if (c === active) renderSummary();
  c.live = await runCrowdLive(c, c.text, (d, size, m, live) => { c.live = live; prog(`1,000 people reacting · ${size} done · ${d}/40 batches`); if (c === active && Date.now() - last > 900) { last = Date.now(); renderSummary(); } });
  unprog(); c.baseLaunch = summarise(c).launch;
  const S = summarise(c);
  c.msgs.push({role:'a', html: headline(c, S) + ` Click any segment to talk to it.`});
  if (c === active) { renderThread(); renderSummary(); }
  c.adviceLoading = true; if (c === active) renderAdvice();
  try { c.liveAdvice = await liveAdvice(c); } catch { c.liveAdvice = []; }
  c.adviceLoading = false; if (c === active) renderAdvice();
}
function liveHeadline(c, S){
  if (c.mode === 'ads') return `<b>${pct(S.ctr)} clicked, ${pct(S.buy)} bought.</b>`;
  if (c.mode === 'pricing') return `<b>${pct(S.pay)} would pay £${S.price}.</b>`;
  if (c.mode === 'launch') return `<b>${pct(S.try30)} would try it within 30 days.</b>`;
  return `<b>${pct(S.pos)} for, ${pct(S.neg)} against.</b>`;
}
async function simRun(c){
  const step = async (html, ms) => { c.msgs.push({role:'a', html: `<span class="prog"><span class="spin"></span>${html}</span>`}); if (c === active) renderThread(); await sleep(ms); c.msgs.pop(); };
  if (c.refs.length) { c.msgs.push({role:'a', html:`Loaded context from <b>${c.refs.map(r => esc(r.name)).join(', ')}</b>. I'll compare against it.`}); }
  await step('Searching the market with Tavily…', 1100);
  c.msgs.push({role:'a', html:`Found <b>8 sources</b>. Competitors: GymFlex £10/mo, PulsePass £16/mo. Top complaint: cancellation fees.`}); if (c === active) renderThread();
  await step('Asking 1,000 people across 6 Nebius model families…', 1800);
  c.ran = true; const S = summarise(c);
  c.msgs.push({role:'a', html: headline(c, S) + ` See the summary on the right, and click any segment to talk to it.`});
  if (c === active) { renderThread(); renderSummary(); await sleep(400); renderAdvice(); }
}
function headline(c, S){
  if (c.live) { const top = [...S.segs].filter(x => x.n).sort((a,b) => a.score - b.score)[0]; return liveHeadline(c, S) + (top ? ` ${top.s.label} are the hardest to win.` : ''); }
  if (c.mode === 'ads') return `<b>${pct(S.ctr)} clicked, ${pct(S.buy)} bought.</b> The last line loses skeptics and marketing experts.`;
  if (c.mode === 'pricing') return `<b>${pct(S.pay)} would pay £${S.price}.</b> Target customers cluster just under it.`;
  if (c.mode === 'launch') return `<b>${pct(S.try30)} would try it within 30 days.</b> Domain experts doubt the unit economics.`;
  return `<b>${pct(S.pos)} for, ${pct(S.neg)} against.</b> "For your benefit" is doing the damage.`;
}
function followUp(c, text){
  const S = summarise(c), t = text.toLowerCase();
  if (/price|£|cost|cheap|expensive/.test(t)) return `At £${S.price}, ${pct(S.pay)} would pay. The best advice card tests a lower price; try it below.`;
  if (/why|reason|object|hate|dislike/.test(t)) { const o = {}; S.all.forEach(x => { if (x.r.objection) o[x.r.objection] = (o[x.r.objection]||0)+1; }); const top = Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return `Top objections: ${top.map(([k,n]) => `<b>${esc(k)}</b> (${n})`).join(', ')}.`; }
  if (/who|segment|best|worst/.test(t)) { const s = [...S.segs].sort((a,b)=>b.score-a.score); return `Strongest: <b>${s[0].s.label}</b> (${s[0].score.toFixed(1)}). Weakest: <b>${s[s.length-1].s.label}</b> (${s[s.length-1].score.toFixed(1)}).`; }
  return `Launch Score is <b>${S.launch.toFixed(1)}</b>. To test a new version, start a new chat and reference this one so the crowd compares against it.`;
}

/* ---------------- Summary box ---------------- */
function renderSummary(){
  const c = active, el = $('#summary');
  if (!c.ran) { el.innerHTML = `<div class="w-bh"><h4>Summary</h4></div><p class="w-empty">The crowd's verdict lands here once all 1,000 have reacted.</p>`; return; }
  const S = summarise(c), base = c.applied.length ? (c.live ? {launch: c.baseLaunch} : summarise({...c, applied: []})) : null;
  const k2 = c.mode === 'ads' ? [`${pct(S.ctr)}`, 'Clicked'] : c.mode === 'pricing' ? [pct(S.pay), `Would pay £${S.price}`] : c.mode === 'launch' ? [pct(S.try30), 'Try in 30 days'] : [pct(S.pos), 'For it'];
  const k3 = c.mode === 'ads' ? [pct(S.buy), 'Bought'] : [pct(S.neg), 'Against'];
  const cols = c.mode === 'ads' ? [['Clicked', x => pct(x.ctr)], ['Bought', x => pct(x.buy)]]
    : c.mode === 'pricing' ? [[`Pay £${S.price}`, x => pct(x.pay)], ['Median max', x => `£${x.med}`]]
    : c.mode === 'launch' ? [['Try in 30d', x => pct(x.try30)], ['Top objection', x => esc(x.obj), 'wrap']]
    : [['Split', x => `<span class="w-mini"><i style="width:${x.neg*100}%;background:var(--neg)"></i><i style="width:${(1-x.neg-x.pos)*100}%;background:#D4D4DB"></i><i style="width:${x.pos*100}%;background:var(--pos)"></i></span>`], ['For', x => pct(x.pos)]];
  el.innerHTML = `<div class="w-bh"><h4>Summary</h4><span class="r num">${S.all.length.toLocaleString()} reacted${c.live ? ' · live' : ''} · ${MODES[c.mode].label}${c.applied.length ? ` · ${c.applied.length} change${c.applied.length>1?'s':''} applied` : ''}</span></div>
    <p class="w-head">${headline(c, S).replace('<b>', '').replace('</b>', '<span>')}</span></p>
    <div class="w-kpis">
      <div class="w-k"><div class="v">${S.launch.toFixed(1)}</div><div class="l">Launch Score ${base ? `<span class="d">+${(S.launch - base.launch).toFixed(1)}</span>` : ''}</div></div>
      <div class="w-k"><div class="v">${k2[0]}</div><div class="l">${k2[1]}</div></div>
      <div class="w-k"><div class="v">${k3[0]}</div><div class="l">${k3[1]}</div></div>
      <div class="w-k"><div class="v">6</div><div class="l">Model families</div></div>
    </div>
    <canvas class="w-crowdstrip" id="strip" aria-label="1,000 personas coloured by reaction"></canvas>
    <table class="w-tbl"><thead><tr><th>Segment</th><th class="n">People</th>${cols.map(x => `<th class="${x[2] ? '' : 'n'}">${x[0]}</th>`).join('')}<th class="n">Score</th><th></th></tr></thead>
    <tbody>${S.segs.map(x => `<tr data-s="${x.s.id}" class="${c.selSeg === x.s.id ? 'on' : ''}" tabindex="0"><td><i style="background:${x.s.c}"></i>${x.s.label}</td><td class="n">${x.n}</td>${cols.map(col => `<td class="${col[2] || 'n'}">${col[1](x)}</td>`).join('')}<td class="n"><b>${x.score.toFixed(1)}</b></td><td class="go">Talk →</td></tr>`).join('')}</tbody></table>`;
  drawStrip(c, S);
  $$('#summary tbody tr').forEach(tr => { const go = () => selectSeg(tr.dataset.s); tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
}
function drawStrip(c, S){
  const cv = $('#strip'); if (!cv) return; const ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1, w = cv.clientWidth || 600, h = 46;
  cv.width = w*dpr; cv.height = h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const cols = 100, rows = 10, gx = w/cols, gy = h/rows;
  S.all.forEach((x, k) => { const r = x.r;
    ctx.fillStyle = c.mode === 'ads' ? (r.bought ? '#12A150' : r.clicked ? '#2F6BFF' : '#E3E3EA') : r.st > .25 ? '#12A150' : r.st < -.15 ? '#E5484D' : '#D4D4DB';
    ctx.beginPath(); ctx.arc((k % cols + .5)*gx, (Math.floor(k/cols) + .5)*gy, Math.min(gx, gy)*.36, 0, 7); ctx.fill(); });
}

/* ---------------- Advice box ---------------- */
function renderAdvice(){
  const c = active, el = $('#advice');
  if (!c.ran) { el.innerHTML = `<div class="w-bh"><h4>Advice</h4></div><p class="w-empty">The advice agent suggests fixes after the crowd reacts.</p>`; return; }
  if (c.live) return renderLiveAdvice(c, el);
  const base = summarise(c).launch, list = adviceFor(c);
  el.innerHTML = `<div class="w-bh"><h4>Advice</h4><span class="r">${list.length} suggestions · tested on the same 1,000</span></div><div class="w-adv">${list.map((a, i) => {
    const done = c.applied.find(x => x.id === a.id);
    const proj = summarise({...c, applied: [...c.applied.filter(x => x.id !== a.id), a]}).launch - (done ? summarise({...c, applied: c.applied.filter(x => x.id !== a.id)}).launch : base);
    return `<div class="w-ad ${done ? 'done' : ''}"><span class="ix">${i + 1}</span><b>${esc(a.title)}<span class="lever">${a.lever}</span></b><span class="imp">+${proj.toFixed(1)}</span><p>${esc(a.why)}</p>
      <span class="act">${done ? '<span class="w-sbtn" style="display:inline-flex;align-items:center;border-color:#BFE8CF;color:var(--pos)">Applied</span>' : `<button class="w-sbtn" type="button" data-a="${a.id}">Test it</button>`}</span>
      ${done ? `<span class="res">Tested: ${done.before.toFixed(1)} → ${done.after.toFixed(1)}</span>` : ''}</div>`; }).join('')}</div>`;
  $$('#advice [data-a]').forEach(b => b.onclick = async () => {
    const a = list.find(x => x.id === b.dataset.a); b.disabled = true; b.innerHTML = '<span class="spin" style="display:inline-block;width:11px;height:11px;vertical-align:-1px"></span> Testing';
    await sleep(1300); const before = summarise(c).launch; c.applied.push({...a, before}); c.applied[c.applied.length - 1].after = summarise(c).launch;
    c.msgs.push({role:'a', html:`Tested <b>${esc(a.title)}</b> on all 1,000. Launch Score ${before.toFixed(1)} → <b>${c.applied.at(-1).after.toFixed(1)}</b>.`});
    if (c === active) { renderThread(); renderSummary(); renderAdvice(); renderPersona(); }
  });
}

function renderLiveAdvice(c, el){
  if (c.adviceLoading || !c.liveAdvice) { el.innerHTML = `<div class="w-bh"><h4>Advice</h4></div><span class="prog"><span class="spin"></span>${c.adviceLoading ? 'The advice agent is reading 1,000 reactions…' : 'Waiting for the crowd…'}</span>`; return; }
  const list = c.liveAdvice;
  const sp = '<span class="spin" style="display:inline-block;width:11px;height:11px;vertical-align:-1px"></span>';
  el.innerHTML = `<div class="w-bh"><h4>Advice</h4><span class="r">${list.length} suggestions · Test re-runs all 1,000</span></div><div class="w-adv">${list.map((a, i) => { const done = c.applied.find(x => x.id === a.id);
    return `<div class="w-ad ${done ? 'done' : ''}"><span class="ix">${i + 1}</span><b>${esc(a.title)}<span class="lever">${esc(a.lever)}</span></b><span class="imp">${done ? (done.after - done.before >= 0 ? '+' : '') + (done.after - done.before).toFixed(1) : ''}</span><p>${esc(a.why)}</p>
      <span class="act">${done ? '<span class="w-sbtn" style="display:inline-flex;align-items:center;border-color:#BFE8CF;color:var(--pos)">Applied</span>' : `<button class="w-sbtn" type="button" data-a="${a.id}">Test it</button>`}</span>
      ${done ? `<span class="res">${done.before.toFixed(1)} → ${done.after.toFixed(1)} · "${esc(done.text.slice(0, 90))}${done.text.length > 90 ? '…' : ''}"</span>` : ''}</div>`; }).join('') || '<p class="w-empty">No advice came back. Ask the agent in the chat instead.</p>'}</div>`;
  $$('#advice [data-a]').forEach(b => b.onclick = async () => {
    const a = list.find(x => x.id === b.dataset.a); b.disabled = true; b.innerHTML = sp + ' Rewriting';
    try {
      const rw = await post('/api/ask', {question: `Rewrite the pitch applying only this change: "${a.title}" (${a.why}). Keep it about the same length. Output only the new pitch text, nothing else.`, context: contextFor(c), history: []});
      const text = String(rw.reply || '').replace(/^["']|["']$/g, '').trim(); if (!text) throw new Error(rw.error || 'no rewrite');
      const before = summarise(c).launch; b.innerHTML = sp + ' Testing on 1,000';
      const np = /£\s?(\d+(?:\.\d+)?)/.exec(text);
      const live = await runCrowdLive({...c, price: np ? +np[1] : c.price}, text, d => { b.innerHTML = `${sp} ${d}/40`; });
      c.live = live; c.text = text; if (np) c.price = +np[1];
      const after = summarise(c).launch; c.applied.push({...a, before, after, text, shift:0});
      c.msgs.push({role:'a', html:`Tested <b>${esc(a.title)}</b> on all 1,000. Launch Score ${before.toFixed(1)} → <b>${after.toFixed(1)}</b>.<br><span style="color:var(--muted)">New version: "${esc(text)}"</span>`});
    } catch (e) { c.msgs.push({role:'a', html:`Couldn't test that change: ${esc(String(e.message||e).slice(0,120))}`}); }
    if (c === active) { renderThread(); renderSummary(); renderAdvice(); renderPersona(); }
  });
}

/* ---------------- Persona details column ---------------- */
function selectSeg(id){ const c = active; c.selSeg = id; c.selPersona = null; $('#ws').classList.remove('np'); renderSummary(); renderPersona(); if (isPhone()) setView('persona'); }
function renderPersona(){
  const c = active, col = $('#personaCol');
  if (!c || !c.selSeg) { col.innerHTML = ''; return; }
  const seg = SEGS.find(s => s.id === c.selSeg); const ps = c.personas.filter(p => p.seg === seg.id && !react(c, p).pending), key = c.selPersona == null ? 'seg:' + seg.id : 'p:' + c.selPersona;
  const sel = c.selPersona != null ? c.personas[c.selPersona] : null;
  if (!c.pmsgs[key]) c.pmsgs[key] = [{role:'a', html: sel ? personaHello(c, sel) : segHello(c, seg)}];
  col.innerHTML = `<div class="w-ph"><i style="background:${seg.c}"></i><b>${seg.label}</b><span class="num dim" style="font-size:12px">${ps.length} people</span><button class="w-ico x" type="button" id="pClose" aria-label="Close persona details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="w-ptabs" role="tablist">${SEGS.map(s => `<button type="button" role="tab" data-s="${s.id}" aria-selected="${s.id === seg.id}"><i class="dot" style="background:${s.c}"></i>${s.short}</button>`).join('')}</div>
    <div class="w-plist">
      <div class="w-pp ${sel ? '' : 'on'}" data-p=""><span class="av" style="background:${seg.c}">All</span><b>Whole segment</b><small>Talk to all ${ps.length} as one group</small><span class="st"></span></div>
      ${ps.slice(0, 40).map(p => { const r = react(c, p); return `<div class="w-pp ${sel && sel.i === p.i ? 'on' : ''}" data-p="${p.i}"><span class="av" style="background:${seg.c};opacity:.85">${p.name.split(' ').map(x=>x[0]).join('')}</span><b>${esc(p.name)}, ${p.age}</b><small>${esc(p.role)} · ${MODELS[p.model % 6].fam}</small><span class="st" style="color:${r.st > .25 ? 'var(--pos)' : r.st < -.15 ? 'var(--neg)' : 'var(--muted)'}">${r.st > 0 ? '+' : ''}${r.st.toFixed(2)}</span></div>`; }).join('')}
      ${ps.length > 40 ? `<div class="w-empty" style="padding:8px 14px">Showing 40 of ${ps.length}</div>` : ''}
    </div>
    <div class="w-pthread" id="pthread">${c.pmsgs[key].map(m => m.role === 'u' ? `<div class="m u">${esc(m.text)}</div>` : `<div class="m a"><span class="who"><i style="background:${seg.c}"></i>${sel ? esc(sel.name) : seg.label}</span><div class="txt">${m.html}</div></div>`).join('')}</div>
    <form class="w-composer" id="pcomposer" autocomplete="off"><textarea id="pinp" rows="1" placeholder="${sel ? `Ask ${esc(sel.name.split(' ')[0])} anything…` : `Ask the ${seg.short.toLowerCase()} segment…`}" aria-label="Message to persona"></textarea>
      <div class="w-crow"><button class="w-ico" type="button" id="pPlus" aria-label="Attach"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button><button class="w-send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div></form>`;
  const pt = $('#pthread'); pt.scrollTop = pt.scrollHeight;
  $('#pClose').onclick = () => { c.selSeg = null; $('#ws').classList.add('np'); renderSummary(); };
  $$('.w-ptabs button', col).forEach(b => b.onclick = () => selectSeg(b.dataset.s));
  $$('.w-pp', col).forEach(el => el.onclick = () => { c.selPersona = el.dataset.p === '' ? null : +el.dataset.p; renderPersona(); });
  $('#pPlus').onclick = () => $('#fileIn').click();
  const pinp = $('#pinp'); pinp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#pcomposer').requestSubmit(); } });
  wireDrop($('#pcomposer'), ch => ch && sendPersona(c, key, `[Referenced chat: ${ch.title}]`), fs => sendPersona(c, key, `[Attached ${fs.map(f => f.name).join(', ')}]`));
  $('#pcomposer').onsubmit = e => { e.preventDefault(); const t = pinp.value.trim(); if (t) sendPersona(c, key, t); };
}
async function sendPersona(c, key, text){
  c.pmsgs[key].push({role:'u', text}); renderPersona();
  const sel = c.selPersona != null ? c.personas[c.selPersona] : null, seg = SEGS.find(s => s.id === c.selSeg);
  if (c.live) {
    c.pmsgs[key].push({role:'a', html:'<span class="prog"><span class="spin"></span>Typing…</span>'}); renderPersona();
    const hist = c.pmsgs[key].slice(1, -2).map(m => ({role: m.role === 'u' ? 'user' : 'assistant', content: m.role === 'u' ? m.text : m.html.replace(/<[^>]+>/g, '')}));
    const reactions = sel ? [c.live.get(sel.id)].filter(Boolean) : c.personas.filter(p => p.seg === seg.id).map(p => c.live.get(p.id)).filter(Boolean);
    let reply; try { const r = await post('/api/persona-chat', {kind: sel ? 'persona' : 'segment', segment: seg.id, personaId: sel?.id, shares: c.shares, pitch: c.text, mode: MODES[c.mode].label, brief: c.briefTxt, reactions, history: hist, message: text});
      reply = r.reply ? esc(r.reply) : `No reply (${esc(r.error || 'error')}).`; } catch { reply = 'Network error. Try again.'; }
    c.pmsgs[key].pop(); c.pmsgs[key].push({role:'a', html: reply}); if (c === active) renderPersona(); return;
  }
  await sleep(650);
  c.pmsgs[key].push({role:'a', html: sel ? personaReply(c, sel, text) : segReply(c, seg, text)}); if (c === active) renderPersona();
}
function segHello(c, seg){ const x = summarise(c).segs.find(s => s.s.id === seg.id); if (!x || !x.n) return 'No reactions from this segment yet.';
  return `We're ${x.n} ${seg.label.toLowerCase()}. ${pct(x.pos)} of us like it, ${pct(x.neg)} don't. Our biggest issue: <b>${esc(x.obj)}</b>. Ask us anything.`; }
function segReply(c, seg, text){ const x = summarise(c).segs.find(s => s.s.id === seg.id), t = text.toLowerCase(), ps = c.personas.filter(p => p.seg === seg.id);
  const q = ps.map(p => ({p, r: react(c, p)})).sort((a, b) => b.r.st - a.r.st);
  if (/price|£|pay|cost/.test(t)) return `The median of us would pay <b>£${x.med}/mo</b>. ${pct(x.pay)} would pay £${priceOf(c)}.`;
  if (/change|fix|improve|better/.test(t)) return `Fix this first: <b>${esc(x.obj)}</b>. Then show us why you're different from GymFlex.`;
  if (/click|ad|buy/.test(t)) return `${pct(x.ctr)} of us would click and ${pct(x.buy)} would buy.`;
  return `Loudest for: "${esc(q[0].r.quote)}" Loudest against: "${esc(q[q.length - 1].r.quote)}"`; }
function personaHello(c, p){ const r = react(c, p); if (c.live && r.quote) return `I'm ${esc(p.name.split(' ')[0])}, ${p.age}, ${esc(p.role)}. "${esc(r.quote)}"${r.objection ? ` My issue: ${esc(r.objection)}.` : ''}`; return `Hi, I'm ${esc(p.name.split(' ')[0])}, ${p.age}, a ${esc(p.role)}. "${esc(r.quote)}"`; }
function personaReply(c, p, text){ const r = react(c, p), t = text.toLowerCase(), price = priceOf(c);
  if (/price|£|pay|cost|afford/.test(t)) return r.maxPrice >= (price || 0) ? `£${price} is fine for me. I'd go up to about £${r.maxPrice}.` : `£${price} is too much. I'd pay £${r.maxPrice} at most, I'm on a ${p.inc} income.`;
  if (/why|reason|feel|think/.test(t)) return r.objection ? `Honestly? ${esc(r.objection)}. That's what puts me off.` : `It fits how I already live. I'm a ${p.pers}, and this is the kind of thing I try early.`;
  if (/change|fix|better|convince/.test(t)) return r.st > .25 ? `Don't change much. Maybe show me the nearest sites.` : `Drop the "for your benefit" line and let me cancel any time. Then I'd look again.`;
  if (/buy|sign|join|click/.test(t)) return r.bought ? `Yes, I'd sign up.` : r.clicked ? `I'd click to look, but I wouldn't buy yet.` : `I'd scroll straight past, sorry.`;
  return r.st > .25 ? `I'm into it. ${esc(r.quote)}` : r.st < -.15 ? `Still not sold. ${esc(r.quote)}` : `I'm on the fence. ${esc(r.quote)}`; }

/* ---------------- Phone: view tabs + chat drawer ---------------- */
function setView(v){ $('#ws').dataset.view = v; $$('#mtabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
$('#mtabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'persona' && active && !active.selSeg) selectSeg('icp'); setView(b.dataset.v); });
(() => { const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'w-mobmenu'; mb.setAttribute('aria-label', 'Chats'); mb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'; $('#ws').appendChild(mb);
  mb.addEventListener('click', e => { e.stopPropagation(); $('#ws').classList.toggle('drawer'); });
  document.addEventListener('click', e => { if (!e.target.closest('.w-chats') && !e.target.closest('.w-mobmenu')) $('#ws').classList.remove('drawer'); }); })();
const isPhone = () => matchMedia('(max-width:700px)').matches;

/* ---------------- Resizable columns & split ---------------- */
function drag(el, onMove){
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); el.setPointerCapture(e.pointerId);
    const mv = ev => onMove(ev), up = () => { el.classList.remove('on'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
}
$$('.w-gut').forEach(g => drag(g, e => {
  const ws = $('#ws'), r = ws.getBoundingClientRect(), wc = ws.classList.contains('col') ? 64 : 260;
  if (g.dataset.g === 'a') ws.style.setProperty('--wchat', clamp(e.clientX - r.left - wc, 260, r.width * .45) + 'px');
  else ws.style.setProperty('--wpers', clamp(r.right - e.clientX, 280, r.width * .42) + 'px');
}));
drag($('#hgut'), e => { const r = $('#midCol').getBoundingClientRect(); $('#ws').style.setProperty('--split', clamp((e.clientY - r.top) / r.height * 100, 20, 80) + '%'); });
$('#ws').style.setProperty('--wpers', '340px');

/* ---------------- Voice mode ---------------- */
let vOn = false, vMuted = false, analyser = null, stream = null, rec = null, finalText = '', simTimer = null;
const vnote = (t, err) => { const n = $('#vnote'); n.textContent = t; n.classList.toggle('w-vnote-err', !!err); };
$('#micBtn').addEventListener('click', async () => {
  vOn = true; vMuted = false; finalText = ''; $('#voice').classList.add('on'); $('#vtext').textContent = 'Starting the microphone…'; vnote(''); requestAnimationFrame(drawOrb);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!window.isSecureContext) { vnote('Voice needs https or localhost. Open this page at http://localhost:3100/web/', true); return playSample(); }
  try { stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}); const ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume();
    analyser = ac.createAnalyser(); analyser.fftSize = 1024; ac.createMediaStreamSource(stream).connect(analyser); analyser._ac = ac; }
  catch (e) { analyser = null; vnote(e && e.name === 'NotAllowedError' ? 'Microphone blocked. Click the mic icon in the address bar, allow it, then try again.' : 'No microphone found. Playing a sample pitch instead.', true); return playSample(); }
  if (!SR) { vnote('Your mic works, but live transcription needs Chrome or Edge. Speak and we will show the waveform; type your pitch after.', true); $('#vtext').textContent = 'Listening (no transcription in this browser)'; return; }
  rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || 'en-GB';
  rec.onstart = () => { $('#vtext').textContent = 'Listening. Pitch your launch out loud.'; vnote('Speak naturally. Press Done when you finish.'); };
  rec.onresult = e => { let it = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + t.trim(); else it += t; } $('#vtext').textContent = (finalText + ' ' + it).trim() || 'Listening…'; };
  rec.onerror = e => { const m = {'not-allowed':'Microphone permission denied for speech.', 'network':'The speech service needs an internet connection.', 'no-speech':'No speech heard yet. Keep talking.', 'audio-capture':'No microphone found.'}[e.error] || ('Voice error: ' + e.error); vnote(m, e.error !== 'no-speech'); };
  rec.onend = () => { if (vOn && !vMuted) try { rec.start(); } catch {} };
  try { rec.start(); } catch (e) { vnote('Could not start speech recognition: ' + e.message, true); }
});
function playSample(){ const words = (active?.text || EX[draftMode][0][1]).split(' '); let i = 0; $('#vtext').textContent = '';
  simTimer = setInterval(() => { if (!vOn || i >= words.length) return clearInterval(simTimer); if (!vMuted) { finalText += (finalText ? ' ' : '') + words[i++]; $('#vtext').textContent = finalText; } }, reduce ? 0 : 150); }
$('#vMute').addEventListener('click', () => { vMuted = !vMuted; $('#vMute').textContent = vMuted ? 'Unmute' : 'Mute'; stream?.getAudioTracks().forEach(t => t.enabled = !vMuted); try { vMuted ? rec?.stop() : rec?.start(); } catch {} });
$('#vEnd').addEventListener('click', endVoice);
function endVoice(){ vOn = false; clearInterval(simTimer); try { rec?.stop(); } catch {} rec = null; stream?.getTracks().forEach(t => t.stop()); stream = null; try { analyser?._ac?.close(); } catch {} analyser = null;
  $('#voice').classList.remove('on'); if (finalText.trim()) { $('#inp').value = finalText.trim(); autosize(); } $('#inp').focus(); }
const buf = new Uint8Array(1024); let ampS = 0;
function drawOrb(now){
  if (!vOn) return; const cv = $('#orb'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1, s = cv.clientWidth || 240;
  if (cv.width !== Math.round(s*dpr)) cv.width = cv.height = s*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,s,s);
  let amp = 0; if (analyser && !vMuted) { analyser.getByteTimeDomainData(buf); let r = 0; for (const v of buf) { const x = (v-128)/128; r += x*x; } amp = Math.min(1, Math.sqrt(r/buf.length)*6); } else if (!analyser && !vMuted) amp = .35 + .3*Math.sin(now/180)*Math.sin(now/530);
  ampS += (amp - ampS) * .15; const c = s/2, R = s*.42*(1 + ampS*.06);
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI*2); ctx.clip();
  [[now/4200, ['#2792DC','#9CE6E6','#FFFFFF','#2792DC','#1B4FD8','#9CE6E6','#2792DC'], 1], [-now/3100 + 1, ['rgba(79,70,229,0)','rgba(79,70,229,.55)','rgba(156,230,230,0)','rgba(39,146,220,.5)','rgba(79,70,229,0)'], .9]].forEach(([a, cols, al]) => {
    const g = ctx.createConicGradient ? ctx.createConicGradient(a, c, c) : ctx.createLinearGradient(0, 0, s, s); cols.forEach((col, i) => g.addColorStop(i/(cols.length-1), col)); ctx.globalAlpha = al; ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); });
  ctx.restore(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(c, c, R + 6 + ampS*10, 0, Math.PI*2); ctx.strokeStyle = `rgba(39,146,220,${.08 + ampS*.18})`; ctx.lineWidth = 2; ctx.stroke();
  requestAnimationFrame(drawOrb);
}

/* ---------------- Hero canvases ---------------- */
function dotField(cv, n, size){
  if (!cv) return; const ctx = cv.getContext('2d'), r = rng(7), dots = Array.from({length: n}, () => ({p: r()*6.3, s: r()*2-1}));
  (function frame(t){ const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1; if (!w) return requestAnimationFrame(frame);
    if (cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)) { cv.width = w*dpr; cv.height = h*dpr; }
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h); const cols = Math.ceil(Math.sqrt(n * w / h)), gap = w / cols;
    dots.forEach((d, k) => { const x = (k % cols + .5) * gap, y = (Math.floor(k / cols) + .5) * gap; if (y > h) return;
      const wv = Math.sin(x*.012 + t/1600) + Math.cos(y*.016 - t/2100) + d.s*1.2, c = wv > 1.25 ? '18,161,80' : wv < -1.35 ? '229,72,77' : '11,11,16';
      ctx.fillStyle = `rgba(${c},${c === '11,11,16' ? .08 : .5 + .3*Math.sin(t/700 + d.p)})`; ctx.beginPath(); ctx.arc(x, y, size, 0, 7); ctx.fill(); });
    if (!reduce) requestAnimationFrame(frame); })(0);
}
['#heroCta', '#navCta'].forEach(s => $(s)?.addEventListener('click', () => setTimeout(() => $('#inp').focus({preventScroll: true}), 700)));
addEventListener('keydown', e => { if (e.key === 'Escape') { if (vOn) endVoice(); $('#ctx').hidden = true; $('#plusMenu').hidden = true; $('#modeMenu').hidden = true; $('#popMenu').hidden = true; } });

/* ---------------- Boot ---------------- */
startDraft(); dotField($('#field'), 1000, 2.2); dotField($('#mini'), 160, 2.4);
})();
