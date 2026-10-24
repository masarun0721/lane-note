// v0.29.2 マニュアル（レーンちゃんのブログ）とレーンちゃんの小さな登場  node v0292_manual.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.2] マニュアル・レーンちゃん');
const M = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');
await check('manual.html：必要な文言があり、jaaf・分け合う・masarun・メールアドレスが無い', () => {
  for (const w of ['レーンちゃん', 'こんな機能があるよ！', '試作版', 'Presented by Sakata', 'すべての陸上競技部顧問が、', '少しでも楽になりますように。', 'lane-note.web.app', 'v0.29.2']) assert.ok(M.includes(w), w);
  for (const w of [/jaaf/i, /分け合う/, /masarun/i, /[\w.]+@[\w-]+\.[a-z]{2,}/i]) assert.ok(!w.test(M.replace(/<script[\s\S]*?<\/script>/g, '')), String(w));
});
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.png') ? 'image/png' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
const errs = []; async function open(n) { const p = await b.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); await p.evaluateOnNewDocument(() => { try { localStorage.setItem('lanenote.mode.v1', 'coach'); } catch (e) { } }); await p.goto(B + n, { waitUntil: 'load' }); await sl(900); return p; }
await check('manual.html：記事カード・記事・目次がそろい、画像が全部読める', async () => {
  const p = await open('manual.html'); const r = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 500)); const im = [...document.images]; return { cards: document.querySelectorAll('.mb-card').length, arts: document.querySelectorAll('article.mb-art').length, toc: document.querySelectorAll('.mb-toc a').length, bad: (await Promise.all(im.map(async i => { const r = await fetch(i.src); const t = r.headers.get('content-type') || ''; return r.ok && /image/.test(t) ? '' : i.src; }))).filter(Boolean), cur: getComputedStyle(document.querySelector('.mb-card')).cursor }; });
  assert.ok(r.cards >= 10 && r.cards === r.arts, JSON.stringify(r)); assert.ok(r.toc >= 10); assert.deepEqual(r.bad, []); assert.equal(r.cur, 'pointer'); await p.close();
});
await check('ふつうのページには見出しのレーンちゃん（manual.html へ）、jaaf・admin には出ない', async () => {
  for (const n of ['index.html', 'records.html', 'check.html', 'schedule.html', 'team.html', 'guide.html', 'try.html', 'manual.html']) { const p = await open(n); assert.equal(await p.$eval('.lc-av', a => a.getAttribute('href')).catch(() => null), 'manual.html', n); await p.close(); }
  for (const n of ['jaaf.html', 'admin.html']) assert.ok(!fs.readFileSync(path.join(ROOT, n), 'utf8').includes('lcToast'), n);
});
await check('「✔ 〜しました」で右下にトースト（押せない・自分で消える）、エラーでは出ない', async () => {
  const p = await open('check.html');
  await p.evaluate(() => { const d = document.createElement('div'); d.className = 'status ng'; d.textContent = '✔ PDFを保存しました。'; document.querySelector('main').prepend(d); }); await sl(500);
  assert.equal(await p.evaluate(() => !!document.querySelector('#lcToast.on')), false);
  await p.evaluate(() => { const d = document.createElement('div'); d.className = 'status ok'; d.textContent = '✔ PDFを保存しました。'; document.querySelector('main').prepend(d); });
  await p.waitForSelector('#lcToast.on', { timeout: 3000 }); assert.equal(await p.$eval('#lcToast', t => getComputedStyle(t).pointerEvents + getComputedStyle(t).position), 'nonefixed');
  await sl(3300); assert.equal(await p.evaluate(() => !!document.querySelector('#lcToast.on')), false); await p.close();
});
await check('ページのエラーが無い', () => assert.deepEqual(errs, []));
await b.close(); srv.close(); console.log(`  ${pass} ok / ${fail} NG`); if (fail) process.exit(1);
