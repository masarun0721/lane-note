// v0.28.1 今後の大会：要項から読んだ締切を「エントリー済」「振込済」の横に（架空データ・ローカルの Chrome だけ）
//   node v0281_deadline.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
const L = createRequire(import.meta.url)('../src/deadline.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.28.1] 要項の締切');
const YOKO = ['第2・3支部 秋季大会 要項（架空）', '1 期日 2026年11月3日（火）', '5 申込方法 JAAF STARTLINE によるエントリー', 'エントリー期間 10月13日（月）〜10月23日（金）17:00', '6 Ａ票・参加料 10月27日（月）までに提出・振込', '7 参加料 1種目 700円'].join('\n');
await check('秋季3支部の形：エントリー 10/13〜10/23 17:00 → 10/23 17:00・A票・参加料 10/27 → 振込も提出も 10/27', () => {
  const r = L.parse(YOKO, '2026-11-03');
  assert.deepEqual([r.entry.date, r.entry.time, r.entry.from], ['2026-10-23', '17:00', '2026-10-13']); assert.equal(r.pay.date, '2026-10-27'); assert.equal(r.slip.date, '2026-10-27');
});
await check('いろいろな書き方：年つき・M/D・曜日つき・17時・全角数字・次の行の日付・申込書は提出（エントリーに数えない）・年をまたぐ', () => {
  let r = L.parse('申込締切　２０２６年９月３０日（水）正午\n参加料振込期限 10/5', '2026-10-18'); assert.equal(r.entry.date, '2026-09-30'); assert.equal(r.pay.date, '2026-10-05');
  r = L.parse('エントリー締切\n10月2日(金)17時', '2026-10-18'); assert.deepEqual([r.entry.date, r.entry.time], ['2026-10-02', '17:00']);
  r = L.parse('申込書 10月20日必着\nエントリー締切 10月18日', '2026-11-03'); assert.equal(r.entry.date, '2026-10-18'); assert.equal(r.slip.date, '2026-10-20');
  r = L.parse('申込締切 12月20日', '2027-01-10'); assert.equal(r.entry.date, '2026-12-20');
});
await check('推測しない：日付の無い言葉・日付が2つ以上でちがう・大会の日だけ・ありえない日付は空', () => {
  let r = L.parse('参加料は当日受付で支払う\n申込はJAAFで', '2026-11-03'); assert.equal(r.entry, null); assert.equal(r.pay, null);
  r = L.parse('申込締切 10/1\n申込締切 10/5', '2026-11-03'); assert.deepEqual(r.entry, { amb: true });
  r = L.parse('大会期日 2026年11月3日（火）', '2026-11-03'); assert.equal(r.entry, null);
  r = L.parse('申込締切 2月30日', '2026-11-03'); assert.equal(r.entry, null);
  assert.deepEqual(L.chip({ amb: true }, '2026-10-20', false), { t: '締切を読めませんでした', c: 'warn' });
});
await check('エントリーの出し方：JAAF・NISHI（NANS21V）・メール（アドレスは要項にあるときだけ）。問い合わせのメールは数えない・2つ出たら推測しない', () => {
  assert.deepEqual(L.parse(YOKO, '2026-11-03').via, { via: 'jaaf' });
  assert.deepEqual(L.via('申込は NANS21V で行う'), { via: 'nishi' }); assert.deepEqual(L.via('申込書をメールで entry@example.com へ送付'), { via: 'mail', mail: 'entry@example.com' });
  assert.deepEqual(L.via('エントリーはメールで提出'), { via: 'mail', mail: '' }); assert.equal(L.via('問い合わせ info@example.jp'), null);
  assert.deepEqual(L.via('JAAFで申込\nNISHIで提出'), { amb: true }); assert.equal(L.via('参加料 700円'), null);
});
await check('札：あと3日以内は soon・過ぎたら over・チェック済みは muted', () => {
  assert.equal(L.chip({ date: '2026-10-23', time: '17:00' }, '2026-10-20').c, 'soon'); assert.equal(L.chip({ date: '2026-10-24' }, '2026-10-20').c, '');
  assert.equal(L.chip({ date: '2026-10-19' }, '2026-10-20').c, 'over'); assert.equal(L.chip({ date: '2026-10-19' }, '2026-10-20', true).c, 'muted');
  assert.equal(L.chip({ date: '2026-10-23', time: '17:00' }, '2026-10-20').t, '〆 10/23(金)17:00（あと3日）');
});
await check('大会準備：要項を読み込むと、その文字から締切を読んでこの端末の控えに残す（読めないときは空）', () => {
  const a = fs.readFileSync(path.join(ROOT, 'source/src/app.js'), 'utf8'); assert(/LaneDeadline\.parse\(yt, p\.p\.date\)/.test(a) && /w\[p\.key\]\.dl = v/.test(a));
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), r = fs.readFileSync(path.join(ROOT, 'records.html'), 'utf8'); assert(h.includes('var LaneDeadline') && r.includes('var LaneDeadline'));
});
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); const errs = [];
  await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(() => { const T = Date.parse('2026-10-20T03:00:00Z'), D = Date; Date.now = () => T; if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
  await p.goto(B + 'records.html', { waitUntil: 'load' }); await sl(1000);
  await p.evaluate(() => { const d = document.querySelector('#rpPaste'); d.closest('details') && (d.closest('details').open = true); d.value = '大会名,日付,会場,区分,締切\n架空 秋季3支部大会,2026/11/3,架空競技場,高,\n架空 読めない大会,2026/11/15,,高,\n架空 要項なし大会,2026/11/20,,高,\n架空 手入力大会,2026/11/8,,高,10/19\n'; document.getElementById('rpRead').click(); }); await sl(400);
  await p.evaluate(() => document.getElementById('rpSave').click()); await sl(1200);
  const dl1 = L.parse(YOKO, '2026-11-03'), dl2 = L.parse('参加料は当日受付で支払う', '2026-11-15');
  await p.evaluate((a, c) => { const o = { '|': { '2026-11-03|架空 秋季3支部大会': { kinds: { yoko: 1 }, end: '2026-11-03', at: 1, dl: a }, '2026-11-15|架空 読めない大会': { kinds: { yoko: 1 }, end: '2026-11-15', at: 1, dl: c }, '2026-11-08|架空 手入力大会': { kinds: { yoko: 1 }, end: '2026-11-08', at: 1, dl: a } } }; localStorage.setItem('lanenote.prep.idx.v1', JSON.stringify(o)); }, dl1, dl2);
  await p.goto(B + 'schedule.html', { waitUntil: 'load' }); await sl(1500);
  const card = name => p.evaluate(n => { const li = [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes(n)); return li ? [...li.querySelectorAll('.lp-dl')].map(x => x.getAttribute('data-dl') + '|' + x.className.replace('lp-dl ', '') + '|' + x.textContent) : null; }, name);
  await check('要項から：エントリー済の横に「締切 10/23 17:00（あと3日）」（3日以内は赤）・振込済の横に 10/27・A票など提出 10/27', async () => {
    assert.deepEqual(await card('秋季3支部'), ['entryAt|dl-soon|⏰ 〆 10/23(金)17:00（あと3日）', 'payAt|dl-ok|⏰ 〆 10/27(火)（あと7日）', 'slip|dl-ok|📝 A票など提出 〆 10/27(火)（あと7日）']);
    const pos = await p.evaluate(() => { const li = [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes('秋季3支部')); const ck = li.querySelector('[data-lpck="entryAt"]').closest('label'); const v = ck.nextElementSibling; return v && v.classList.contains('lp-via') && v.nextElementSibling.getAttribute('data-dl'); });
    assert.equal(pos, 'entryAt', 'チェックのすぐ横');
  });
  await check('要項を読んだのに読めない：「⚠ 締切を読めませんでした」（日付は出さない）。要項が無い大会は何も出さない', async () => {
    assert.deepEqual(await card('読めない大会'), []);   // v0.28.2：読めなかったものは1行にまとめる
    assert.equal(await p.evaluate(() => [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes('読めない大会')).querySelectorAll('.lp-warnl').length), 1);
    assert.deepEqual(await card('要項なし大会'), []);
  });
  const via = name => p.evaluate(n => { const li = [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes(n)); return [[...li.querySelectorAll('.lp-via')].map(x => x.className.replace('lp-via', '').trim() + '|' + x.textContent), !!li.querySelector('[data-dlfix]')]; }, name);
  await check('エントリー締切の横に出し方：「JAAF ⏰ 〆 10/23(金)17:00」。読めない大会は「⚠ 出し方を読めませんでした」と「✏️ 締切を入力」', async () => {
    assert.deepEqual(await via('秋季3支部'), [['|JAAF'], false]);
    const t = await p.evaluate(() => { const li = [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes('秋季3支部')); const v = li.querySelector('.lp-via'); return v.textContent + ' ' + v.nextElementSibling.textContent; });
    assert.equal(t, 'JAAF ⏰ 〆 10/23(金)17:00（あと3日）');
    assert.deepEqual(await via('読めない大会'), [[], true]);
    assert.equal(await p.evaluate(() => [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes('読めない大会')).querySelector('.lp-warnl').textContent), '⚠ 要項から読めませんでした：エントリー締切・振込締切・出し方 ✏️ 締切を入力'); assert.deepEqual(await via('要項なし大会'), [[], false]);
  });
  await check('カレンダー：「〆エントリー 大会名」「〆振込 大会名」を大会の日とは別の色で', async () => {
    const c = await p.evaluate(() => [...document.querySelectorAll('#lpHome .lp-cal .lp-dk')].map(x => x.closest('td').querySelector('b').textContent + '|' + x.className + '|' + x.textContent));
    assert(c.includes('23|lp-dk k-entry|〆エントリー 架空 秋季3') && c.includes('27|lp-dk k-pay|〆振込 架空 秋季3') && c.includes('19|lp-dk k-entry|〆エントリー 架空 手入力'), c.join(' / '));
    assert(!c.some(x => /読めない|要項なし/.test(x)));
    const b1 = await p.evaluate(() => [getComputedStyle(document.querySelector('.lp-cal .lp-dk.k-entry')).backgroundColor, getComputedStyle(document.querySelector('.lp-cal .lp-dk.k-pay')).backgroundColor]);
    await p.evaluate(() => document.querySelector('#lpHome [data-lpm="1"]').click()); await sl(300);
    const b2 = await p.evaluate(() => { const t = document.querySelector('.lp-cal td.meet'); return [getComputedStyle(t).backgroundColor, getComputedStyle(t.querySelector('.lp-ev')).backgroundColor]; });
    await p.evaluate(() => document.querySelector('#lpHome [data-lpm="-1"]').click()); await sl(300);
    assert(b1[0] !== b1[1] && !b2.includes(b1[0]) && !b2.includes(b1[1]), JSON.stringify([b1, b2]));
  });
  await check('手で入れる（要項が読めなかった大会）：「✏️ 締切を入力」から日付・時刻・出し方（メール・宛先）を入れると、警告が消えて手入力が出る', async () => {
    await p.evaluate(() => [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes('読めない大会')).querySelector('[data-dlfix]').click()); await sl(300);
    await p.evaluate(() => { const f = k => document.querySelector('[data-lpf="' + k + '"]'); f('deadline').value = '2026-10-30'; f('deadlineTime').value = '12:00'; f('payDue').value = '2026-11-02'; f('entryVia').value = 'mail'; f('entryMail').value = 'entry@example.com'; document.querySelector('[data-lpsave]').click(); }); await sl(1200);
    assert.deepEqual(await card('読めない大会'), ['entryAt|dl-ok|⏰ 〆 10/30(金)12:00（あと10日）', 'payAt|dl-ok|⏰ 〆 11/2(月)（あと13日）']);
    assert.deepEqual(await via('読めない大会'), [['|メール entry@example.com'], false]);
  });
  await check('手で入れる（要項が無い大会でも）：日付と出し方を入れられる', async () => {
    await p.evaluate(() => document.querySelector('[data-lpedit="2026-11-20|架空 要項なし大会"]').click()); await sl(300);
    await p.evaluate(() => { const f = k => document.querySelector('[data-lpf="' + k + '"]'); f('deadline').value = '2026-11-01'; f('entryVia').value = 'nishi'; document.querySelector('[data-lpsave]').click(); }); await sl(1200);
    assert.deepEqual(await card('要項なし大会'), ['entryAt|dl-ok|⏰ 〆 11/1(日)（あと12日）']); assert.deepEqual(await via('要項なし大会'), [['|NISHI'], false]);
  });
  await check('手で入れた締切が先（過ぎたら over）。参加料は要項から', async () => {
    assert.deepEqual((await card('手入力大会')).slice(0, 2), ['entryAt|dl-over|⏰ 〆 10/19(月)（過ぎました）', 'payAt|dl-ok|⏰ 〆 10/27(火)（あと7日）']);
  });
  if (SHOT) { await p.evaluate(() => document.getElementById('lpHome').scrollIntoView({ block: 'start' })); await sl(300); const r = await p.evaluate(() => { const ls = [...document.querySelectorAll('#lpHome .lp-list > li')].filter(l => l.offsetHeight); const a = ls[0].getBoundingClientRect(), z = ls[ls.length - 1].getBoundingClientRect(); window.scrollBy(0, a.top - 60); return null; }); await sl(300);
    const c = await p.evaluate(() => { const ls = [...document.querySelectorAll('#lpHome .lp-list > li')].filter(l => l.offsetHeight); const a = ls[0].getBoundingClientRect(), z = ls[ls.length - 1].getBoundingClientRect(); return { x: 0, y: Math.max(0, a.top - 50) + scrollY, width: 390, height: Math.min(z.bottom - a.top + 70, 1600) }; });
    await p.screenshot({ path: path.join(SHOT, 'fix72_home_390.png'), clip: c, captureBeyondViewport: true });
    const k = await p.evaluate(() => { const t = document.querySelector('#lpHome .lp-calbox'); t.scrollIntoView({ block: 'start' }); const r = t.getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: 390, height: Math.min(r.height, 1400) }; }); await sl(300);
    await p.screenshot({ path: path.join(SHOT, 'fix72_cal_390.png'), clip: k, captureBeyondViewport: true }); }
  await check('チェックすると薄く出す（日付だけ・あと何日は出さない）', async () => {
    await p.evaluate(() => { const li = [...document.querySelectorAll('#lpHome .lp-list > li')].find(l => l.textContent.includes('秋季3支部')); li.querySelector('[data-lpck="entryAt"]').click(); }); await sl(1200);
    assert.equal((await card('秋季3支部'))[0], 'entryAt|dl-muted|⏰ 〆 10/23(金)17:00');
    assert.deepEqual(await via('秋季3支部'), [['dl-muted|JAAF'], false]);
    assert.equal(await p.evaluate(() => [...document.querySelectorAll('.lp-cal .lp-dk.k-entry')].filter(x => /秋季3/.test(x.textContent)).map(x => x.className).join()), 'lp-dk k-entry done');
  });
  await check('✏️ 直す：空の締切の欄に要項の締切が入っている（保存すると手入力になる）', async () => {
    await p.evaluate(() => document.querySelector('[data-lpedit="2026-11-03|架空 秋季3支部大会"]').click()); await sl(300);
    assert.deepEqual(await p.evaluate(() => [document.querySelector('[data-lpf="deadline"]').value, document.querySelector('[data-lpf="payDue"]').value, document.querySelector('[data-lpf="deadlineTime"]').value, document.querySelector('[data-lpf="entryVia"]').value]), ['2026-10-23', '2026-10-27', '17:00', 'jaaf']);
    await p.evaluate(() => document.querySelector('[data-lpsave]').click()); await sl(1200);
    assert.equal((await card('秋季3支部'))[0], 'entryAt|dl-muted|⏰ 〆 10/23(金)17:00');
    assert(!errs.length, errs.join(' / '));
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
