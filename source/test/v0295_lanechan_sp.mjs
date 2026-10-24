// v0.29.5 レーンちゃんのポーズ・マニュアルの記事・jaaf.html（本郷の先生用）・スマホの見直し（架空データだけ・ローカル）
//   node v0295_lanechan_sp.mjs [スクショの保存先フォルダ]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url'; import puppeteer from 'puppeteer-core';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), SHOT = process.argv[2] || '';
let pass = 0, fail = 0; async function check(n, f) { try { await f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
console.log('[v0.29.5] レーンちゃんのポーズ・記事・JAAF手伝いの説明・スマホ');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
await check('ポーズの画像6つ（小さい webp）が、どのページのレーンちゃんにも入る。jaaf.html・admin.html には動くレーンちゃんを入れない', () => {
  for (const k of ['trouble', 'bow', 'idea', 'celebrate', 'wave', 'phone']) { const p = path.join(ROOT, 'img/manual/lc_' + k + '.webp'); assert.ok(fs.existsSync(p), k); assert.ok(fs.statSync(p).size < 20000, k); assert.ok(rd('records.html').includes('img/manual/lc_' + k + '.webp?v='), k); }
  for (const n of ['jaaf.html', 'admin.html']) assert.ok(!rd(n).includes('lcToast'), n);
});
await check('マニュアルに記事を7つ追加（実際の機能だけ・JAAFの手伝いは出さない）', () => {
  const m = rd('manual.html');
  for (const id of ['a-start', 'a-phone', 'a-data', 'a-multiday', 'a-yoko', 'a-moved', 'a-trouble']) assert.ok(m.includes('id="' + id + '"'), id);
  for (const k of ['はじめての使い方（5分で）', 'ホーム画面に追加', '💾 ファイルに書き出す（JSON）', '📂 ファイルから読み込む', '対象日', '⚠ 別の端末', '読めませんでした']) assert.ok(m.includes(k), k);
  assert.ok(!/jaaf|JAAF|分け合う|masarun/.test(fs.readFileSync(path.join(here, '../src/manual_articles.html'), 'utf8'))); assert.ok(m.includes('lc_wave.webp'));
});
await check('jaaf.html：本郷の先生だけの機能・チェックだけ・送信/一時保存/確定は押さない・連絡先にさわらない・手順1〜4・困ったとき・FAQ・noindex', () => {
  const h = rd('jaaf.html');
  for (const k of ['本郷中学校・高等学校 陸上競技部の先生が使うために作ったページです。どなたでも使えますが、エントリーの確定は必ずご自身で行ってください。', 'はい、どなたでも使えます。ただし、エントリーの確定は必ずご自身で行ってください。', 'noindex', '連絡先', '「🟦 JAAF用にコピー」', '登録番号', 'Ctrl+Shift+B', '何も起きない', 'スマホではできません', '確定は先生ご本人が押します', 'id="jfTr"', 'id="jfFaq"', 'lc_bow.webp', 'lc_trouble.webp'])
    assert.ok(h.includes(k), k);
  assert.ok(!h.includes('阪田さん専用')); assert.ok(!/masarun|分け合う/.test(fs.readFileSync(path.join(here, '../src/jaaf_template.html'), 'utf8')));
  for (const f of ['index.html', 'check.html', 'guide.html', 'try.html', 'manual.html', 'intro.html']) assert.ok(!rd(f).includes('href="jaaf.html"'), f);
});
const T = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'application/javascript' };
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] }); const sl = ms => new Promise(r => setTimeout(r, ms));
async function page(f, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 800, isMobile: w < 800, hasTouch: w < 800 }); await p.evaluateOnNewDocument(() => { try { localStorage.setItem('lanenote.mode.v1', 'coach'); } catch (e) {} });
  await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) || r.url().startsWith('data:') ? r.continue() : r.abort()); try { await p.goto(B + f, { waitUntil: 'load', timeout: 20000 }); } catch (e) {} await sl(900); return p; }
await check('ポーズ：💡のコツ＝ひらめき、うまくいかない表示＝困った、QRの所＝スマホ、お礼＝おじぎ、大きな完了＝おめでとう（押せない・じゃましない）', async () => {
  const p = await page('manual.html', 1280);
  assert.ok(await p.$eval('#a-multiday .mb-tip', e => /lc_idea/.test(e.querySelector('.lc-pose').src)));
  await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<p class="status ng" id="t1">✖ PDFを読めませんでした（架空）</p><div id="t2"><button type="button">🔳 QR</button></div>'; document.querySelector('main').prepend(d); }); await sl(400);
  assert.ok(await p.$eval('#t1', e => /lc_trouble/.test(e.querySelector('.lc-pose').src)));
  assert.ok(await p.$eval('#t2', e => /lc_phone/.test(e.querySelector('.lc-pose').src)));
  assert.equal(await p.$eval('#t1 .lc-pose', e => getComputedStyle(e).pointerEvents), 'none');
  await p.evaluate(() => { const s = document.createElement('div'); s.className = 'status'; s.id = 't3'; document.querySelector('main').prepend(s); s.textContent = '✔ 送信しました。ありがとうございます！'; }); await sl(700);
  assert.ok(await p.$eval('#lcToast', e => e.classList.contains('on') && /lc_bow/.test(e.querySelector('img').src) && getComputedStyle(e).pointerEvents === 'none'));
  if (SHOT) await p.screenshot({ path: path.join(SHOT, 'v0295_toast_bow_pc.png') });
  await sl(3200); await p.evaluate(() => { document.getElementById('t3').textContent = '✔ まとめて12件を取り込みました（架空）'; }); await sl(700);
  assert.ok(await p.$eval('#lcToast', e => /lc_celebrate/.test(e.querySelector('img').src)));
  if (SHOT) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(SHOT, 'v0295_toast_celebrate_pc.png') }); }
  await p.close();
});
await check('スマホ（390・360）：どのページも横にはみ出さない・上のメニューのボタンは44px以上・入力は16px', async () => {
  for (const w of [390, 360]) for (const f of ['index.html', 'records.html', 'team.html', 'schedule.html', 'check.html', 'guide.html', 'manual.html', 'try.html', 'intro.html', 'jaaf.html']) {
    const p = await page(f, w);
    const r = await p.evaluate(() => ({ h: document.documentElement.scrollWidth - document.documentElement.clientWidth, nav: [...document.querySelectorAll('.pn-main, .pn-b, .lc-av, .divsw button, .fb-btn')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height), fs: [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select')].filter(e => e.offsetParent).map(e => parseFloat(getComputedStyle(e).fontSize)) }));
    assert.ok(r.h <= 0, f + ' ' + w + ' はみ出し ' + r.h); assert.ok(r.nav.every(x => x >= 43.5), f + ' ' + w + ' ' + r.nav); assert.ok(r.fs.every(x => x >= 16), f + ' ' + w + ' font ' + r.fs);
    await p.close();
  }
});
await b.close(); srv.close();
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
