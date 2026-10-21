// v0.28.2 エントリー下書きと調査リンク：学年（しぼる・並べる・学年ごとに入れる）・参加料の単価・出場する/しない・調査の種類（公式戦/記録会）・リレーを聞く
//   Chrome・ローカル・偽の Firebase（fake_firebase.mjs）・架空データだけ。権限のルールは rules_survey_check.mjs（エミュレーター）で確かめる
//   node v0280_survey.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
import {install} from './fake_firebase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
const req = createRequire(import.meta.url), R = req('../src/results.js'), E = req('../src/entrydraft.js'), S = req('../src/survey.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.5] 種目の順・手で足す種目');
const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
const ROWS0 = [rec({ name: '架空 一郎', grade: '2' }), rec({ name: '架空 一郎', grade: '2', event: '男子走幅跳', mark: '5.80', wind: '+0.5' }), rec({ name: '架空 二郎', grade: '1', mark: '12.80' }), rec({ name: '架空 三郎', grade: '3', mark: '12.10' }),
  rec({ name: '架空 四郎', grade: '1', mark: '13.10' }), rec({ name: '架空 五郎', grade: '3', mark: '12.30' }), rec({ event: '男子4×100mR', name: '架空中', mark: '47.50', wind: '' }), rec({ name: '架空 花子', grade: '2', event: '女子100m', mark: '13.50', wind: '+0.2' })];
const EVS = ['男子やり投', '男子4×100mR', '男子走幅跳', '男子1500m', '男子110mJH', '男子100m', '男子三段跳', '男子3000mSC', '男子5000mW', '男子砲丸投', '男子400m', '男子八種競技', '男子走高跳', '男子200m'];
const ROWS = EVS.map((e, i) => rec({ name: '架空 ' + ['一郎', '二郎', '三郎'][i % 3], grade: String(1 + i % 3), event: e, mark: /R$/.test(e) ? '47.50' : /m$|H$|SC$|W$/.test(e) ? '12.40' : /八種/.test(e) ? '4000' : '5.80', wind: '', name: /R$/.test(e) ? '架空中' : '架空 ' + ['一郎', '二郎', '三郎'][i % 3] }));
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
const ALICE = { uid: 'alice', displayName: '架空 顧問A', email: 'coach-a@example.invalid' };
async function page(W = 1280, user = ALICE) {
  const p = await b.newPage(); await p.setViewport(W === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: W, height: 900 }); const errs = [];
  await p.setRequestInterception(true); install(p, B); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(u => { localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); if (u) localStorage.setItem('__fakeuser', JSON.stringify(u)); else localStorage.removeItem('__fakeuser'); }, user);
  return { p, errs };
}
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
let SID = '';
const txt = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].map(x => x.textContent.trim()), sel);

