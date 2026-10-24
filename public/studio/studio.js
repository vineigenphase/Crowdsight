/* Crowdsight Studio. Live on the Next.js backend:
   /api/ground (Tavily + Nebius brief) → /api/crowd (1,000 personas, 6 Nebius families) →
   /api/optimise (agent loop + final summary), plus /api/ask and /api/persona-chat for conversations. */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- Config ---------------- */
const MODES = {
  general: { label: 'General', type: 'ad', desc: 'Opinion split, objections and quotes', shares: { general: 50, icp: 22, expert: 12, marketing: 8, skeptic: 8 } },
  ads: { label: 'Ads', type: 'ad', desc: 'Who would click, and who would buy', shares: { general: 42, icp: 22, expert: 8, marketing: 20, skeptic: 8 } },
  pricing: { label: 'Pricing', type: 'price', desc: 'Who pays at your price, and the most they would', shares: { general: 35, icp: 35, expert: 10, marketing: 7, skeptic: 13 } },
  launch: { label: 'Product launch', type: 'spec', desc: 'Who would try it in 30 days, and why not', shares: { general: 30, icp: 22, expert: 30, marketing: 8, skeptic: 10 } },
};
const SEGS = [
  { id: 'general', label: 'General population', short: 'General', c: '#A0998A' },
  { id: 'icp', label: 'Target customers', short: 'Target', c: '#E4572E' },
  { id: 'expert', label: 'Domain experts', short: 'Experts', c: '#2F6FD6' },
  { id: 'marketing', label: 'Marketing experts', short: 'Marketing', c: '#7A4FD0' },
  { id: 'skeptic', label: 'Skeptics & loyalists', short: 'Skeptics', c: '#16140F' },
];
const IMP = { general: 1, icp: 2, expert: 1.5, marketing: 1, skeptic: 1 };
const MODEL_C = ['#6E56FF', '#2F80ED', '#0E9F94', '#D98E04', '#D6438F', '#5E9E0B'];
const CHAT_C = ['#E4572E', '#2F80ED', '#0E9F94', '#D98E04', '#7A4FD0', '#D6438F', '#5E9E0B', '#16140F'];

/* ---------------- Store (this browser only) ---------------- */
const KEY = 'crowdsight.studio.v1';
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.chats)) return s; } catch {}
  return { chats: [], activeId: null, profile: { name: 'Founder', mode: 'general' }, rail: false };
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch { // quota: drop reactions from all but each chat's latest test, then retry
      S.chats.forEach((c) => c.entries.filter((e) => e.kind === 'test').slice(0, -1).forEach((t) => { t.v0 = []; t.fin = null; }));
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
    }
  }, 250);
}
const active = () => S.chats.find((c) => c.id === S.activeId) || null;
const tests = (c) => (c ? c.entries.filter((e) => e.kind === 'test') : []);
const lastTest = (c) => tests(c).slice(-1)[0] || null;

function newChat(mode = S.profile.mode || 'general') {
  const c = { id: uid(), title: 'New test', color: CHAT_C[S.chats.length % CHAT_C.length], mode, shares: { ...MODES[mode].shares }, created: Date.now(), entries: [], pchat: {} };
  S.chats.unshift(c); S.activeId = c.id; det = null; save(); render();
  return c;
}

/* ---------------- SSE ---------------- */
async function sse(url, body, on) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = 'message', data = '';
      chunk.split('\n').forEach((l) => { if (l.startsWith('event: ')) ev = l.slice(7); else if (l.startsWith('data: ')) data += l.slice(6); });
      try { on(ev, data ? JSON.parse(data) : null); } catch (e) { console.error('[crowdsight]', ev, e); }
    }
  }
}
const post = async (url, body) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

/* ---------------- Personas (exact server sample) ---------------- */
const pcache = new Map();
async function personasFor(chat) {
  const k = JSON.stringify(chat.shares);
  if (!pcache.has(k)) pcache.set(k, post('/api/personas', { shares: chat.shares, importance: IMP }).catch(() => []));
  return pcache.get(k);
}
let PERS = []; // personas for the active chat
async function loadPersonas() { const c = active(); PERS = c ? await personasFor(c) : []; if (c && c.entries.length) renderWork(); else draw(); }

/* ---------------- Scoring (mirrors lib/score.ts) ---------------- */
function priceOf(text) {
  const m = [...text.matchAll(/£\s?(\d+(?:\.\d{1,2})?)\s*(?:\/\s*mo|\/\s*month|per month|a month|pcm|monthly)/gi)];
  if (m.length) return +m[m.length - 1][1];
  const a = [...text.matchAll(/£\s?(\d+(?:\.\d{1,2})?)/g)];
  return a.length ? +a[a.length - 1][1] : null;
}
const clicked = (r) => r.intent > 0.5 || r.wouldShare > 0.6;
const bought = (r, price) => clicked(r) && r.intent > 0.6 && (!price || (r.maxPrice ?? 0) >= price);
function reactionsOf(t) { return (t.fin && t.fin.length ? t.fin : t.v0) || []; }
function stats(chat, t) {
  const rs = reactionsOf(t);
  const byId = new Map(rs.map((r) => [r.personaId, r]));
  const price = t.versions.length ? t.versions[t.versions.length - 1].price ?? t.price : t.price;
  const segs = SEGS.map((s) => {
    const ids = PERS.filter((p) => p.segment === s.id).map((p) => p.id);
    const r = ids.map((id) => byId.get(id)).filter(Boolean);
    const st = mean(r.map((x) => (x.stance + 1) / 2)), it = mean(r.map((x) => x.intent)), sh = mean(r.map((x) => x.wouldShare));
    const objs = {}; r.forEach((x) => { if (x.objection) { const k = x.objection.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3).slice(0, 3).join(' '); if (k) (objs[k] ||= { t: x.objection, n: 0 }).n++; } });
    const top = Object.values(objs).sort((a, b) => b.n - a.n)[0];
    const mps = r.map((x) => x.maxPrice).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    return {
      s, n: r.length, rs: r, score: r.length ? 100 * (0.5 * st + 0.35 * it + 0.15 * sh) : 0, intent: it, share: sh,
      pos: r.filter((x) => x.stance > 0.25).length / (r.length || 1), neg: r.filter((x) => x.stance < -0.15).length / (r.length || 1),
      click: r.filter(clicked).length / (r.length || 1), buy: r.filter((x) => bought(x, price)).length / (r.length || 1),
      pay: price ? r.filter((x) => (x.maxPrice ?? 0) >= price).length / (r.length || 1) : 0,
      try30: r.filter((x) => x.intent > 0.6).length / (r.length || 1),
      median: mps.length ? mps[Math.floor(mps.length / 2)] : null, top,
    };
  });
  let num = 0, den = 0;
  segs.forEach((x) => { if (!x.n) return; const w = (chat.shares[x.s.id] || 0) * IMP[x.s.id]; num += w * x.score; den += w; });
  const bins = [0, 0, 0, 0, 0]; rs.forEach((r) => bins[Math.min(4, Math.floor(((r.stance + 1) / 2) * 5))]++);
  let h = 0; bins.forEach((b) => { if (b) { const q = b / rs.length; h -= q * Math.log(q); } });
  return {
    segs, rs, byId, price, launch: den ? num / den : 0, diversity: rs.length ? (100 * h) / Math.log(5) : 0,
    pos: rs.filter((x) => x.stance > 0.25).length / (rs.length || 1), neg: rs.filter((x) => x.stance < -0.15).length / (rs.length || 1),
    click: rs.filter(clicked).length / (rs.length || 1), buy: rs.filter((x) => bought(x, price)).length / (rs.length || 1),
    pay: price ? rs.filter((x) => (x.maxPrice ?? 0) >= price).length / (rs.length || 1) : 0,
    try30: rs.filter((x) => x.intent > 0.6).length / (rs.length || 1),
  };
}

