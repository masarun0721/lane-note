// v0.26.67 調査で見つけた3点：印刷の男女の条件「男子のみ」「女子のみ」・3分体験の注意書き（免責）・複数日の大会で対象日を選んだらカードの「対象日を選ぶまで…」を隠す
//   架空データ・テスト用のPDFだけ。外には通信しない（pdf.js は node_modules のものを返す）。 node v02667_fixes.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), FX = path.join(here, 'fixtures'), NM = path.join(here, 'node_modules/pdfjs-dist/'), SHOT = process.argv[2] || '';
const R = createRequire(import.meta.url)('../src/results.js');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.26.67] 印刷の男女・3分体験の免責・複数日の対象日');
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
async function page(W = 1280) {
  const p = await b.newPage(); await p.setViewport({ width: W, height: 900 }); const errs = [];
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url(), m = /cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[^/]+\/(.+)$/.exec(u);
    if (m) { const fp = NM + m[1].split('?')[0]; if (fs.existsSync(fp)) return r.respond({ status: 200, contentType: /\.m?js$/.test(fp) ? 'application/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(fp) }); }
    u.startsWith(B) || /^(data|blob):/.test(u) ? r.continue() : r.abort(); });
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('__i')) { localStorage.clear(); sessionStorage.setItem('__i', '1'); } localStorage.setItem('lanenote.mode.v1', 'coach'); localStorage.setItem('lanenote.xnews.v1', '1'); });
  return { p, errs };
}
try {
  await check('記録の印刷（大会別）：男女がいるチームは「男子のみ」「女子のみ」（「m」「f」は出さない）', async () => {
    const { p, errs } = await page();
    const rec = o => { const r = Object.assign({ meet: '架空区大会', date: '2026-09-20', event: '男子100m', round: '決勝', heat: '', name: '架空 一郎', kana: '', grade: '2', team: '架空中', mark: '12.40', wind: '+1.0', bib: '', lane: '', rank: 1, comment: '' }, o); r.id = R.recId(r.meet, r.date, r); return r; };
    const f = path.join(fs.mkdtempSync('/tmp/v02667-'), 's.json'); fs.writeFileSync(f, JSON.stringify({ records: [rec({}), rec({ name: '架空 花子', event: '女子800m', mark: '2:30.00', wind: '' })] }));
    await p.goto(B + 'records.html', { waitUntil: 'load' }); await sl(900);
    await p.evaluate(() => { const s = document.getElementById('rbSchool'); s.value = '架空'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await (await p.$('#rbImport')).uploadFile(f); await sl(2000);
    const chips = async sex => {
      await p.evaluate(sex => document.querySelector('#rbSex [data-sex="' + sex + '"]').click(), sex); await sl(400);
      await p.evaluate(() => [...document.querySelectorAll('[data-v="meet"]')].find(x => x.offsetParent).click()); await sl(600);
      await p.evaluate(() => [...document.querySelectorAll('[data-act="print"]')].find(x => x.offsetParent).click()); await sl(1200);
      const c = await p.evaluate(() => { const h = document.querySelector('#rbPrintBody .lp-sub'); return { chips: h ? [...h.querySelectorAll('i')].map(i => i.textContent) : null, names: document.getElementById('rbPrintBody').innerText }; });
      if (SHOT && sex === 'm') await p.screenshot({ path: path.join(SHOT, 'fix67_print.png') });
      await p.evaluate(() => document.getElementById('rbPrintClose').click()); await sl(300);
      return c;
    };
    const m = await chips('m'); assert.deepEqual(m.chips, ['2026.09.20', '男子のみ'], JSON.stringify(m.chips)); assert(/架空 一郎/.test(m.names) && !/架空 花子/.test(m.names));
    const w = await chips('f'); assert.deepEqual(w.chips, ['2026.09.20', '女子のみ'], JSON.stringify(w.chips)); assert(/架空 花子/.test(w.names) && !/架空 一郎/.test(w.names));
    assert(!errs.length, errs.join(' / ')); await p.close();
  });
  await check('記録の印刷：男女が片方だけのチームは条件を出さない（今まで通り）', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'source/src/records_app.js'), 'utf8');
    assert.match(src, /NOG \? '' : \(SEX === 'f' \? '女子のみ' : '男子のみ'\)/);
  });
  await check('3分体験：ほかのページと同じ注意書き（免責）が見える・試作版・Presented by Sakata・標語はそのまま（1280・390）', async () => {
    for (const W of [1280, 390]) {
      const { p, errs } = await page(W); await p.goto(B + 'try.html', { waitUntil: 'load' }); await sl(800);
      const r = await p.evaluate(() => { const f = document.querySelector('footer .f-disc'); return { disc: f && f.offsetParent ? f.textContent : '', t: document.body.innerText, tag: !!document.querySelector('.tagline'), sw: document.documentElement.scrollWidth, vw: innerWidth }; });
      assert(/作成者は責任を負いかねます/.test(r.disc) && /目で確認してください/.test(r.disc), r.disc);
      assert(/試作版/.test(r.t) && /Presented by Sakata/.test(r.t) && r.tag && r.sw <= r.vw, W);
      if (SHOT && W === 390) { await p.evaluate(() => document.querySelector('footer').scrollIntoView({ block: 'end' })); await sl(200); await p.screenshot({ path: path.join(SHOT, 'fix67_try_footer.png') }); }
      assert(!errs.length, errs.join(' / ')); await p.close();
    }
  });
  await check('大会準備（複数日）：対象日を選ぶまでは2枚のカードに「対象日を選ぶまで…」→ 選んだら隠す → 選び直し（未選択）でまた出す', async () => {
    const { p, errs } = await page(); await p.goto(B + 'index.html', { waitUntil: 'load' }); await sl(900);
    await (await p.$('#slFile')).uploadFile(path.join(FX, 'f4_sl_twodays.pdf')); await p.waitForFunction(() => /f4_sl_twodays/.test(document.body.innerText), { timeout: 20000 }); await sl(1500);
    await (await p.$('#ttFile')).uploadFile(path.join(FX, 'f4_tt_twodays.pdf')); await p.waitForFunction(() => /f4_tt_twodays/.test(document.body.innerText), { timeout: 20000 }); await sl(1500);
    await p.evaluate(() => { const i = document.getElementById('school'); i.value = '架空'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }); await sl(1500);
    const vis = () => p.evaluate(() => [...document.querySelectorAll('.md-wait')].filter(e => e.offsetParent && /「対象日」を選ぶまで、出場一覧は出しません/.test(e.textContent)).length);
    const keep = () => p.evaluate(() => (document.body.innerText.match(/複数日（[^）]+）の(大会|タイムテーブル)です/g) || []).length);
    assert.equal(await vis(), 2, '選ぶ前は2枚とも出す'); assert.equal(await keep(), 2);
    const setDay = v => p.evaluate(v => { const s = document.getElementById('daySel'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    await setDay('10/12'); await sl(1200);
    assert.equal(await vis(), 0, '選んだら隠す'); assert.equal(await keep(), 2, '「複数日（…）の大会です」は残す');
    assert(await p.evaluate(() => !document.getElementById('results').classList.contains('needday')), '出場一覧が出ていない');
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'fix67_days.png') });
    await setDay(''); await sl(1000); assert.equal(await vis(), 2, '未選択に戻したらまた出す');
    assert(!errs.length, errs.join(' / ')); await p.close();
  });
} finally { await b.close(); srv.close(); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
