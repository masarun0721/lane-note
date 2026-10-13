// v0.25.2：どのページでもヘッダーのロゴを押すとホーム（index.html）へ。選手モードなら選手ホーム、共有リンクからは通常のホーム（Chrome・ローカル・外には出ない）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const cases = [['index.html', 'coach'], ['records.html', 'coach'], ['check.html', 'coach'], ['guide.html', 'coach'], ['guide.html#manual', 'coach'], ['records.html', 'player'], ['guide.html#manual', 'player'], ['index.html?s=AbCdEfGh12', 'coach'], ['index.html?t=TalkAbcdefghij012345', 'player'], ['index.html#p=xyz', 'coach']];
for (const [wn, vp] of [['PC', { width: 1280, height: 900 }], ['スマホ', { width: 412, height: 915, isMobile: true, hasTouch: true }]]) for (const [pg, mode] of cases) {
  const name = `${wn} ${pg} ${mode}`, p = await b.newPage();
  try {
    await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());
    await p.setViewport(vp); await p.goto(B + 'guide.html'); await p.evaluate(m => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', m); }, mode);
    await p.goto(B + pg, { waitUntil: 'domcontentloaded' }); await sleep(300);
    const a = await p.$eval('header .logo-home', e => ({ label: e.getAttribute('aria-label'), cur: getComputedStyle(e).cursor, href: e.getAttribute('href'), vis: e.getBoundingClientRect().width > 0 }));
    if (a.label !== 'ホームへ' || a.cur !== 'pointer' || a.href !== './') throw new Error(JSON.stringify(a));
    if (!a.vis) { if (pg.includes('?') || pg.includes('#p')) { pass++; console.log('  ok', name, '（共有の画面はヘッダーなし）'); await p.close(); continue; } throw new Error('ロゴが見えない'); }
    await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }), p.click('header .logo-home')]); await sleep(400);
    await sleep(600);   // v0.25.8：顧問モードはトップ（/）から記録のページへ移る
    const st = await p.evaluate(() => ({ path: location.pathname, q: location.search + location.hash, home: !!document.getElementById('phome') && !document.getElementById('phome').hidden, rec: document.body.classList.contains('records') }));
    if (st.q) throw new Error('ホームに移らない ' + JSON.stringify(st));
    if (mode === 'player' && (st.path !== '/' || !st.home)) throw new Error('選手ホームが出ない ' + JSON.stringify(st));
    if (mode === 'coach' && (st.path !== '/records.html' || !st.rec)) throw new Error('トップ（記録のページ）が出ない ' + JSON.stringify(st));
    pass++; console.log('  ok', name);
  } catch (e) { fail++; console.log('  NG', name, e.message); }
  await p.close();
}
await b.close(); srv.close();
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