/* ---------------- Render: chat list ---------------- */
const app = $('#app');
function renderChats() {
  const list = $('#chatList');
  list.innerHTML = S.chats.map((c) => `<li draggable="true" data-id="${c.id}" aria-current="${c.id === S.activeId}" title="${esc(c.title)}">
      <span class="dotc" style="background:${c.color}"></span><span class="t">${esc(c.title)}</span><span class="m">${esc(MODES[c.mode].label.split(' ')[0])}</span></li>`).join('')
    || '';
  $('#userName').textContent = S.profile.name;
  $('#avatar').textContent = (S.profile.name || 'F').trim()[0]?.toUpperCase() || 'F';
}
$('#chatList').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li || e.target.closest('input')) return;
  S.activeId = li.dataset.id; det = null; save(); render();
});
$('#chatList').addEventListener('dragstart', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  e.dataTransfer.setData('text/x-crowdsight-chat', li.dataset.id); e.dataTransfer.effectAllowed = 'link';
});
$('#newChat').addEventListener('click', () => newChat());
$('#toggleChats').addEventListener('click', () => { S.rail = !S.rail; save(); applyRail(); });
function applyRail() { app.classList.toggle('rail', !!S.rail); }

// Context menu: rename, reference, delete
const ctx = $('#ctx'); let ctxId = null, delArmed = false;
$('#chatList').addEventListener('contextmenu', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  e.preventDefault(); ctxId = li.dataset.id; delArmed = false;
  ctx.querySelector('[data-ctx="delete"]').textContent = 'Delete';
  ctx.querySelector('[data-ctx="ref"]').hidden = ctxId === S.activeId;
  ctx.hidden = false; ctx.style.left = `${e.clientX}px`; ctx.style.top = `${e.clientY}px`;
});
ctx.addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.ctx; if (!a) return;
  const c = S.chats.find((x) => x.id === ctxId); if (!c) return;
  if (a === 'delete') {
    if (!delArmed) { delArmed = true; e.target.textContent = 'Click again to delete'; return; }
    S.chats = S.chats.filter((x) => x.id !== c.id);
    if (S.activeId === c.id) S.activeId = S.chats[0]?.id ?? null;
    save(); ctx.hidden = true; render(); return;
  }
  ctx.hidden = true;
  if (a === 'ref') addRef(mainC, c.id);
  if (a === 'rename') {
    const li = $(`#chatList li[data-id="${c.id}"] .t`); if (!li) return;
    const inp = document.createElement('input'); inp.value = c.title; inp.style.cssText = 'width:100%;border:1px solid var(--rule2);border-radius:6px;padding:2px 6px;background:var(--sheet)';
    li.replaceWith(inp); inp.focus(); inp.select();
    const done = () => { c.title = inp.value.trim() || c.title; save(); render(); };
    inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') done(); if (k.key === 'Escape') render(); });
    inp.addEventListener('blur', done);
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ctx')) ctx.hidden = true;
  if (!e.target.closest('.plusWrap')) $$('.plusMenu').forEach((m) => (m.hidden = true));
  if (!e.target.closest('#refMenu') && !e.target.closest('[data-pick="ref"]')) $('#refMenu').hidden = true;
  if (!e.target.closest('#modeBox')) { $('#modeMenu').hidden = true; $('#modeBtn').setAttribute('aria-expanded', 'false'); }
});

