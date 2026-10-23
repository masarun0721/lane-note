// v0.29.1 調査の答え →「🟦 JAAF用にコピーへ進む」・手で直した人（手直し済）は入れ直しても上書きしない
//   Chrome・ローカル・偽の Firebase（fake_firebase.mjs）・架空データだけ
//   node v0291_survey_jaaf.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.1] 調査→JAAF用にコピー・手直し済');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const ROWS = [rec({ name: '架空 一郎' }), rec({ name: '架空 一郎', event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ name: '架空 二郎', grade: '1', mark: '12.80' }), rec({ name: '架空 二郎', grade: '1', event: '男子200m', mark: '26.10' }), rec({ name: '架空 三郎', grade: '3', mark: '12.10' })];
const D = E.data(R, ROWS), K = n => D.athletes.find(a => a.name === n).key, EV = (n, l) => D.athletes.find(a => a.name === n).events.find(e => e.label === l).ev;
await check('apply：手直し済（plan.hand）の人は種目もリレーも上書きせず kept に名前。調査の答えは plan.svAns に覚える', () => {
  const sv = { roster: [{ n: '架空 一郎' }, { n: '架空 二郎' }], akeys: [K('架空 一郎'), K('架空 二郎')] }, ans = { 0: { ev1: '男子100m', ev2: '男子走幅跳', relay: '' }, 1: { ev1: '男子100m', relay: '' } };
  const P = E.newPlan(); let r = S.apply(E, D, P, sv, ans); assert.equal(r.picks, 3); assert.deepEqual(r.kept, []);
  assert.deepEqual(P.svAns[K('架空 一郎')], [EV('架空 一郎', '100m'), EV('架空 一郎', '走幅跳')]);
  P.picks[K('架空 二郎')] = [EV('架空 二郎', '200m')]; P.hand = { [K('架空 二郎')]: 1 };
  r = S.apply(E, D, P, sv, ans); assert.deepEqual(r.kept, ['架空 二郎']); assert.equal(r.picks, 0);
  assert.deepEqual(P.picks[K('架空 二郎')], [EV('架空 二郎', '200m')], '手直しが残る'); assert.deepEqual(P.svAns[K('架空 二郎')], [EV('架空 二郎', '100m')]);
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
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(x => x.textContent.trim()), sel);
const li = (p, n) => p.evaluate(n => { const l = [...document.querySelectorAll('#rbEntry .en-aths > li')].find(l => l.textContent.includes(n)); return [...l.querySelectorAll('[data-enpick]')].map(x => x.textContent.split(' ')[0] + ':' + x.getAttribute('aria-pressed')).join(' ') + (l.querySelector('.en-hand') ? ' [手直し済]' : ''); }, n);
try {
  const { p, errs } = await page(1280, ALICE);
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); }); await p.goto(B + 'records.html', { waitUntil: 'load' }); await p.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(800);
  await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  const f = path.join(fs.mkdtempSync('/tmp/v0291-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: ROWS })); await (await p.$('#rbImport')).uploadFile(f); await sl(2500);
  await p.click('#rbEntryOpen'); await sl(300);
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(800);
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="new"]').click()); await sl(300);
  await p.evaluate(() => { const i = document.querySelector('#rbEntry [data-svf="meet"]'); i.value = '架空 秋季大会'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="create"]').click()); await sl(1200);
  const SID = /\?q=([A-Za-z0-9]{24})$/.exec(await p.evaluate(() => document.getElementById('rbSvLink').value))[1];
  const { p: s } = await page(390, null);
  await s.goto(B + '?q=' + SID, { waitUntil: 'load' }); await s.waitForSelector('#svBody .sv-name', { timeout: 15000 }); await sl(300);
  for (const [n, ev] of [['架空 一郎', '男子100m'], ['架空 二郎', '男子100m']]) {
    await s.evaluate(n => [...document.querySelectorAll('.sv-name')].find(x => x.innerText.includes(n)).click(), n); await sl(150);
    const j = await s.$('[data-svjoin="1"]'); if (j) { await j.click(); await sl(100); }
    await s.evaluate(ev => document.querySelector('[data-svev1="' + ev + '"]').click(), ev); await sl(100);
    const rn = await s.$('[data-svrelay="no"]'); if (rn) { await rn.click(); await sl(100); }
    await s.evaluate(() => document.querySelector('[data-sv="send"]').click()); await sl(800);
  }
  await p.evaluate(() => document.querySelector('#rbEntry [data-sv="reans"]').click()); await sl(800);
  await check('答えの所：「📥 希望を下書きに入れる」の隣に「🟦 JAAF用にコピーへ進む」', async () => {
    const t = await txt(p, '#rbEntry .sv-cur .en-tools button'); const i = t.indexOf('📥 希望を下書きに入れる'); assert(i >= 0); assert.equal(t[i + 1], '🟦 JAAF用にコピーへ進む');
  });
  await check('進む：希望を下書きに入れて、「JAAF用にコピー」を光らせて見える所へ（下書きに説明）', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="jaafgo"]').click()); await sl(900);
    assert.equal(await li(p, '架空 一郎'), '100m:true 走幅跳:false'); assert.equal(await li(p, '架空 二郎'), '100m:true 200m:false');
    const st = await p.evaluate(() => { const b = document.querySelector('#rbEntry [data-en="jaaf"]'), r = b.getBoundingClientRect(); return [b.classList.contains('en-hl'), r.top >= 0 && r.bottom <= innerHeight]; });
    assert.deepEqual(st, [true, true]); assert(/種目を直してから「JAAF用にコピー」を押してください/.test(await p.evaluate(() => document.getElementById('rbEntry').innerText)));
  });
  await check('手で直す → 「手直し済」。入れ直しても（どちらのボタンでも）その人はそのまま・何人そのままにしたか出す', async () => {
    await p.evaluate(() => { const l = [...document.querySelectorAll('#rbEntry .en-aths > li')].find(l => l.textContent.includes('架空 二郎')); [...l.querySelectorAll('[data-enpick]')].find(x => /200m/.test(x.textContent)).click(); }); await sl(200);
    await p.evaluate(() => { const l = [...document.querySelectorAll('#rbEntry .en-aths > li')].find(l => l.textContent.includes('架空 二郎')); [...l.querySelectorAll('[data-enpick]')].find(x => /100m/.test(x.textContent)).click(); }); await sl(200);
    assert.equal(await li(p, '架空 二郎'), '100m:false 200m:true [手直し済]'); assert.equal(await li(p, '架空 一郎'), '100m:true 走幅跳:false');
    for (const btn of ['apply', 'jaafgo']) {
      await p.evaluate(b => document.querySelector('#rbEntry [data-sv="' + b + '"]').click(), btn); await sl(600);
      assert.equal(await li(p, '架空 二郎'), '100m:false 200m:true [手直し済]', btn);
      assert(/手直し済の 1人（架空 二郎）はそのままにしました/.test(await p.evaluate(() => document.getElementById('rbEntry').innerText)), btn);
    }
    if (SHOT) { const c = await p.evaluate(() => { const e = document.querySelector('#rbEntry .en-aths'), j = document.querySelector('#rbEntry [data-en="jaaf"]').closest('.en-tools'), st = document.querySelector('#rbEntry > .status'); (st || e).scrollIntoView({ block: 'start' }); const a = (st || e).getBoundingClientRect(), z = j.getBoundingClientRect(); return { x: 0, y: Math.min(a.top, e.getBoundingClientRect().top) - 20 + scrollY, width: 1280, height: Math.min(1400, z.bottom - a.top + 50) }; }); await sl(300); await p.screenshot({ path: path.join(SHOT, 'v0291_hand_jaaf.png'), clip: c, captureBeyondViewport: true }); }
  });
  await check('「手直し済 ✕」：印を外して調査の答えに戻す（次からは入れ直しで上書きされる）', async () => {
    await p.evaluate(() => [...document.querySelectorAll('#rbEntry .en-aths > li')].find(l => l.textContent.includes('架空 二郎')).querySelector('.en-hand').click()); await sl(300);
    assert.equal(await li(p, '架空 二郎'), '100m:true 200m:false'); assert(/架空 二郎さんを調査の答えに戻しました/.test(await p.evaluate(() => document.getElementById('rbEntry').innerText)));
    assert(!errs.length, errs.join(' / '));
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
