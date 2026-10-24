// v0.29.6 マニュアルの説明動画13本（ローカル・通信なし）
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.6] 説明動画');
const N = {'a-start':['lanenote_hajimete'],'a-day':['taikai_junbi','kyoyu_link'],'a-cards':['number_card_sankaryo'],'a-parent':['hogosha_oshirase'],'a-check':['entry_shogo'],'a-entry':['entry_chosa'],'a-sched':['taikai_yotei'],'a-records':['kirokucho'],'a-player':['kojin_kiroku'],'a-data':['hozon_kakidashi'],'a-phone':['sumaho'],'a-team':['team']};
const m = fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8');
await check('13本：各記事に controls preload=none playsinline・poster は webp・ファイルがある・720p・1本4MB未満', () => {
  let k = 0;
  for (const [a, vs] of Object.entries(N)) { const art = m.split('id="' + a + '"')[1].split('</article>')[0];
    for (const v of vs) { k++; const re = new RegExp('<video controls preload="none" playsinline[^>]*poster="img/manual/video/' + v + '\\.webp\\?v=[0-9a-f]{8}"[^>]*><source src="img/manual/video/' + v + '\\.mp4\\?v=[0-9a-f]{8}" type="video/mp4">'); assert.ok(re.test(art), a + ' ' + v);
      for (const e of ['.mp4', '.webp']) { const f = path.join(ROOT, 'img/manual/video', v + e); assert.ok(fs.existsSync(f), f); if (e === '.mp4') assert.ok(fs.statSync(f).size < 4e6, f); } } }
  assert.equal(k, 13); assert.equal((m.match(/<video /g) || []).length, 13); assert.ok(!m.includes('__VIDEO_'));
});
await check('CSP に media-src \'self\'・service worker は動画を保存しない（ページの移動だけ扱う）', () => {
  assert.ok(/media-src 'self'/.test(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); assert.ok(!/mp4|video/.test(sw)); assert.ok(sw.includes("r.mode !== 'navigate'"));
});
const T = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.mp4': 'video/mp4', '.js': 'application/javascript' };
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); const p = path.join(ROOT, f); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
await check('開いただけでは動画を読み込まない・ポスターが出る・390px ではみ出さない・再生できる', async () => {
  for (const w of [1280, 390]) { const p = await b.newPage(); await p.setViewport({ width: w, height: 800, isMobile: w < 800 }); const got = [];
    p.on('request', r => got.push(r.url())); await p.goto(B + 'manual.html', { waitUntil: 'load' }); await sl(600);
    assert.ok(!got.some(u => u.includes('.mp4')), 'mp4 preloaded');
    await p.$eval('#a-data .mb-video', e => e.scrollIntoView()); await sl(500);
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, vwid: document.querySelector('#a-data video').getBoundingClientRect().width }));
    assert.ok(r.sw <= r.vw, w + ' はみ出し'); assert.ok(r.vwid > 200);
    if (SHOT) await p.screenshot({ path: path.join(SHOT, 'v0296_manual_video_' + (w < 800 ? 'sp' : 'pc') + '.png') });
    if (w === 1280) { const ok = await p.evaluate(async () => { const v = document.querySelector('#a-data video'); v.muted = true; await v.play(); await new Promise(r => setTimeout(r, 1200)); return v.currentTime > 0.3 && v.videoWidth === 1280 && v.videoHeight === 720; }); assert.ok(ok, 'play'); }
    await p.close(); }
});
await b.close(); srv.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