/* ---------------- Composer (main + persona) ---------------- */
function makeComposer({ placeholder, intent }) {
  const el = document.createElement('form'); el.className = 'composer'; el.autocomplete = 'off';
  el.innerHTML = `<div class="refs"></div>
    <textarea rows="${intent ? 3 : 2}" placeholder="${esc(placeholder)}"></textarea>
    <div class="composer-bar">
      <div class="plusWrap">
        <button type="button" class="icon" data-plus aria-label="Attach or reference"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
        <div class="menu plusMenu" role="menu" hidden style="bottom:calc(100% + 8px);left:0">
          <button type="button" data-pick="file">Files</button><button type="button" data-pick="photo">Photos</button>
          <button type="button" data-pick="video">Videos</button><button type="button" data-pick="ref">Reference a test</button>
        </div>
      </div>
      ${intent ? `<div class="intent" role="group" aria-label="Send as"><button type="button" data-intent="test" aria-pressed="true">Run test</button><button type="button" data-intent="ask" aria-pressed="false">Ask</button></div>` : ''}
      <span class="price"></span>
      <button type="submit" class="send" aria-label="Send"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </div>
    <input type="file" data-f="file" accept=".txt,.md,.csv,.json,text/*" multiple hidden>
    <input type="file" data-f="photo" accept="image/*" multiple hidden>
    <input type="file" data-f="video" accept="video/*" hidden>`;
  const C = { el, ta: $('textarea', el), atts: [], refs: [], mode: 'test', manual: false, onSend: null };
  const grow = () => { C.ta.style.height = 'auto'; C.ta.style.height = `${Math.min(220, C.ta.scrollHeight)}px`; };
  C.ta.addEventListener('input', () => { grow(); hint(C); });
  C.ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.requestSubmit(); } });
  $('[data-plus]', el).addEventListener('click', () => { const m = $('.plusMenu', el); m.hidden = !m.hidden; });
  $('.plusMenu', el).addEventListener('click', (e) => {
    const k = e.target.closest('button')?.dataset.pick; if (!k) return;
    $('.plusMenu', el).hidden = true;
    if (k === 'ref') openRefMenu(C, e.target.closest('button'));
    else $(`input[data-f="${k}"]`, el).click();
  });
  $$('input[type=file]', el).forEach((inp) => inp.addEventListener('change', () => { [...inp.files].forEach((f) => C.atts.push(f)); inp.value = ''; chips(C); }));
  $$('[data-intent]', el).forEach((b) => b.addEventListener('click', () => { C.mode = b.dataset.intent; C.manual = true; chips(C); }));
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('drop');
    const id = e.dataTransfer.getData('text/x-crowdsight-chat');
    if (id) return addRef(C, id);
    [...(e.dataTransfer.files || [])].forEach((f) => C.atts.push(f)); chips(C);
  });
  el.addEventListener('submit', (e) => { e.preventDefault(); C.onSend?.(C); });
  C.clear = () => { C.ta.value = ''; C.atts = []; C.refs = []; C.manual = false; grow(); chips(C); };
  return C;
}
function chips(C) {
  const r = $('.refs', C.el);
  r.innerHTML = C.refs.map((id, i) => { const c = S.chats.find((x) => x.id === id); return c ? `<span class="chip"><span class="dotc" style="background:${c.color};width:9px;height:9px"></span><span>Ref · ${esc(c.title)}</span><button type="button" class="x" data-rr="${i}" aria-label="Remove">×</button></span>` : ''; }).join('')
    + C.atts.map((f, i) => `<span class="chip"><span>${esc(f.type.startsWith('video') ? 'Video' : f.type.startsWith('image') ? 'Photo' : 'File')} · ${esc(f.name)}</span><button type="button" class="x" data-ra="${i}" aria-label="Remove">×</button></span>`).join('');
  $$('[data-rr]', r).forEach((b) => (b.onclick = () => { C.refs.splice(+b.dataset.rr, 1); chips(C); }));
  $$('[data-ra]', r).forEach((b) => (b.onclick = () => { C.atts.splice(+b.dataset.ra, 1); chips(C); }));
  $$('[data-intent]', C.el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.intent === C.mode));
  hint(C);
}
function hint(C) {
  const p = $('.price', C.el); if (!p) return;
  const c = active(); const done = c && tests(c).some((t) => t.v0?.length);
  if (!C.manual && $('[data-intent]', C.el)) { C.mode = done && /\?\s*$/.test(C.ta.value.trim()) ? 'ask' : 'test'; $$('[data-intent]', C.el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.intent === C.mode)); }
  const pr = priceOf(C.ta.value);
  p.textContent = C.mode === 'test' && pr != null ? `price £${pr}/mo` : '';
}
function addRef(C, id) { if (id === S.activeId || C.refs.includes(id)) return; C.refs.push(id); chips(C); C.ta.focus(); }
function openRefMenu(C, anchor) {
  const m = $('#refMenu'); const others = S.chats.filter((c) => c.id !== S.activeId);
  m.innerHTML = others.length ? others.map((c) => `<button type="button" data-id="${c.id}"><span class="dotc" style="background:${c.color};width:10px;height:10px"></span>${esc(c.title)}</button>`).join('') : '<div class="empty" style="padding:10px">No other tests yet.</div>';
  const r = anchor.getBoundingClientRect(); m.hidden = false;
  m.style.left = `${r.left}px`; m.style.top = `${Math.max(8, r.top - m.offsetHeight - 6)}px`;
  m.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; addRef(C, b.dataset.id); m.hidden = true; };
}

/* Attachments → text the crowd and agent can read */
async function frameOf(file) {
  const url = URL.createObjectURL(file);
  const img = new Image(); img.src = url; await img.decode();
  const cv = document.createElement('canvas'); const k = Math.min(1, 640 / img.width);
  cv.width = img.width * k; cv.height = img.height * k; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(url); return cv.toDataURL('image/jpeg', 0.7);
}
async function framesOfVideo(file, n = 6) {
  const url = URL.createObjectURL(file); const v = document.createElement('video'); v.src = url; v.muted = true;
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = j; });
  const cv = document.createElement('canvas'); const k = Math.min(1, 640 / v.videoWidth);
  cv.width = v.videoWidth * k; cv.height = v.videoHeight * k; const out = [];
  for (let i = 0; i < n; i++) { v.currentTime = ((i + 0.5) / n) * v.duration; await new Promise((r) => (v.onseeked = r)); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); out.push(cv.toDataURL('image/jpeg', 0.7)); }
  URL.revokeObjectURL(url); return out;
}
async function attachText(files) {
  const parts = [];
  for (const f of files) {
    try {
      if (f.type.startsWith('image') || f.type.startsWith('video')) {
        const frames = f.type.startsWith('video') ? await framesOfVideo(f) : [await frameOf(f)];
        const d = await post('/api/video', { frames });
        if (!d.error) parts.push(`[${f.type.startsWith('video') ? 'Video' : 'Image'} "${f.name}"] Claims: ${(d.claims || []).join('; ')}. On-screen text: ${(d.onScreenText || []).join('; ')}. Visual impression: ${(d.visualNotes || []).join('; ')}.`);
      } else {
        parts.push(`[File "${f.name}"] ${(await f.text()).slice(0, 3000)}`);
      }
    } catch (e) { console.error('[crowdsight] attachment', f.name, e); }
  }
  return parts.join('\n');
}
function refContext(ids) {
  return ids.map((id) => {
    const c = S.chats.find((x) => x.id === id); const t = lastTest(c); if (!c || !t) return '';
    const sm = t.summary;
    return `REFERENCED TEST "${c.title}" (${MODES[c.mode].label}): ${t.text}${sm ? ` | Verdict ${sm.verdict}: ${sm.headline} | Risks: ${sm.risks.join('; ')} | Next: ${sm.nextSteps.join('; ')}` : ''}${t.versions.length > 1 ? ` | Final version: ${t.versions[t.versions.length - 1].text}` : ''}`;
  }).filter(Boolean).join('\n');
}

