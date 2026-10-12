// v0.24.2：全ページで、両方のモードから、PC幅とスマホ幅で、実際にクリックしてモードを切りかえられる（Chrome・ローカルのサーバー・架空データなし）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const [wn, vp] of [['PC', { width: 1280, height: 900 }], ['スマホ', { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  for (const pg of ['index.html', 'records.html', 'check.html', 'guide.html']) {
    for (const from of ['coach', 'player']) {
      const to = from === 'coach' ? 'player' : 'coach', name = `${wn} ${pg} ${from}→${to}`;
      const p = await b.newPage();
      try {
        await p.setRequestInterception(true); p.on('request', r => r.url().startsWith(B) ? r.continue() : r.abort());   // 外には出ない
        await p.setViewport(vp); await p.goto(B + pg); await p.evaluate(m => localStorage.setItem('lanenote.mode.v1', m), from);
        await p.goto(B + pg, { waitUntil: 'domcontentloaded' }); await sleep(300);
        await p.click('#modeSw'); await sleep(200);
        const vis = await p.$eval('#modePick', e => { const r = e.getBoundingClientRect(); return !e.hidden && getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; });
        if (!vis) throw new Error('選ぶ画面が見えない');
        const nav = to === 'player' && pg !== 'index.html' ? p.waitForNavigation({ waitUntil: 'domcontentloaded' }) : null;
        await p.click(`#modePick [data-mode="${to}"]`); if (nav) await nav; await sleep(300);
        const st = await p.evaluate(() => ({ m: localStorage.getItem('lanenote.mode.v1'), path: location.pathname, home: !!document.getElementById('phome') && !document.getElementById('phome').hidden, open: !document.getElementById('modePick').hidden, lab: document.getElementById('modeSw').textContent }));
        if (st.m !== to) throw new Error('モードが変わらない ' + st.m);
        if (st.open) throw new Error('選ぶ画面が閉じない');
        if (to === 'player' && !(st.path.endsWith('/') || st.path.endsWith('index.html')) ) throw new Error('選手ホームへ移らない ' + st.path);
        if (to === 'player' && !st.home) throw new Error('選手ホームが出ない');
        if (to === 'coach' && st.home) throw new Error('選手ホームが消えない');
        if (!st.lab.includes(to === 'player' ? '選手モード' : '顧問モード')) throw new Error('ボタンの表示 ' + st.lab);
        pass++; console.log('  ok', name);
      } catch (e) { fail++; console.log('  NG', name, e.message); }
      await p.close();
    }
  }
}
await b.close(); srv.close();
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
