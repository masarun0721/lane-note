// v0.32.1 マニュアルの「こんなのが作れます」（できあがりの見本・架空の選手）  node v0321_gallery.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..');
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.32.1] こんなのが作れます');
const M = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');
await check('見本は6〜8枚・どれも「これを作るには」2〜4手順と「くわしく→」（あるの記事へ）・ヒーローにボタン・試作版などは残る', () => {
  const g = M.split('id="gallery"')[1].split('</section>')[0], cards = g.split('class="gl-card"').slice(1);
  assert.ok(cards.length >= 6 && cards.length <= 8, cards.length);
  for (const c of cards) { assert.ok(c.includes('これを作るには')); const n = (c.split('</ol>')[0].match(/<li>/g) || []).length; assert.ok(n >= 2 && n <= 4, n);
    const a = /class="gl-more" href="#(a-[a-z]+)">くわしく→/.exec(c); assert.ok(a && M.includes('<article class="mb-art" id="' + a[1] + '"'), a && a[1]);
    assert.ok(/<img src="img\/manual\/gal_[a-z]+\.webp\?v=[0-9a-f]{8}"/.test(c)); }
  assert.ok(M.includes('href="#gallery">🖼 こんなのが作れます</a>')); assert.ok(g.includes('たとえば、こんなのがすぐ作れるよ！'));
  for (const w of ['試作版', 'Presented by Sakata', 'すべての陸上競技部顧問が、', '試作版について・免責']) assert.ok(M.includes(w), w);
  assert.ok(!/分け合う|jaaf/i.test(g));
});
const T = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.js': 'application/javascript', '.png': 'image/png' };
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split(/[?#]/)[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
for (const [w, mob] of [[1280, false], [390, true]]) await check(w + 'px：絵が読める・はみ出さない・' + (mob ? '横にめくる（scroll-snap・次の1枚が少し見える）' : '並べて表示') + '・押すと大きく・閉じる', async () => {
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.setViewport({ width: w, height: 800, isMobile: mob, hasTouch: mob });
  await p.goto(B + 'manual.html', { waitUntil: 'load' }); await p.evaluate(() => { document.getElementById('gallery').scrollIntoView(); document.querySelectorAll('#gallery img').forEach(i => { i.loading = 'eager'; }); }); await sl(1200);
  const r = await p.evaluate(async () => { const row = document.querySelector('.gl-row'), c = [...row.children], im = [...document.querySelectorAll('#gallery .gl-img img')];
    await Promise.all(im.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    return { sw: document.documentElement.scrollWidth, vw: innerWidth, snap: getComputedStyle(row).scrollSnapType, disp: getComputedStyle(row).display, c0: c[0].getBoundingClientRect().width, c1x: c[1].getBoundingClientRect().x, bad: im.filter(i => !i.naturalWidth).length }; });
  assert.ok(r.sw <= r.vw, 'はみ出し ' + JSON.stringify(r)); assert.equal(r.bad, 0);
  if (mob) { assert.equal(r.snap, 'x mandatory'); assert.ok(r.c0 > w * 0.7 && r.c1x < w, JSON.stringify(r)); } else assert.equal(r.disp, 'grid');
  await p.click('.gl-img'); await sl(400); assert.equal(await p.evaluate(() => !document.getElementById('glLb').hidden && /gal_/.test(document.querySelector('#glLb img').src)), true);
  await p.keyboard.press('Escape'); await sl(200); assert.equal(await p.evaluate(() => document.getElementById('glLb').hidden), true);
  if (mob) { await p.evaluate(() => document.querySelector('.gl-more').click()); await sl(500); assert.equal(await p.evaluate(() => document.querySelector('#' + document.querySelector('.gl-more').getAttribute('href').slice(1)).classList.contains('open')), true); }
  assert.deepEqual(errs, []); await p.close();
});
await b.close(); srv.close(); console.log(`  ${pass} ok / ${fail} NG`); if (fail) process.exit(1);
