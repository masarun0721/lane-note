// v0.26.34.1 見出しのボタンの列と利用回数（レーンのブロック）が重ならない・ボタンが切れない（Chrome で実際に並べて測る）
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), require = createRequire(import.meta.url), puppeteer = require('puppeteer-core');
const SHOTS = process.env.SHOTS || '';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split(/[?#]/)[0])); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP'] });
const sl = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n); } };
console.log('[v0.26.34.1] 見出しのボタンと利用回数');
try {
  const p = await b.newPage(); await p.setBypassServiceWorker(true); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
  await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); });
  for (const page of ['records.html', 'index.html', 'schedule.html', 'guide.html', 'check.html', 'team.html', 'try.html']) {
    for (const W of [1280, 1024, 880, 768, 390]) {
      await p.setViewport({ width: W, height: 800 }); await p.goto(B + page, { waitUntil: 'domcontentloaded' }); await sl(500);
      const r = await p.evaluate(() => {
                let c = document.querySelector('.hdr-meta>.use-count');
        if (c) { c.hidden = false; c.innerHTML = '<span class="uc-from">2026.10.13-</span>' + '24816'.split('').map(d => '<span class="uc-d">' + d + '</span>').join(''); }
        if (window.__lnNavFit) window.__lnNavFit();
        const vw = document.documentElement.clientWidth, cr = c && c.offsetWidth ? c.getBoundingClientRect() : null;
        const btns = [...document.querySelectorAll('#lnNav .pn-main,#lnNav .pn-menu,#lnNav .pn-sub>*')].filter(x => x.offsetWidth && getComputedStyle(x).visibility !== 'hidden');
        const hit = cr ? btns.filter(x => { const a = x.getBoundingClientRect(); return a.left < cr.right && a.right > cr.left && a.top < cr.bottom && a.bottom > cr.top; }).map(x => x.textContent.trim()) : [];
        const left0 = btns.every(x => x.getBoundingClientRect().left >= -0.5);
        const clip = btns.filter(x => { const a = x.getBoundingClientRect(); return a.left < -0.5 || a.right > vw + 0.5; }).map(x => x.textContent.trim());
        const cclip = cr ? (cr.left < 0 || cr.right > vw + 0.5) : false;
        const nav = document.getElementById('lnNav'), more = document.getElementById('lnNavMore');
        const hr = document.querySelector('header').getBoundingClientRect();
        const floats = [...document.querySelectorAll('body *')].filter(x => { if (x.closest('#lnNav') || !x.offsetWidth) return false; const p = getComputedStyle(x).position; if (p !== 'fixed' && p !== 'sticky') return false; const a = x.getBoundingClientRect(); return a.top < hr.bottom - 1 && a.bottom > hr.top && a.left < hr.right && a.right > hr.left; }).map(x => (x.id || x.className || x.tagName) + '');
        const hscroll = document.documentElement.scrollWidth > vw + 1 || window.scrollX !== 0;
        return { left0, floats, hscroll, hit, clip, cclip, counter: !!cr, fold: nav.classList.contains('fold'), inMenu: more ? [...more.children].map(x => x.dataset.tb || 'mode') : [], shown: btns.length };
      });
      ok(r.hit.length === 0 && r.clip.length === 0 && r.left0 && !r.cclip && !r.floats.length && !r.hscroll, `${page} ${W}px：重なりなし・切れなし（${r.counter ? '利用回数あり' : '利用回数なし'}${r.fold ? '・メニューへ ' + r.inMenu.join(',') : ''}）${r.hit.length ? ' 重なり:' + r.hit.join('|') : ''}${r.clip.length ? ' 切れ:' + r.clip.join('|') : ''}${r.cclip ? ' 利用回数が切れる' : ''}${r.floats.length ? ' 見出しに重なる:' + r.floats.join('|') : ''}${r.hscroll ? ' 横にはみ出す' : ''}`);
      if (W > 720 && r.fold) ok(r.inMenu[0] === 'guide', `${page} ${W}px：メニューに入るのは、はじめて→3分体験→マニュアル→更新情報の順`);
      if (W > 720 && r.fold) { await p.click('#lnNav .pn-menu'); await sl(100); const vis = await p.evaluate(() => { const m = document.getElementById('lnNavMore'); const a = m.getBoundingClientRect(); return m.offsetWidth > 0 && a.left >= 0 && a.right <= document.documentElement.clientWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth + 1 && window.scrollX === 0; }); ok(vis, `${page} ${W}px：「≡ メニュー」を開くと入りきらないボタンが画面の中に出る（ページは横にずれない）`); if (SHOTS && page === 'records.html') await p.screenshot({ path: `${SHOTS}/v026341_header_${W}_menu.png`, clip: { x: 0, y: 0, width: W, height: 420 } }); await p.click('#lnNav .pn-menu'); }
      if (SHOTS && page === 'records.html') await p.screenshot({ path: `${SHOTS}/v026341_header_${W}.png`, clip: { x: 0, y: 0, width: W, height: 260 } });
    }
  }
  // 文字が広いPC（Windows のフォント・文字の大きさの設定など）：左が切れない・横にずれない
  for (const page of ['records.html', 'index.html', 'schedule.html', 'guide.html', 'check.html', 'team.html', 'try.html']) {
    await p.setViewport({ width: 1024, height: 800 }); await p.goto(B + page, { waitUntil: 'domcontentloaded' }); await sl(400);
    const r = await p.evaluate(async () => {
      const st = document.createElement('style'); st.textContent = '.ln-nav *{letter-spacing:.2em}'; document.head.appendChild(st);
      const c = document.querySelector('.hdr-meta>.use-count'); if (c) { c.hidden = false; c.innerHTML = '<span class="uc-from">2026.10.13-</span><span class="uc-d">3</span><span class="uc-d">0</span>'; }
      window.__lnNavFit(); window.scrollTo(300, 0); window.__lnNavFit(); await new Promise(r => setTimeout(r, 50));
      const vw = document.documentElement.clientWidth, bs = [...document.querySelectorAll('#lnNav .pn-main,#lnNav .pn-menu,#lnNav .pn-sub>*')].filter(x => x.offsetWidth);
      return { ok: bs.every(x => { const a = x.getBoundingClientRect(); return a.left >= -0.5 && a.right <= vw + 0.5; }) && document.documentElement.scrollWidth <= vw + 1 && window.scrollX === 0 };
    });
    ok(r.ok, `${page} 1024px・文字が広いとき：ボタンの左も右も切れない・ページが横にずれない`);
  }
} finally { await b.close(); srv.close(); }
console.log(`v026341_header_layout: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
