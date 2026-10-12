// v0.23.1 回帰（実ブラウザ・headless Chrome が必要）：大会まとめの1人だけの投てき（9m54）の箱が、画面・印刷・PDF（html2canvas）で行ごと出る
// 使い方：cd source/test && node v0231_pdf_chrome.mjs   （CDN から html2canvas・jsPDF を読むのでネット接続が必要）
import puppeteer from 'puppeteer-core'; import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import assert from 'node:assert/strict';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
if (!fs.existsSync(CHROME)) { console.log('skip: Chrome がありません'); process.exit(0); }
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } let b = d; if (/records\.html$/.test(f)) b = Buffer.from(String(d).replace('if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }', 'window.__t={putMany,scope,reload,setTab:v=>{setTab(v);render();}};renderAuth();').replace('  msOpenFromQuery();', '')); r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' }); r.end(b); }); });
await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let pass = 0, fail = 0; const check = async (n, f) => { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } };
const W = ms => new Promise(r => setTimeout(r, ms));
const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setViewport({ width: 1200, height: 900 });
await p.goto(`http://127.0.0.1:${port}/records.html`, { waitUntil: 'networkidle0' });
await p.evaluate(async () => {
  const R = window.ResultParser, recs = [], add = o => { const r = Object.assign({ team: '架空第一中', date: '2026-10-11', meet: '第74回 架空区中学校陸上競技大会', wind: '' }, o); r.id = R.recId(r.meet, r.date, r); recs.push(r); };
  for (let i = 0; i < 12; i++) for (let k = 0; k < 3 + i % 5; k++) add({ name: '選手' + i + '_' + k, event: '中学共通男子' + (100 + i * 100) + 'm', mark: (13 + i + k / 10).toFixed(2), wind: '+0.5', grade: String(1 + k % 3), rank: String(k + 1) });
  add({ name: '見本 奏太', event: '中学共通 砲丸投(5.000kg)', mark: '9m54', grade: '3', rank: '1' });
  document.getElementById('rbSchool').value = '架空第一中'; await window.__t.putMany(recs, window.__t.scope()); await window.__t.reload(window.__t.scope()); window.__t.setTab('meet');
});
await W(300);
await p.evaluate(() => { const c = document.querySelector('[data-onepage]'); if (!c.checked) c.click(); document.querySelector('[data-print="meet"][data-act="view"]').click(); });
await W(300);
await check('画面で見る：砲丸投の箱に 見本 奏太・9m54 の行がある／タイトルは下のカードと同じ左端', async () => {
  const r = await p.evaluate(() => { const box = [...document.querySelectorAll('#rbPrintBody .lp-box')].find(x => /砲丸投/.test(x.textContent)); const L = s => document.querySelector('#rbPrintBody ' + s).getBoundingClientRect().left;
    return { rows: box.querySelectorAll('tbody tr').length, txt: box.textContent, bl: L('.lp-bl'), sum: L('.lp-sum') }; });
  assert.equal(r.rows, 1); assert.match(r.txt, /見本 奏太/); assert.match(r.txt, /9m54/); assert.ok(Math.abs(r.bl - r.sum) <= 4, JSON.stringify(r));
});
await check('印刷：PDFに保存した文字に 見本 奏太・9m54', async () => {
  await p.emulateMediaType('print'); const pdf = await p.pdf({ format: 'A4', printBackground: true }); await p.emulateMediaType(null);
  fs.writeFileSync('/tmp/v0231_print.pdf', pdf);
  const { execSync } = await import('node:child_process'); const t = execSync('pdftotext /tmp/v0231_print.pdf -').toString();
  assert.match(t, /見本\s*奏太/); assert.match(t, /9m54/);
});
await check('PDF作成（html2canvas）：PDF用のHTMLに行があり、zoom・sticky を使わず、描いた範囲が行の下端まで届く', async () => {
  const r = await p.evaluate(async () => {
    await LanePdf.load('h2c'); await LanePdf.load('jspdf');
    const orig = window.html2canvas, seen = [];
    window.html2canvas = async (body, o) => { const d = body.ownerDocument, tr = [...d.querySelectorAll('tbody tr')].find(x => /見本/.test(x.textContent)), top0 = d.body.getBoundingClientRect().top;
      const th = d.querySelector('.lp-box th'), hd = d.querySelector('.lp-boxh'), cv = await orig(body, o);
      seen.push({ html: d.body.innerHTML.includes('9m54'), rowBottom: tr ? tr.getBoundingClientRect().bottom - top0 : -1, y: o.y, h: o.height, cvh: cv.height / (o.scale || 1), zoom: d.defaultView.getComputedStyle(d.querySelector('.lp-one') || d.body).zoom, thPos: d.defaultView.getComputedStyle(th).position, gap: th.getBoundingClientRect().top - hd.getBoundingClientRect().bottom });
      return cv; };
    document.querySelector('#rbPrintPdf') && 0;
    const btn = document.querySelector('#rbPrintClose'); btn.click();
    document.querySelector('[data-print="meet"][data-act="pdf"]').click();
    for (let i = 0; i < 100 && !seen.length; i++) await new Promise(r => setTimeout(r, 200));
    await new Promise(r => setTimeout(r, 1500)); window.html2canvas = orig; return seen;
  });
  assert.ok(r.length >= 1); const s = r[r.length - 1];
  assert.equal(s.html, true); assert.ok(s.rowBottom > 0); assert.equal(String(s.zoom), '1'); assert.equal(s.thPos, 'static');
  assert.ok(s.y + s.h >= s.rowBottom && s.cvh >= s.rowBottom - s.y - 1, JSON.stringify(s)); assert.ok(Math.abs(s.gap) < 2, '見出しと列名の間に空き：' + s.gap);
});
await b.close(); srv.close();
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