/* ---------------- Page 1: mode box + population bar ---------------- */
function renderSetup(c) {
  const m = MODES[c.mode];
  $('#modeLabel').textContent = m.label;
  $('#modeMenu').innerHTML = Object.entries(MODES).map(([k, v]) => `<li role="option" data-m="${k}" aria-selected="${k === c.mode}"><b>${v.label}</b><span>${v.desc}</span></li>`).join('');
  $('#heroKicker').textContent = `${m.label} · 1,000 simulated people · 6 Nebius models · Tavily web grounding`;
  $('#heroTitle').innerHTML = { general: 'What are you putting in front of <em>a thousand</em> people?', ads: 'Show your ad to <em>a thousand</em> people.', pricing: 'Find the price <em>a thousand</em> people will pay.', launch: 'Launch it to <em>a thousand</em> people first.' }[c.mode];
  renderPop(c);
}
$('#modeBtn').addEventListener('click', () => { const m = $('#modeMenu'); m.hidden = !m.hidden; $('#modeBtn').setAttribute('aria-expanded', String(!m.hidden)); });
$('#modeMenu').addEventListener('click', (e) => {
  const li = e.target.closest('li'); const c = active(); if (!li || !c) return;
  c.mode = li.dataset.m; c.shares = { ...MODES[c.mode].shares }; save();
  $('#modeMenu').hidden = true; renderSetup(c); renderChats(); loadPersonas();
});
function renderPop(c) {
  const bar = $('#popBar');
  bar.innerHTML = SEGS.map((s) => `<div class="seg" style="width:${c.shares[s.id]}%;background:${s.c}">${c.shares[s.id] >= 7 ? c.shares[s.id] + '%' : ''}</div>`).join('');
  let acc = 0;
  SEGS.slice(0, -1).forEach((s, k) => { acc += c.shares[s.id]; const d = document.createElement('div'); d.className = 'div'; d.style.left = `${acc}%`; d.dataset.k = k; bar.appendChild(d); });
  $('#popLegend').innerHTML = SEGS.map((s) => `<div><b>${Math.round(c.shares[s.id] * 10)}</b><i style="background:${s.c}"></i>${s.label}</div>`).join('');
}
$('#popBar').addEventListener('pointerdown', (e) => {
  const d = e.target.closest('.div'); const c = active(); if (!d || !c) return;
  const k = +d.dataset.k; const bar = $('#popBar'); d.classList.add('drag'); d.setPointerCapture(e.pointerId);
  const ids = SEGS.map((s) => s.id);
  const move = (ev) => {
    const r = bar.getBoundingClientRect(); const x = Math.round(((ev.clientX - r.left) / r.width) * 100);
    const before = ids.slice(0, k).reduce((a, id) => a + c.shares[id], 0);
    const pair = c.shares[ids[k]] + c.shares[ids[k + 1]];
    const left = Math.max(2, Math.min(pair - 2, x - before));
    c.shares[ids[k]] = left; c.shares[ids[k + 1]] = pair - left; renderPop(c);
  };
  const up = () => { d.removeEventListener('pointermove', move); save(); loadPersonas(); };
  d.addEventListener('pointermove', move); d.addEventListener('pointerup', up, { once: true });
});

/* ---------------- Page 2: ledger ---------------- */
function stepLi(state, k, v) { return `<li class="${state || ''}"><span class="st"></span><span class="k">${k}</span><span class="v">${v}</span></li>`; }
const favs = (srcs) => { const d = [...new Set(srcs.map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; } }).filter(Boolean))].slice(0, 5); return `<span class="favs">${d.map((x) => `<img src="https://www.google.com/s2/favicons?domain=${x}&sz=32" alt="" title="${esc(x)}">`).join('')}</span>`; };
function renderLedger(c) {
  const L = $('#ledger');
  L.innerHTML = c.entries.map((e) => {
    if (e.kind === 'ask') return `<div class="ask"><div class="q">${esc(e.q)}</div>${e.a ? `<div class="a"><div class="who">Analyst · ${esc((e.model || '').split('/').pop())}</div>${esc(e.a)}</div>` : '<div class="a"><span class="mono" style="color:var(--ink3)">Reading the crowd…</span></div>'}</div>`;
    const t = e; const s = t.steps;
    const md = s.crowd.models || [];
    const ticks = `<span class="ticks">${md.map((n, i) => `<i style="background:${n ? MODEL_C[i] : 'var(--rule2)'};opacity:${n ? Math.min(1, 0.35 + n / 8) : 1}" title="model ${i + 1}: ${n} batches"></i>`).join('')}</span>`;
    const vs = t.versions.slice(1);
    return `<div class="test">
      <div class="no"><b>Test ${String(t.no).padStart(2, '0')}</b><span>${esc(MODES[c.mode].label)}</span>${t.price != null ? `<span>£${t.price}/mo</span>` : ''}</div>
      <div class="body">${esc(t.display || t.text)}</div>
      ${t.atts?.length || t.refs?.length ? `<div class="att">${(t.refs || []).map((r) => `<span class="chip"><span class="dotc" style="background:${r.color};width:9px;height:9px"></span><span>Ref · ${esc(r.title)}</span></span>`).join('')}${(t.atts || []).map((a) => `<span class="chip"><span>${esc(a)}</span></span>`).join('')}</div>` : ''}
      <ul class="steps">
        ${stepLi(s.market.state, 'Market', s.market.state === 'run' ? 'Searching the live web…' : `${s.market.cat ? `<b>${esc(s.market.cat)}</b> · ` : ''}${favs(t.sources || [])}${(t.sources || []).length} sources${t.brief?.competitors?.length ? ` · ${esc(t.brief.competitors.slice(0, 2).map((x) => x.name + (x.price ? ' ' + x.price : '')).join(', '))}` : ''}`)}
        ${s.crowd.state ? stepLi(s.crowd.state, 'Crowd', `<b class="num">${s.crowd.n.toLocaleString()}</b> / 1,000 reacted${ticks}${s.crowd.failed ? ` · ${s.crowd.failed} batches dropped` : ''}`) : ''}
        ${s.agent.state ? stepLi(s.agent.state, 'Agent', vs.length ? vs.map((v) => `v${v.version} <b>${esc(v.lever)}</b> ${v.score.toFixed(1)}`).join(' · ') : t.proposals.length ? `trying <b>${esc(t.proposals[t.proposals.length - 1].lever)}</b>: ${esc(t.proposals[t.proposals.length - 1].reason)}` : 'Reading the reactions…') : ''}
        ${s.summary.state ? stepLi(s.summary.state, 'Summary', t.summary ? `<b>${esc(t.summary.verdict)}</b> · ${esc(t.summary.headline)}` : 'Writing the final summary…') : ''}
        ${t.error ? stepLi('bad', 'Stopped', esc(t.error)) : ''}
      </ul>
    </div>`;
  }).join('');
  L.scrollTop = L.scrollHeight;
}

