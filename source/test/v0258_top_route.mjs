// v0.25.8：トップ（/）は記録のページへ。古いアドレス・共有リンク・選手モードは今までどおり（Chrome・ローカル・外部への通信は止める・架空データなし）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setRequestInterception(true);
p.on('request', r => { if (r.url().startsWith(B)) r.continue(); else r.abort(); });
async function at(u, mode) {
  await p.goto(B + 'guide.html'); await p.evaluate(m => { localStorage.clear(); if (m) localStorage.setItem('lanenote.mode.v1', m); }, mode || '');
  await p.goto(B + u, { waitUntil: 'load' }); await sleep(600);
  return p.evaluate(() => ({ path: location.pathname, search: location.search, hash: location.hash, rec: document.body.classList.contains('records'), prep: !!document.getElementById('phome'), pick: !document.getElementById('modePick').hidden, player: document.body.classList.contains('ln-player'), nav: [...document.querySelectorAll('.pagenav a')].map(a => a.getAttribute('href') + ':' + a.textContent.trim()).join('|'), logo: document.querySelector('.logo-home').getAttribute('href') }));
}
let r = await at('', ''); ok('はじめての人：トップ → 記録のページ・モードを聞く', r.path === '/records.html' && r.rec && r.pick, JSON.stringify(r));
r = await at('', 'coach'); ok('顧問モード：トップ → 記録のページ', r.path === '/records.html' && r.rec && !r.pick, JSON.stringify(r));
ok('ナビは 記録・大会準備・照合 の順', r.nav.startsWith('records.html:📒 記録|index.html:🏁 大会準備|check.html:✅ 照合|'), r.nav);
ok('ロゴはトップ（./）へ', r.logo === './', r.logo);
r = await at('', 'player'); ok('選手モード：トップは選手のホームのまま', r.path === '/' && r.prep && r.player, JSON.stringify(r));
r = await at('index.html', 'coach'); ok('index.html は大会準備のページ', r.path === '/index.html' && r.prep && !r.rec, JSON.stringify(r));
ok('大会準備のナビも 記録 が先頭', r.nav.startsWith('records.html:📒 記録|index.html:🏁 大会準備'), r.nav);
for (const u of ['?s=AbCdEfGh12', '?t=AbCdEfGhIjKlMnOpQrSt', '#p=abc', '#d=abc', '#dataPolicy', 'index.html?s=AbCdEfGh12'])
  { r = await at(u, 'coach'); ok('古いリンク ' + u + ' は大会準備のページのまま', r.prep && !r.rec && r.path !== '/records.html', JSON.stringify(r)); }
r = await at('records.html?me=1#athlete=%E6%9E%B6%E7%A9%BA', 'coach'); ok('records.html?…#… はそのまま記録のページ', r.path === '/records.html' && r.search === '?me=1' && r.rec, JSON.stringify(r));
r = await at('', ''); await p.click('[data-mode="player"]'); await p.waitForNavigation({ waitUntil: 'load' }).catch(() => {}); await sleep(600);
r = await p.evaluate(() => ({ path: location.pathname, player: document.body.classList.contains('ln-player') })); ok('記録のページで選手モードを選ぶ → 大会準備（選手のホーム）へ', r.path === '/index.html' && r.player, JSON.stringify(r));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); ok('Service Worker は index.html も保存する', /new URL\('\.\/index\.html'/.test(sw) && /c\.put\(INDEX/.test(sw));
for (const f of ['check.html', 'guide.html']) { r = await at(f, 'coach'); ok(f + '：ナビは 記録 が先頭・大会準備は index.html', r.nav.startsWith('records.html:📒 記録|index.html:🏁 大会準備'), r.nav); }
await b.close(); srv.close();
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