const STD = ['100m', '200m', '400m', '1500m', '3000mSC', '110mJH(0.991m)', '5000mW', '4×100mR', '走高跳', '走幅跳', '三段跳', '砲丸投(5.000kg)', 'やり投', '八種競技'];
await check('標準の種目順（R.sortEvents）：短距離→中長距離→障害→ハードル→競歩→リレー→跳躍→投てき→混成→わからない種目は最後。男子・女子は元の順', () => {
  const sh = ['やり投', 'ボール運び', '4×400mR', '走幅跳', '10000m', '400mH', '110mH', '100mH', '800m', '3000m', '5000m', '100m', '三段跳', '3000mSC', '10000mW', '円盤投', '棒高跳', '砲丸投', '400m', '四種競技', '走高跳', 'ハンマー投', '200m', '1500m', '4×100mR', '110mJH'];
  assert.deepEqual(R.sortEvents(sh), ['100m', '200m', '400m', '800m', '1500m', '3000m', '5000m', '10000m', '3000mSC', '100mH', '110mH', '110mJH', '400mH', '10000mW', '4×100mR', '4×400mR', '走高跳', '棒高跳', '走幅跳', '三段跳', '砲丸投', '円盤投', 'ハンマー投', 'やり投', '四種競技', 'ボール運び']);
  assert.deepEqual(R.sortEvents(['女子200m', '男子100m', '女子100m', '男子200m']), ['男子100m', '女子100m', '女子200m', '男子200m']);
  const d = E.data(R, ROWS); assert.deepEqual(d.events.map(e => e.label), STD.filter(x => !/R$/.test(x)), '下書きの種目'); assert(d.athletes.every(a => a.events.map(e => e.label).join() === R.sortEvents(a.events.map(e => e.label)).join()), '選手ごとの種目');
});
await check('手で足す種目の形：全角・空白・頭の男子／女子を取る。走る距離の数だけなら「◯m」。わからない数・種目はそのまま', () => {
  const a = fs.readFileSync(path.join(ROOT, 'source/src/records_app.js'), 'utf8'), src = a.slice(a.indexOf('  var SV_RUN ='), a.indexOf('  function svSexOk('));
  const n = new Function(src + ';return svEvNorm;')();
  assert.deepEqual(['200', '200m', '２００ｍ', ' 男子 200 ', '女子２００', '110mJH', '１１０ｍＨ', '250', '走高跳', 'ボール投', '男子4×100mR'].map(n), ['200m', '200m', '200m', '200m', '200m', '110mJH', '110mH', '250', '走高跳', 'ボール投', '4×100mR']);
});
try {
  const { p, errs } = await page(390);
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); }); await p.goto(B + 'records.html', { waitUntil: 'load' }); await p.waitForFunction(() => !document.getElementById('rbSignOut').hidden, { timeout: 15000 }); await sl(800);
  await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  const f = path.join(fs.mkdtempSync('/tmp/v0285-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: ROWS })); await (await p.$('#rbImport')).uploadFile(f); await sl(2500);
  await p.click('#rbEntryOpen'); await sl(300);
  const chips = () => p.evaluate(() => [...document.querySelectorAll('#rbEntry .sv-form [data-svev], #rbEntry .sv-form [data-svxdel]')].map(x => x.textContent.trim()));
  const add = v => p.evaluate(v => { document.getElementById('rbSvX').value = v; document.querySelector('#rbEntry [data-sv="xadd"]').click(); }, v).then(() => sl(200));
  await check('調査リンク ④ 選べる種目：標準の順。手で「200」→ もうある 200m を光らせて重ねない（男子は付けない）。「２００ｍ」「男子200」も同じ', async () => {
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="toggle"]').click()); await sl(800);
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="new"]').click()); await sl(300);
    assert.deepEqual(await chips(), STD.filter(x => !/R$/.test(x)));
    await p.evaluate(() => document.querySelector('#rbEntry [data-svev="男子200m"]').click()); await sl(150);   // 外しておく
    for (const v of ['200', '２００ｍ', '男子200']) { await add(v); assert.deepEqual(await chips(), STD.filter(x => !/R$/.test(x)), v);
      assert.deepEqual(await p.evaluate(() => { const c = document.querySelector('#rbEntry [data-svev="男子200m"]'); return [c.classList.contains('en-hl'), c.getAttribute('aria-pressed')]; }), [true, 'true'], v); }
  });
  await check('手で足した種目は決まった場所へ（800m は 400m と 1500m の間・400mH はハードル・わからないものは最後）。✕ で外せる。作った調査も同じ順', async () => {
    for (const v of ['800', '400mH', 'ボール運び', '１００００']) await add(v);
    const want = ['100m', '200m', '400m', '800m ✕', '1500m', '10000m ✕', '3000mSC', '110mJH(0.991m)', '400mH ✕', '5000mW', '走高跳', '走幅跳', '三段跳', '砲丸投(5.000kg)', 'やり投', '八種競技', 'ボール運び ✕'];
    assert.deepEqual(await chips(), want);
    await add('800'); assert.deepEqual(await chips(), want, '重ねない'); assert(await p.evaluate(() => document.querySelector('#rbEntry [data-svxk="男子800m"]').classList.contains('en-hl')));
    if (SHOT) { const c = await p.evaluate(() => { const e = document.querySelector('#rbEntry .sv-form [data-svev]').closest('.en-chips'); e.scrollIntoView({ block: 'center' }); const a = e.getBoundingClientRect(); return { x: 0, y: a.top - 60 + scrollY, width: 390, height: a.height + 130 }; }); await sl(200); await p.screenshot({ path: path.join(SHOT, 'fix76_survey_events.png'), clip: c, captureBeyondViewport: true }); }
    await p.evaluate(() => { const i = document.querySelector('#rbEntry [data-svf="meet"]'); i.value = '架空 記録会'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.evaluate(() => document.querySelector('#rbEntry [data-sv="create"]').click()); await sl(1500);
    const sv = Object.entries(await db(p)).find(([k, v]) => /^surveys\/[^/]+$/.test(k) && v.meet === '架空 記録会'); assert(sv, '調査が作られない'); SID = sv[0].split('/')[1];
    assert.deepEqual(sv[1].evs, want.map(x => '男子' + x.replace(' ✕', '')));
  });
  await check('選手の画面の希望のボタンも標準の順（前に順がばらばらで作った調査も）', async () => {
    const all = await db(p); all['surveys/' + SID].evs = all['surveys/' + SID].evs.slice().reverse(); await p.evaluate(d => localStorage.setItem('__fakedb', JSON.stringify(d)), all);
    const { p: q } = await page(390, null);
    await q.goto(B + '?q=' + SID, { waitUntil: 'load' }); await q.waitForSelector('#svBody .sv-name', { timeout: 15000 }); await sl(300);
    await q.evaluate(() => document.querySelector('.sv-name').click()); await sl(150); await q.evaluate(() => document.querySelector('[data-svjoin="1"]').click()); await sl(200);
    const ev = await q.evaluate(() => [...document.querySelectorAll('[data-svev1]')].map(x => x.textContent.trim()));
    assert.deepEqual(ev, ['100m', '200m', '400m', '800m', '1500m', '10000m', '3000mSC', '110mJH(0.991m)', '400mH', '5000mW', '走高跳', '走幅跳', '三段跳', '砲丸投(5.000kg)', 'やり投', '八種競技', 'ボール運び']); await q.close();
  });
  await check('ページのエラーなし', async () => { assert(!errs.length, errs.join(' / ')); });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