/* ---------------- Summary box ---------------- */
let curStats = null;
function renderSummary(c) {
  const box = $('#summaryBox'); const t = lastTest(c);
  if (!t) { box.innerHTML = `<div class="box-head"><span class="kicker">Summary</span></div><div class="empty">Run a test and the crowd's verdict lands here.</div>`; return; }
  const st = (curStats = stats(c, t));
  const start = t.versions[0]?.score, end = t.versions.length ? t.versions[t.versions.length - 1].score : st.launch;
  const vc = { Strong: '#1E9A68', Promising: '#0E9F94', Mixed: '#D98E04', Weak: '#D2453E' }[t.summary?.verdict] || 'var(--ink)';
  const k2 = { general: [pct(st.pos), 'are for it'], ads: [`${pct(st.click)}<small> / ${pct(st.buy)}</small>`, 'would click / buy'], pricing: [pct(st.pay), `would pay £${st.price ?? '—'}`], launch: [pct(st.try30), 'would try in 30 days'] }[c.mode];
  const cols = {
    general: [['For', (x) => pct(x.pos), (x) => x.pos], ['Against', (x) => pct(x.neg), (x) => x.neg], ['Intent', (x) => pct(x.intent), (x) => x.intent]],
    ads: [['Click', (x) => pct(x.click), (x) => x.click], ['Buy', (x) => pct(x.buy), (x) => x.buy], ['Share', (x) => pct(x.share), (x) => x.share]],
    pricing: [[`Pay £${st.price ?? '—'}`, (x) => pct(x.pay), (x) => x.pay], ['Median max', (x) => (x.median != null ? `£${x.median}` : '—'), null], ['Intent', (x) => pct(x.intent), (x) => x.intent]],
    launch: [['Try in 30d', (x) => pct(x.try30), (x) => x.try30], ['Intent', (x) => pct(x.intent), (x) => x.intent], ['Share', (x) => pct(x.share), (x) => x.share]],
  }[c.mode];
  const running = t.steps.crowd.state === 'run' || t.steps.agent.state === 'run' || t.steps.summary.state === 'run';
  box.innerHTML = `<div class="box-head"><span class="kicker">Summary · Test ${String(t.no).padStart(2, '0')}</span><span class="r">${running ? 'live' : 'simulated market response'}</span></div>
    <div class="box-body">
      ${t.summary ? `<span class="verdict" style="background:${vc}">${esc(t.summary.verdict)}</span><div class="headline">${esc(t.summary.headline)}</div><div class="changed">${esc(t.summary.whatChanged)}</div>`
        : `<div class="headline" style="color:var(--ink3)">${st.rs.length ? 'The crowd is reacting…' : 'Searching the market…'}</div>`}
      <div class="kpis">
        <div class="kpi"><div class="v">${(end ?? st.launch).toFixed(1)}${start != null && end != null && t.versions.length > 1 ? ` <small class="${end - start >= 0 ? 'up' : 'down'}">${end - start >= 0 ? '+' : ''}${(end - start).toFixed(1)}</small>` : ''}</div><div class="k">Launch Score</div></div>
        <div class="kpi"><div class="v">${k2[0]}</div><div class="k">${k2[1]}</div></div>
        <div class="kpi"><div class="v">${st.diversity.toFixed(0)}</div><div class="k">Diversity, 6 models</div></div>
        <div class="kpi"><div class="v">${st.rs.length.toLocaleString()}</div><div class="k">of 1,000 reacted</div></div>
      </div>
      <canvas class="crowd" id="crowdCv" aria-label="1,000 personas coloured by stance"></canvas>
      <div class="legend"><span><i style="background:var(--neg)"></i>Against</span><span><i style="background:var(--mid)"></i>Unsure</span><span><i style="background:var(--pos)"></i>For</span><span style="margin-left:auto">click a row or a dot to open that group</span></div>
      <table class="segs"><thead><tr><th>Group</th><th>People</th>${cols.map((x) => `<th>${x[0]}</th>`).join('')}<th>Score</th><th>Top objection</th></tr></thead>
        <tbody>${st.segs.map((x) => `<tr data-seg="${x.s.id}" aria-selected="${det?.seg === x.s.id}"><td><span class="sw" style="background:${x.s.c}"></span>${x.s.label}</td><td class="n">${x.n}</td>${cols.map((col) => `<td class="n">${col[1](x)}${col[2] ? `<div class="bar"><i style="width:${Math.round(col[2](x) * 100)}%;background:${x.s.c}"></i></div>` : ''}</td>`).join('')}<td class="n">${x.n ? x.score.toFixed(1) : '—'}</td><td class="obj">${esc(x.top?.t ?? '—')}</td></tr>`).join('')}</tbody></table>
    </div>`;
  $$('tbody tr', box).forEach((tr) => tr.addEventListener('click', () => openDet(tr.dataset.seg, null)));
  draw();
}
function draw() {
  const cv = $('#crowdCv'); const c = active(); if (!cv || !c) return; const t = lastTest(c); if (!t) return;
  const byId = new Map(reactionsOf(t).map((r) => [r.personaId, r]));
  const w = cv.clientWidth || 500, cols = 50, g = w / cols, rows = 20, h = rows * g, dpr = devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = `${h}px`;
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const n = PERS.length || 1000; const rad = Math.min(4.2, g * 0.36);
  for (let i = 0; i < n; i++) {
    const id = PERS[i]?.id ?? `p${String(i).padStart(4, '0')}`; const r = byId.get(id);
    x.fillStyle = r ? stanceColor(r.stance) : '#E3DED2';
    if (det && PERS[i] && PERS[i].segment !== det.seg) x.globalAlpha = 0.25; else x.globalAlpha = 1;
    x.beginPath(); x.arc((i % cols + 0.5) * g, (Math.floor(i / cols) + 0.5) * g, rad, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  cv.onclick = (e) => { const r = cv.getBoundingClientRect(); const i = Math.floor((e.clientY - r.top) / g) * cols + Math.floor((e.clientX - r.left) / g); const p = PERS[i]; if (p) openDet(p.segment, p.id); };
}
function stanceColor(s) {
  const neg = [210, 69, 62], mid = [184, 177, 161], pos = [30, 154, 104];
  const [a, b, k] = s < 0 ? [mid, neg, Math.min(1, -s * 1.3)] : [mid, pos, Math.min(1, s * 1.3)];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

/* ---------------- Advice box ---------------- */
function renderAdvice(c) {
  const box = $('#adviceBox'); const t = lastTest(c);
  const head = `<div class="box-head"><span class="kicker">Advice</span><span class="r">${t?.summary ? 'from the advice agent' : t ? 'agent working' : ''}</span></div>`;
  if (!t) { box.innerHTML = head + `<div class="empty">The advice agent reads every reaction and tells you what to change.</div>`; return; }
  const items = [];
  t.proposals.forEach((p) => {
    const best = Math.max(...p.scores.filter((x) => typeof x === 'number'), -Infinity);
    items.push({ tag: ['agent', `Tried ${p.lever}`], tx: p.reason, sub: p.applied === true ? `Applied. Best variant ${best.toFixed(1)} vs current ${p.baseline?.toFixed(1) ?? '—'} on the same 200 people.` : p.applied === false ? `Kept the current version: best variant ${Number.isFinite(best) ? best.toFixed(1) : '—'} vs ${p.baseline?.toFixed(1) ?? '—'}, under the 2-point bar.` : `Testing 3 variants on the same 200 people${p.scores.some((x) => x != null) ? `: ${p.scores.map((x) => (x == null ? '…' : typeof x === 'number' ? x.toFixed(1) : 'skipped')).join(' · ')}` : '…'}` });
  });
  if (t.summary) {
    t.summary.nextSteps.forEach((x) => items.push({ tag: ['act', 'Do'], tx: x }));
    t.summary.risks.forEach((x) => items.push({ tag: ['risk', 'Risk'], tx: x }));
    t.summary.worked.forEach((x) => items.push({ tag: ['keep', 'Keep'], tx: x }));
  }
  const fin = t.versions.length > 1 ? t.versions[t.versions.length - 1] : null;
  box.innerHTML = head + `<div class="box-body">
    ${fin ? `<div class="adv"><span class="ix">★</span><div><span class="tag keep">Use this version</span><div class="tx" style="margin-top:6px;font-size:15px">${esc(fin.text)}</div><div class="sub">v${fin.version} · Launch Score ${fin.score.toFixed(1)}${fin.price != null ? ` · £${fin.price}/mo` : ''}</div></div></div>` : ''}
    ${items.map((x, i) => `<div class="adv"><span class="ix">${i + 1}</span><div><span class="tag ${x.tag[0]}">${esc(x.tag[1])}</span><span class="tx">${esc(x.tx)}</span>${x.sub ? `<div class="sub">${esc(x.sub)}</div>` : ''}</div></div>`).join('')
      || `<div class="empty" style="padding:6px 0">${t.steps.agent.state === 'run' ? 'The optimiser is reading the reactions…' : 'Advice appears once the crowd has reacted.'}</div>`}
  </div>`;
}

/* ---------------- Persona-details column ---------------- */
let det = null; // {seg, pid}
let detC = null;
function openDet(seg, pid) { det = { seg, pid }; renderWork(); setTimeout(() => detC?.ta.focus(), 50); }
function renderDet(c) {
  const pane = $('#detPane'); const work = $('#work');
  const t = lastTest(c);
  if (!det || !t) { pane.hidden = true; $('#detHandle').hidden = true; work.classList.add('nodet'); return; }
  pane.hidden = false; $('#detHandle').hidden = false; work.classList.remove('nodet');
  const st = curStats || stats(c, t); const seg = SEGS.find((s) => s.id === det.seg); const x = st.segs.find((s) => s.s.id === det.seg);
  const people = PERS.filter((p) => p.segment === det.seg).map((p) => ({ p, r: st.byId.get(p.id) })).filter((o) => o.r).sort((a, b) => b.r.stance - a.r.stance);
  const target = det.pid ? PERS.find((p) => p.id === det.pid) : null;
  const key = `${t.no}:${det.pid || det.seg}`; const th = (c.pchat[key] ||= []);
  const col = target ? MODEL_C[target.model % 6] : seg.c;
  pane.innerHTML = `<div class="det-head"><span class="sw" style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${seg.c}"></span><h2>${esc(seg.label)}</h2><button class="icon" id="detClose" aria-label="Close">×</button></div>
    <div class="det-stats">${x.n} people · score ${x.score.toFixed(1)} · for ${pct(x.pos)} · against ${pct(x.neg)} · intent ${pct(x.intent)}</div>
    <div class="plist" id="plist">${people.map((o) => `<div class="prow" data-pid="${o.p.id}" aria-selected="${o.p.id === det.pid}"><span class="dotc" style="background:${MODEL_C[o.p.model % 6]};width:10px;height:10px;margin-top:4px" title="model ${o.p.model + 1}"></span><div><div class="nm">${esc(o.p.name)}, <span class="mono">${o.p.age}</span></div><div class="rl">${esc(o.p.role)} · ${esc(o.p.stake.replace('_', ' '))}</div><div class="qt">"${esc(o.r.quote)}"</div></div><div class="sv" style="color:${stanceColor(o.r.stance)}">${o.r.stance > 0 ? '+' : ''}${o.r.stance.toFixed(2)}</div></div>`).join('') || '<div class="empty">No reactions in this group yet.</div>'}</div>
    <div class="target">${target ? `Talking to <b>${esc(target.name)}</b> · <span class="mono">${esc(String(st.byId.get(target.id)?.model || '').split('/').pop())}</span> · <button type="button" id="toSeg">talk to the whole group</button>` : `Talking to the <b>${esc(seg.label.toLowerCase())}</b> agent · <span class="mono">pick a person to talk to them alone</span>`}</div>
    <div class="thread" id="thread" style="--c:${col}">${th.map((m) => (m.role === 'user' ? `<div class="turn u">${esc(m.content)}</div>` : `<div class="turn a"><div class="who">${esc(m.who || '')}</div>${esc(m.content)}</div>`)).join('') || `<div class="empty" style="padding:4px 0">Ask ${target ? esc(target.name.split(' ')[0]) : 'this group'} why they reacted the way they did.</div>`}</div>`;
  if (!detC) { detC = makeComposer({ placeholder: 'Ask them anything…', intent: false }); detC.onSend = sendPersona; }
  detC.ta.placeholder = target ? `Ask ${target.name.split(' ')[0]} anything…` : 'Ask this group anything…';
  pane.appendChild(detC.el);
  $('#detClose').onclick = () => { det = null; renderWork(); };
  $('#toSeg')?.addEventListener('click', () => { det.pid = null; renderDet(c); });
  $$('.prow', pane).forEach((r) => (r.onclick = () => { det.pid = r.dataset.pid; renderDet(c); }));
  const sel = $('.prow[aria-selected="true"]', pane); if (sel) sel.scrollIntoView({ block: 'nearest' });
  $('#thread').scrollTop = 1e9;
}
async function sendPersona(C) {
  const c = active(); const t = lastTest(c); if (!c || !t || !det) return;
  let msg = C.ta.value.trim(); if (!msg && !C.atts.length) return;
  const extra = [await attachText(C.atts), refContext(C.refs)].filter(Boolean).join('\n');
  if (extra) msg += `\n\n${extra}`;
  const key = `${t.no}:${det.pid || det.seg}`; const th = (c.pchat[key] ||= []);
  th.push({ role: 'user', content: msg }); C.clear(); renderDet(c);
  const st = curStats || stats(c, t);
  const reactions = det.pid ? [st.byId.get(det.pid)].filter(Boolean) : st.segs.find((s) => s.s.id === det.seg).rs;
  const target = det.pid ? PERS.find((p) => p.id === det.pid) : null;
  const pend = { role: 'assistant', content: '…', who: target ? target.name : SEGS.find((s) => s.id === det.seg).label };
  th.push(pend); renderDet(c);
  const d = await post('/api/persona-chat', { kind: det.pid ? 'persona' : 'segment', segment: det.seg, personaId: det.pid, shares: c.shares, importance: IMP, pitch: currentText(t), mode: MODES[c.mode].label, brief: t.briefStr, reactions, history: th.slice(0, -2).map(({ role, content }) => ({ role, content })), message: msg }).catch((e) => ({ error: String(e) }));
  pend.content = d.reply || `No reply (${d.error || 'error'}).`;
  pend.who = `${pend.who}${d.model ? ` · ${d.model.split('/').pop()}` : ''}`;
  save(); if (active() === c) renderDet(c);
}
const currentText = (t) => (t.versions.length > 1 ? t.versions[t.versions.length - 1].text : t.text);

/* ---------------- Send: run a test, or ask the analyst ---------------- */
const mainC = makeComposer({ placeholder: 'Paste an ad, a price change or a launch. Revise it as often as you like.', intent: true });
mainC.onSend = sendMain;
async function sendMain(C) {
  let c = active() || newChat();
  const typed = C.ta.value.trim(); if (!typed && !C.atts.length) return;
  const files = [...C.atts]; const refs = [...C.refs]; const mode = C.mode;
  C.clear();
  if (mode === 'ask' && tests(c).some((t) => t.v0?.length)) return ask(c, typed, refs);
  const extra = await attachText(files);
  const text = [typed, extra].filter(Boolean).join('\n\n');
  if (c.title === 'New test') c.title = typed.slice(0, 42) || files[0]?.name || 'Untitled test';
  const t = {
    kind: 'test', no: tests(c).length + 1, text, display: typed, price: priceOf(text), atts: files.map((f) => f.name),
    refs: refs.map((id) => { const r = S.chats.find((x) => x.id === id); return { id, title: r?.title, color: r?.color }; }),
    steps: { market: { state: 'run' }, crowd: { state: '', n: 0, failed: 0, models: [0, 0, 0, 0, 0, 0] }, agent: { state: '' }, summary: { state: '' } },
    sources: [], brief: null, briefStr: '', v0: [], fin: null, versions: [], proposals: [], summary: null,
  };
  c.entries.push(t); S.rail = true; applyRail(); save(); render();
  run(c, t, refContext(refs)).catch((e) => { t.error = String(e.message || e); save(); paint(c); });
}
let paintQ = null;
function paint(c) { if (paintQ) return; paintQ = requestAnimationFrame(() => { paintQ = null; if (active() === c) { renderLedger(c); renderSummary(c); renderAdvice(c); if (det) renderDet(c); } }); }
async function runPipeline(c, t, refCtx) {
  const type = MODES[c.mode].type; const base = { type, shares: c.shares, importance: IMP };
  // 1. Market (Tavily + Nebius brief)
  await sse('/api/ground', { pitch: t.text }, (ev, d) => {
    if (ev === 'category') t.steps.market.cat = d.category;
    if (ev === 'ground_source') t.sources.push({ title: d.title, url: d.url });
    if (ev === 'brief') t.brief = d;
    paint(c);
  }).catch(() => {});
  if (t.brief) t.briefStr = `Competitors: ${t.brief.competitors.map((x) => `${x.name}${x.price ? ` (${x.price})` : ''}`).join(', ') || 'unknown'}. Known pain points: ${t.brief.painPoints.join('; ')}. Trends: ${t.brief.trends.join('; ')}.`;
  t.steps.market.state = 'ok'; t.steps.crowd.state = 'run'; save(); paint(c);
  // 2. Crowd
  await sse('/api/crowd', { ...base, text: t.text, price: t.price, brief: t.briefStr || undefined }, (ev, d) => {
    if (ev === 'batch_done') { t.v0.push(...d.reactions); t.steps.crowd.n = t.v0.length; if (d.modelIdx >= 0) t.steps.crowd.models[d.modelIdx]++; paint(c); }
    if (ev === 'batch_failed') { t.steps.crowd.failed++; paint(c); }
  });
  t.steps.crowd.state = t.v0.length ? 'ok' : 'bad'; save(); paint(c);
  if (!t.v0.length) { t.error = 'No reactions came back from Nebius. Try again in a moment.'; save(); paint(c); return; }
  // 3. Agent loop + final summary
  t.steps.agent.state = 'run'; paint(c);
  const confirm = new Map();
  await sse('/api/optimise', { ...base, text: t.text, price: t.price, reactions: t.v0, brief: [t.briefStr, refCtx].filter(Boolean).join('\n') || undefined }, (ev, d) => {
    if (ev === 'proposal') t.proposals.push({ iter: d.iter, lever: d.lever, reason: d.reason, variants: d.variants, scores: d.variants.map(() => null), baseline: null, applied: null });
    const p = t.proposals[t.proposals.length - 1];
    if (ev === 'variant_done' && p) p.scores[d.variant] = d.rejected ? 'skipped' : d.score;
    if (ev === 'baseline' && p) p.baseline = d.baseline;
    if (ev === 'iter_done' && p) p.applied = !!d.applied;
    if (ev === 'batch_done' && d.phase === 'confirm' && d.iter > 0) { if (!confirm.has(d.iter)) confirm.set(d.iter, []); confirm.get(d.iter).push(...d.reactions); }
    if (ev === 'version') { t.versions.push({ version: d.version, text: d.text, price: d.price, score: d.score, lever: d.lever, change: d.change }); if (d.version > 0 && confirm.get(d.version)?.length > 500) t.fin = confirm.get(d.version); }
    if (ev === 'summary_start') { t.steps.agent.state = 'ok'; t.steps.summary.state = 'run'; }
    if (ev === 'summary') { t.summary = d; t.steps.summary.state = 'ok'; }
    if (ev === 'loop_done') { t.endReason = d.reason; t.steps.agent.state = 'ok'; if (t.steps.summary.state === 'run') t.steps.summary.state = t.summary ? 'ok' : 'bad'; }
    paint(c);
  });
  save(); paint(c); renderChats();
}
async function ask(c, q, refs) {
  const e = { kind: 'ask', q, a: '' }; c.entries.push(e); save(); paint(c);
  const t = lastTest(c); const st = stats(c, t);
  const context = [
    `MODE: ${MODES[c.mode].label}`, `ORIGINAL: ${t.text}`, `CURRENT: ${currentText(t)}`,
    `VERSIONS: ${t.versions.map((v) => `v${v.version} ${v.score.toFixed(1)} ${v.lever || 'baseline'}: ${v.change}`).join(' | ')}`,
    `SEGMENTS: ${st.segs.map((x) => `${x.s.label}: n ${x.n}, score ${x.score.toFixed(1)}, for ${pct(x.pos)}, against ${pct(x.neg)}, intent ${pct(x.intent)}, click ${pct(x.click)}, buy ${pct(x.buy)}${st.price ? `, pay £${st.price} ${pct(x.pay)}` : ''}, top objection: ${x.top?.t || '-'}`).join(' | ')}`,
    t.summary ? `SUMMARY: ${t.summary.verdict}: ${t.summary.headline}. Worked: ${t.summary.worked.join('; ')}. Risks: ${t.summary.risks.join('; ')}. Next: ${t.summary.nextSteps.join('; ')}` : '',
    t.briefStr ? `MARKET: ${t.briefStr}` : '',
    `SAMPLE QUOTES: ${[...st.rs].sort((a, b) => b.stance - a.stance).filter((_, i, a) => i < 6 || i >= a.length - 6).map((r) => `(${r.stance.toFixed(2)}) "${r.quote}"`).join(' | ')}`,
    refContext(refs),
  ].filter(Boolean).join('\n');
  const history = c.entries.filter((x) => x.kind === 'ask' && x.a).slice(-3).flatMap((x) => [{ role: 'user', content: x.q }, { role: 'assistant', content: x.a }]);
  const d = await post('/api/ask', { question: q, context, history }).catch((er) => ({ error: String(er) }));
  e.a = d.reply || `No answer (${d.error || 'error'}).`; e.model = d.model; save(); paint(c);
}

/* ---------------- Layout ---------------- */
function renderWork() { const c = active(); if (!c) return; renderLedger(c); renderSummary(c); renderAdvice(c); renderDet(c); }
function render() {
  if (!S.chats.length) { newChat(); return; }
  if (!active()) S.activeId = S.chats[0].id;
  const c = active(); applyRail(); renderChats();
  const page2 = c.entries.length > 0;
  app.classList.toggle('page1', !page2);
  $('#setup').hidden = page2; $('#work').hidden = !page2;
  if (page2) {
    $('#workComposerSlot').appendChild(mainC.el);
    $('#lockMode').textContent = MODES[c.mode].label; $('#chatTitle').textContent = c.title;
    renderWork();
  } else {
    $('#setupComposerSlot').appendChild(mainC.el); renderSetup(c);
  }
  hint(mainC); loadPersonas();
}
const inflight = new Set();
async function run(c, t, r) { inflight.add(t); try { await runPipeline(c, t, r); } finally { inflight.delete(t); } }

// Resizable columns and rows
$$('[data-resize]').forEach((h) => h.addEventListener('pointerdown', (e) => {
  const kind = h.dataset.resize; h.classList.add('drag'); h.setPointerCapture(e.pointerId);
  const work = $('#work'); const mid = $('#midPane');
  const move = (ev) => {
    if (kind === 'chat') work.style.setProperty('--chatW', `${Math.max(280, Math.min(620, ev.clientX - work.getBoundingClientRect().left))}px`);
    if (kind === 'det') work.style.setProperty('--detW', `${Math.max(300, Math.min(640, work.getBoundingClientRect().right - ev.clientX))}px`);
    if (kind === 'sum') { const r = mid.getBoundingClientRect(); mid.style.setProperty('--sumH', `${Math.max(20, Math.min(85, ((ev.clientY - r.top) / r.height) * 100))}%`); }
  };
  const up = () => { h.classList.remove('drag'); h.removeEventListener('pointermove', move); draw(); };
  h.addEventListener('pointermove', move); h.addEventListener('pointerup', up, { once: true });
}));
addEventListener('resize', () => draw());

// Profile
$('#userBtn').addEventListener('click', () => {
  $('#pfName').value = S.profile.name;
  $('#pfMode').innerHTML = Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === S.profile.mode ? 'selected' : ''}>${v.label}</option>`).join('');
  $('#profile').showModal();
});
$('#profile').addEventListener('close', () => {
  const v = $('#profile').returnValue;
  if (v === 'save') { S.profile.name = $('#pfName').value.trim() || 'Founder'; S.profile.mode = $('#pfMode').value; save(); renderChats(); }
});
let clearArmed = false;
$('#pfClear').addEventListener('click', (e) => {
  if (!clearArmed) { e.preventDefault(); clearArmed = true; e.target.textContent = 'Click again to clear'; return; }
  S.chats = []; S.activeId = null; clearArmed = false; e.target.textContent = 'Clear all tests'; save(); render();
});

// Tests that were mid-run when the page was closed cannot resume: mark them once, on load.
S.chats.forEach((c) => tests(c).forEach((t) => ['market', 'crowd', 'agent', 'summary'].forEach((k) => {
  if (t.steps[k].state === 'run') { t.steps[k].state = 'bad'; t.error ||= 'Interrupted when the page closed. Send it again to re-run.'; }
})));
render();
})();
