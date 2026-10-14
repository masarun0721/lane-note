// v0.26.30 大会予定のページ（schedule.html）：見出し・ナビ・記録ページとの出し分け
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setRequestInterception(true);
p.on('request', r => /^http:\/\/127\.0\.0\.1/.test(r.url()) ? r.continue() : r.respond({ status: 404, body: '' }));
const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
await p.goto(B + 'schedule.html', { waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 800));
ok('schedule.html は sched-page', await p.evaluate(() => document.body.classList.contains('sched-page')));
ok('タイトルが大会予定', (await p.title()).includes('大会予定'));
ok('ヘッダーの大会予定が選択中', await p.evaluate(() => document.querySelector('[data-tb="schedule"]')?.classList.contains('on')));
ok('見出し・まとめて追加・Google カレンダーが見える', await vis('#spHead') && await vis('#spAdd') && await vis('.rp-gcal'));
ok('記録の取り込み欄は出ない', !(await vis('#spLink')) && !(await vis('#rbFile, #rbDrop, .drop')));
await p.goto(B + 'records.html', { waitUntil: 'domcontentloaded' }); await new Promise(r => setTimeout(r, 800));
ok('記録ページ：今後の大会・まとめて追加は出ない', !(await vis('#lpHome')) && !(await vis('#spAdd')) && !(await vis('#spHead')));
ok('記録ページ：大会予定への小さなリンク', await vis('#spLink a[href="schedule.html"]'));
await b.close(); srv.close();
console.log(`v02630_sched_page: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
