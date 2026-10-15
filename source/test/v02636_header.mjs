// v0.26.36 見出しのボタンは、どのページ・どの幅でも「📒 記録・🏁 大会準備・✅ 照合・📅 大会予定・≡ メニュー」だけ。ほかは全部メニューの中
//   スマホで5つが入りきらないときは、≡ メニューを残して、大会予定→照合…の順にメニューへ。Windows の表示倍率 125%・150% も
//   倍率：PC（1024 以上）は Windows の表示倍率（CSS の幅が 1/倍率）、768・390 は端末の画素の倍率（CSS の幅はそのまま）
//   SHOTS=フォルダ でスクショ（1280・390 でメニューを開いたところ）
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = process.env.ROOT || path.join(here, '../..'), require = createRequire(import.meta.url), puppeteer = require('puppeteer-core');
const SHOTS = process.env.SHOTS || '';
const srv = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split(/[?#]/)[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ja-JP'] });
const sl = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  NG', n); } };
const ROW = ['records', 'index', 'check', 'schedule', 'menu'], MENU = ['changelog', 'team', 'manual', 'guide', 'try', 'feedback', 'mode'];
const PAGES = [['index.html', 'index'], ['records.html', 'records'], ['check.html', 'check'], ['schedule.html', 'schedule'], ['team.html', 'team'], ['guide.html', 'guide'], ['try.html', 'try']];
const SIZES = [];
for (const W of [1366, 1280, 1024, 768, 390]) for (const dpr of [1, 1.25, 1.5]) SIZES.push([W, dpr]);
console.log('[v0.26.36] 見出しのボタン');
const errs = [];
async function setMode(p, m) { await p.goto(B + 'guide.html', { waitUntil: 'domcontentloaded' }); await p.evaluate(m => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', m); }, m); }
const state = p => p.evaluate(() => {
  const n = document.getElementById('lnNav'), sub = document.getElementById('lnNavSub'), vw = document.documentElement.clientWidth;
  const key = e => e.classList.contains('pn-menu') ? 'menu' : e.id === 'modeSw' || e.classList.contains('mode-sw') ? 'mode' : e.getAttribute('data-tb');
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const row = [...n.children].filter(e => e !== sub && e.tagName !== 'STYLE' && e.tagName !== 'SCRIPT' && vis(e)).map(key);
  const inSub = [...sub.children].filter(e => getComputedStyle(e).display !== 'none').map(key);
  const btns = [...n.querySelectorAll('a,button')].filter(vis);
  const clip = btns.filter(x => { const a = x.getBoundingClientRect(); return a.left < -0.5 || a.right > vw + 0.5; }).map(key);
  const c = document.querySelector('.hdr-meta>.use-count'), cr = c && c.offsetWidth ? c.getBoundingClientRect() : null;
  const hit = cr ? btns.filter(x => { const a = x.getBoundingClientRect(); return a.left < cr.right && a.right > cr.left && a.top < cr.bottom && a.bottom > cr.top; }).map(key) : [];
  const badge = n.querySelector('.pn-menu .cl-new'), badgeVis = !!badge && vis(badge);
  const cur = [...n.querySelectorAll('[aria-current="page"]')].map(key);
  const hr = document.querySelector('header').getBoundingClientRect();
  const floats = [...document.querySelectorAll('body *')].filter(x => { if (x.closest('#lnNav') || !x.offsetWidth) return false; const ps = getComputedStyle(x).position; if (ps !== 'fixed' && ps !== 'sticky') return false; const a = x.getBoundingClientRect(); return a.top < hr.bottom && a.bottom > hr.top && a.height > 0; }).map(x => x.className);
  return { row, inSub, clip, hit, badgeVis, cur, floats, hscroll: document.documentElement.scrollWidth > vw + 1 || window.scrollX !== 0, vw };
});
const panel = p => p.evaluate(() => {
  const sub = document.getElementById('lnNavSub'), m = document.querySelector('#lnNav .pn-menu'), a = sub.getBoundingClientRect(), mb = m.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight;
  const items = [...sub.children].filter(x => x.offsetWidth);
  const blocked = items.filter(x => { const c = x.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2; if (cy > vh || cy > a.bottom) return false; const e = document.elementFromPoint(cx, cy); return !e || !x.contains(e); }).map(x => x.textContent.trim().slice(0, 8));
  return { n: items.length, blocked, inView: a.left >= -0.5 && a.right <= vw + 0.5 && a.top >= 0, near: a.top >= mb.bottom - 1 && a.top <= mb.bottom + 20 && a.left <= mb.right && a.right >= mb.left };
});
try {
  const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.setBypassServiceWorker(true); await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
  await setMode(p, 'coach');
  for (const [page, k] of PAGES.filter(x => !process.env.ONLY || x[0] === process.env.ONLY)) for (const [W, dpr] of SIZES) {
    const cw = W <= 768 ? W : Math.round(W / dpr), tag = `${page} ${W}px×${dpr}`;
    await p.setViewport({ width: cw, height: Math.round(800 / dpr), deviceScaleFactor: dpr, isMobile: W <= 768, hasTouch: W <= 768 });
    await p.goto(B + page, { waitUntil: 'domcontentloaded' }); await sl(350);
    await p.evaluate(() => { document.querySelectorAll('.mp-ov,.mode-pick').forEach(x => x.remove()); const c = document.querySelector('.hdr-meta>.use-count'); if (c) { c.hidden = false; c.innerHTML = '<span class="uc-from">2026.10.13-</span>' + '24816'.split('').map(d => '<span class="uc-d">' + d + '</span>').join(''); } window.__lnNavFit(); });
    await sl(80);
    let s = await state(p);
    // v0.26.45 ロゴのマーク（絵の中の余白を除く）・説明・ボタンの列の左端がそろう
    const al = await p.evaluate(() => { const sv = document.querySelector('header .logo svg'), sr = sv && sv.getBoundingClientRect(), t = document.querySelector('header .tagline'), b = [...document.querySelectorAll('#lnNav > a, #lnNav > button')].find(x => x.offsetWidth); return { icon: sr ? sr.left + 20 * sr.height / 240 : null, tag: t && t.offsetWidth ? t.getBoundingClientRect().left : null, nav: b ? b.getBoundingClientRect().left : null }; });
    ok(al.icon != null && al.nav != null && Math.abs(al.icon - al.nav) < 1.5 && (al.tag == null || Math.abs(al.tag - al.nav) < 1.5), `${tag} ロゴ・説明・ボタンの左端がそろう ${JSON.stringify(al)}`);
    const folded = ROW.filter(x => !s.row.includes(x));
    ok(s.row[s.row.length - 1] === 'menu' && s.row.join() === ROW.filter(x => s.row.includes(x)).join() && s.row.join() === ROW.slice(0, s.row.length - 1).concat('menu').join(), `${tag} 見出しは 記録・大会準備・照合・大会予定・≡ メニュー の順（${s.row.join()}）`);
    if (cw > 720) ok(folded.length === 0, `${tag} PCでは5つ全部が見出しに出る（${s.row.join()}）`);
    ok(s.inSub.join() === folded.concat(MENU).join(), `${tag} メニューの中は ${folded.length ? '入りきらない分＋' : ''}更新情報・チーム・マニュアル・はじめて・3分体験・不具合・モード（${s.inSub.join()}）`);
    ok(!s.badgeVis, `${tag} ≡ メニューに NEW は出さない（v0.26.38.1）`);
    ok(!s.clip.length && !s.hit.length && !s.hscroll && !s.floats.length, `${tag} 切れ・利用回数との重なり・横ずれ・見出しに重なる浮いたものなし ${JSON.stringify([s.clip, s.hit, s.hscroll, s.floats])}`);
    ok(s.cur.length === 1 && s.cur[0] === k, `${tag} 今のページを強調 ${s.cur}`);
    await p.click('#lnNav .pn-menu'); await sl(150);
    const r = await panel(p);
    ok(r.n === folded.length + MENU.length && !r.blocked.length && r.inView && r.near, `${tag} メニューを開くと全部見えて押せる・画面の中・ボタンの下 ${JSON.stringify(r)}`);
    if (SHOTS && page === 'index.html' && dpr === 1 && (W === 1280 || W === 390)) await p.screenshot({ path: path.join(SHOTS, `v02636_menu_${W}.png`), captureBeyondViewport: false });
    if (SHOTS && page === 'index.html' && dpr === 1.5 && W === 1280) await p.screenshot({ path: path.join(SHOTS, `v02636_menu_1280_1.5.png`), captureBeyondViewport: false });
    await p.keyboard.press('Escape'); await sl(50);
    ok(await p.evaluate(() => !document.getElementById('lnNav').classList.contains('open')), `${tag} Esc で閉じる`);
  }
  // 更新情報：メニューの中のボタンで開く
  await p.setViewport({ width: 1280, height: 800 }); await p.goto(B + 'records.html', { waitUntil: 'domcontentloaded' }); await sl(300);
  // v0.26.38.1 各ページの上に更新情報の欄は無い。「📰 更新情報」は guide.html の更新情報の欄へ移り、新しい版が先頭
  ok(await p.evaluate(() => !document.getElementById('changelog') && !document.getElementById('lnTopbar')), '記録のページの上に古い更新情報の欄が無い');
  await p.click('#lnNav .pn-menu'); await sl(100);
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.click('[data-tb="changelog"]')]); await sl(200);
  const cl = await p.evaluate(() => { const c = document.getElementById('changelog'), b = c && c.querySelector('li .cl-h b'), r = c && c.getBoundingClientRect(); return { path: location.pathname + location.hash, first: b && b.textContent, date: b && b.parentNode.textContent.replace(b.textContent, ''), inView: !!r && r.top < innerHeight && r.bottom > 0, ver: document.querySelector('.hdr-ver') && document.querySelector('.hdr-ver').textContent }; });
  ok(cl.path === '/guide.html#changelog' && cl.inView && cl.first === cl.ver.trim() && cl.date === '2026/10/15', '「📰 更新情報」で guide.html の更新情報へ・先頭が今の版 ' + JSON.stringify(cl));
  // 選手モード：記録・大会準備・照合・大会予定・チーム・更新情報は出さない（≡ メニューとモードの切りかえは出す）
  await setMode(p, 'player');
  for (const [W, mob] of [[1280, false], [390, true]]) {
    await p.setViewport({ width: W, height: 800, isMobile: mob, hasTouch: mob }); await p.goto(B + 'index.html', { waitUntil: 'domcontentloaded' }); await sl(350);
    await p.evaluate(() => document.querySelectorAll('.mp-ov,.mode-pick').forEach(x => x.remove()));
    const s = await state(p);
    ok(s.row.join() === 'menu' && !s.badgeVis, `選手モード ${W}px：見出しは ≡ メニューだけ・NEW は出さない（${s.row.join()}）`);
    ok(!s.inSub.includes('team') && !s.inSub.includes('changelog') && s.inSub.includes('mode') && !s.inSub.includes('records'), `選手モード ${W}px：メニューにチーム・更新情報は出さない（${s.inSub.join()}）`);
  }
  ok(!errs.length, 'ページのエラーなし ' + errs.slice(0, 3).join(' / '));
} finally { await b.close(); srv.close(); }
console.log(`v02636_header: ${pass} ok / ${fail} NG`); process.exit(fail ? 1 : 0);
