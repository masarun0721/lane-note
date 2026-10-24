// v0.29.4 自己点検の直し：調査の答えに端末の印（d1・dv）・別の端末からの書きかえを顧問の画面に出す・ヘッダ・Worker・ルール
//   Chrome・ローカル・偽の Firebase（fake_firebase.mjs）・架空データだけ
//   node v0294_security.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.4] 自己点検の直し');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const ROWS = [rec({ name: '架空 一郎' }), rec({ name: '架空 一郎', event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ name: '架空 二郎', grade: '1', mark: '12.80' }), rec({ name: '架空 二郎', grade: '1', event: '男子200m', mark: '26.10' }), rec({ name: '架空 三郎', grade: '3', mark: '12.10' })];
const D = E.data(R, ROWS), K = n => D.athletes.find(a => a.name === n).key, EV = (n, l) => D.athletes.find(a => a.name === n).events.find(e => e.label === l).ev;
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'), FJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
await check('ルール：answers に d1・dv（16文字）。作るときは d1==dv、上書きでは d1 を変えられない。meets/{k} は形を検査', () => {
  assert.match(RULES, /'join', 'd1', 'dv'\]\)/); assert.match(RULES, /request\.resource\.data\.d1 == request\.resource\.data\.dv/);   // v0.29.7（R296-01）作るときは d1・dv が必ず要る
  assert.match(RULES, /request\.resource\.data\.get\('d1', ''\) == resource\.data\.get\('d1', ''\)/); assert.match(RULES, /allow create, update: if activeMember\(t\) && validTeamMeet\(request\.resource\.data\)/);
  assert.match(RULES, /今のアプリは締切＋30日/);
});
await check('firebase.json：nosniff・Referrer-Policy・X-Frame-Options・CSP（Report-Only・frame-ancestors・Firebase は版を固定した gstatic だけ）', () => {
  const h = Object.fromEntries(FJ.hosting.headers.find(x => x.source === '**').headers.map(x => [x.key, x.value]));
  assert.equal(h['X-Content-Type-Options'], 'nosniff'); assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin'); assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
  const c = h['Content-Security-Policy-Report-Only']; assert.match(c, /frame-ancestors 'self'/); assert.match(c, /object-src 'none'/); assert.match(c, /https:\/\/www\.gstatic\.com\/firebasejs\/10\.14\.1\//);
});
await check('Worker：古い github.io の Origin は通さない', async () => {
  const w = await import('../../worker/worker.js'); const r = await w.default.fetch(new Request('https://x.invalid/?url=' + encodeURIComponent('https://example.com/'), { headers: { Origin: 'https://masarun0721.github.io' } }), {});
  assert.equal(r.status, 403);
});
await check('send：はじめは作る（d1=dv）、同じ端末の上書きは d1 そのまま、別の端末なら dv だけ変わる → 顧問の answers で moved', async () => {
  const db = {}; let dev = 'AAAAAAAAAAAAAAAA'; const DEL = { del: 1 };
  const F = { doc: (fs, ...p) => ({ k: p.join('/') }), serverTimestamp: () => 'TS', deleteField: () => DEL,
    async updateDoc(r, v) { if (!db[r.k]) throw Object.assign(new Error('nf'), { code: 'not-found' }); const o = Object.assign({}, db[r.k], v); for (const k in v) if (v[k] === DEL) delete o[k]; if ('d1' in v) throw new Error('d1 を上書きした'); db[r.k] = o; },
    async setDoc(r, v) { if (db[r.k]) throw Object.assign(new Error('pd'), { code: 'permission-denied' }); db[r.k] = Object.assign({}, v); },
    collection: (fs, ...p) => p.join('/'), async getDocs(c) { return Object.keys(db).filter(k => k.startsWith(c + '/')).map(k => ({ id: k.slice(c.length + 1), data: () => db[k] })); } };
  globalThis.localStorage = { getItem: () => dev, setItem: (k, v) => { dev = v; } };
  const st = S.student({ F, fs: {} }), sv = { id: 'X'.repeat(24), roster: [{ n: '架空 一郎' }, { n: '架空 二郎' }], evs: ['男子100m'], rels: [], expireAt: 1 };
  await st.send(sv, 0, { ev1: '男子100m', join: true }); assert.equal(db['surveys/' + sv.id + '/answers/r0'].d1, 'AAAAAAAAAAAAAAAA');
  await st.send(sv, 0, { ev1: '', cm: 'やっぱり', join: true }); assert.equal(db['surveys/' + sv.id + '/answers/r0'].dv, 'AAAAAAAAAAAAAAAA');
  dev = 'BBBBBBBBBBBBBBBB'; await st.send(sv, 0, { join: false }); const a = db['surveys/' + sv.id + '/answers/r0']; assert.deepEqual([a.d1, a.dv, a.join, a.ev1], ['AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBB', false, '']);
  const getDocs = F.getDocs; const co = S.coach({ F: Object.assign({}, F, { getDocs: async c => { const x = await getDocs(c); return { forEach: f => x.forEach(f) }; } }), fs: {} }, 'u'); const ans = await co.answers(sv.id);
  assert.equal(ans[0].moved, true); assert.deepEqual(S.movedNames(sv, ans), ['架空 一郎']);
  delete globalThis.localStorage;
});
await check('v0.29.7（R296-01）印なしで送り直さない：ルールに断られたら、そのままエラー（d1・dv のない答えは作らない）', async () => {
  const db = {}, tries = []; const bad = v => 'd1' in v || 'dv' in v, PD = () => Object.assign(new Error('pd'), { code: 'permission-denied' });
  const F = { doc: (fs, ...p) => ({ k: p.join('/') }), serverTimestamp: () => 'TS', deleteField: () => ({}),
    async updateDoc(r, v) { tries.push('u'); if (!db[r.k]) throw Object.assign(new Error('nf'), { code: 'not-found' }); if (bad(v)) throw PD(); db[r.k] = Object.assign({}, db[r.k], v); },
    async setDoc(r, v) { tries.push(bad(v) ? 's+' : 's'); if (bad(v)) throw PD(); db[r.k] = Object.assign({}, v); } };
  globalThis.localStorage = { getItem: () => 'AAAAAAAAAAAAAAAA', setItem() {} };
  const st = S.student({ F, fs: {} }), sv = { id: 'X'.repeat(24), roster: [{ n: '架空 一郎' }], evs: ['男子100m'], rels: [], expireAt: 1 };
  await assert.rejects(st.send(sv, 0, { ev1: '男子100m', join: true }), e => e.code === 'permission-denied');
  assert.deepEqual(tries, ['u', 's+']); assert.equal(db['surveys/' + sv.id + '/answers/r0'], undefined);
  delete globalThis.localStorage;
});
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
const ALICE = { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' };
async function page(W, user) {
  const p = await b.newPage(); await p.setViewport({ width: W, height: 900 }); const errs = [];
  await p.setRequestInterception(true); install(p, B); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(u => { localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); if (u) localStorage.setItem('__fakeuser', JSON.stringify(u)); else localStorage.removeItem('__fakeuser'); }, user);
  return { p, errs };
}
try {
  const { p, errs } = await page(1280, ALICE);
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); }); await p.goto(B + 'records.html', { waitUntil: 'load' }); await p.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(800);
  await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  const f = path.join(fs.mkdtempSync('/tmp/v0294-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: ROWS })); await (await p.$('#rbImport')).uploadFile(f); await sl(2500);
  await p.click('#rbEntryOpen'); await sl(300);
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(800);
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="new"]').click()); await sl(300);
  await p.evaluate(() => { const i = document.querySelector('#rbEntry [data-svf="meet"]'); i.value = '架空 秋季大会'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="create"]').click()); await sl(1200);
  const SID = /\?q=([A-Za-z0-9]{24})$/.exec(await p.evaluate(() => document.getElementById('rbSvLink').value))[1];
  const { p: s } = await page(390, null);
  await s.goto(B + '?q=' + SID, { waitUntil: 'load' }); await s.waitForSelector('#svBody .sv-name', { timeout: 15000 }); await sl(300);
  const send = async (n, ev, dev) => {
    await s.evaluate(d => localStorage.setItem('lanenote.dev.v1', d), dev);
    await s.evaluate(n => [...document.querySelectorAll('.sv-name')].find(x => x.innerText.includes(n)).click(), n); await sl(150);
    const j = await s.$('[data-svjoin="1"]'); if (j) { await j.click(); await sl(100); }
    await s.evaluate(ev => document.querySelector('[data-svev1="' + ev + '"]').click(), ev); await sl(100);
    const rn = await s.$('[data-svrelay="no"]'); if (rn) { await rn.click(); await sl(100); }
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
  };
  await send('架空 一郎', '男子100m', 'DevAAAAAAAAAAAA1'); await send('架空 二郎', '男子100m', 'DevBBBBBBBBBBBB2');
  await s.goto(B + '?q=' + SID, { waitUntil: 'load' }); await s.waitForSelector('#svBody .sv-name', { timeout: 15000 }); await sl(300);
  await send('架空 一郎', '男子100m', 'DevCCCCCCCCCCCC3');   // 別の端末から 架空 一郎 を書きかえ
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="reans"]').click()); await sl(900);
  await check('顧問の答えの画面：「⚠ 別の端末から書きかえられた答え」（架空 一郎だけ）。止めはしない', async () => {
    const t = await p.evaluate(() => [document.querySelector('#rbEntry .sv-movedbox')?.innerText || '', [...document.querySelectorAll('#rbEntry .sv-ans tr.sv-mvrow')].map(r => r.cells[0].innerText)]);
    assert.match(t[0], /別の端末から書きかえられた答えがあります（1人：架空 一郎）/); assert.equal(t[1].length, 1); assert.match(t[1][0], /架空 一郎.*別の端末/);
    assert.equal(await p.evaluate(() => document.querySelector('#rbEntry [data-sv="jaafgo"]').disabled), false);
    if (SHOT) { const c = await p.evaluate(() => { const e = document.querySelector('#rbEntry .sv-cur'); e.scrollIntoView({ block: 'start' }); const a = e.getBoundingClientRect(); return { x: 0, y: a.top + scrollY - 10, width: 1280, height: Math.min(1100, a.height + 20) }; }); await p.screenshot({ path: path.join(SHOT, 'v0294_moved_answers_pc.png'), clip: c, captureBeyondViewport: true }); }
  });
  await check('「🟦 JAAF用にコピーへ進む」：入れたうえで、下書きの所にも ⚠（本人に確かめて）', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="jaafgo"]').click()); await sl(900);
    assert.match(await p.evaluate(() => document.getElementById('rbEntry').innerText), /⚠ 別の端末から書きかえられた答え（架空 一郎）があります。本人に確かめてください。/);
    if (SHOT) { const c = await p.evaluate(() => { const j = document.querySelector('#rbEntry [data-en="jaaf"]'), st = [...document.querySelectorAll('#rbEntry .status')].find(x => /別の端末/.test(x.textContent)) || j; st.scrollIntoView({ block: 'center' }); const a = st.getBoundingClientRect(), z = j.getBoundingClientRect(); const top = Math.min(a.top, z.top) - 30; return { x: 0, y: top + scrollY, width: 1280, height: Math.max(a.bottom, z.bottom) - top + 40 }; }); await p.screenshot({ path: path.join(SHOT, 'v0294_moved_jaafgo_pc.png'), clip: c, captureBeyondViewport: true }); }
    assert(!errs.length, errs.join(' / '));
  });
  const { p: q, errs: e2 } = await page(390, ALICE); await q.goto(B + 'records.html', { waitUntil: 'load' }); await q.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(800);
  await q.click('#rbEntryOpen').catch(() => { }); await sl(300); await q.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(1200);
  await q.evaluate(() => { const x = document.querySelector('#rbEntry [data-svopen]') || [...document.querySelectorAll('#rbEntry button')].find(b => /架空 秋季大会/.test(b.textContent)); if (x) x.click(); }); await sl(1200);
  await check('スマホ幅でも ⚠ の箱が見える', async () => {
    assert(await q.evaluate(() => !!document.querySelector('#rbEntry .sv-movedbox')));
    if (SHOT) { const c = await q.evaluate(() => { const e = document.querySelector('#rbEntry .sv-movedbox'); e.scrollIntoView({ block: 'start' }); const a = e.getBoundingClientRect(), t = document.querySelector('#rbEntry .sv-ans') || e; const z = t.getBoundingClientRect(); return { x: 0, y: a.top + scrollY - 10, width: 390, height: Math.min(900, z.bottom - a.top + 30) }; }); await q.screenshot({ path: path.join(SHOT, 'v0294_moved_answers_sp.png'), clip: c, captureBeyondViewport: true }); }
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
