// v0.25.4：トップページの利用カウンター（Chrome・ローカル。Firebase は偽物の部品に差し替え、外には出ない）
// ・1端末1日1回だけ +1、再読み込みでは増えない、日付が変わると +1、文書がなければ n=1 で作る、読めないときは表示を隠す
//   node v0254_counter.mjs [スクショの保存先.png]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'), SHOT = process.argv[2] || '';
const S = { n: null, fail: false, inc: 0, set: 0 };
const srv = http.createServer((q, s) => {
  if (q.url.startsWith('/__c/')) { const op = q.url.slice(5); s.setHeader('Content-Type', 'application/json');
    if (S.fail) { s.writeHead(500); s.end('{}'); return; }
    if (op === 'inc') { if (S.n == null) { s.end('{"code":"not-found"}'); return; } S.n++; S.inc++; }
    if (op === 'set') { if (S.n != null) { s.end('{"code":"permission-denied"}'); return; } S.n = 1; S.set++; }
    s.end(JSON.stringify({ n: S.n })); return; }
  let f = decodeURIComponent(q.url.split(/[?#]/)[0]); if (f.endsWith('/')) f += 'index.html'; const p = path.join(ROOT, f); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); s.end(fs.readFileSync(p)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port + '/';
const FAKE = {
  'firebase-app.js': 'export const getApps=()=>[];export const getApp=()=>({});export const initializeApp=()=>({});',
  'firebase-auth.js': 'export const getAuth=()=>({currentUser:null,authStateReady:async()=>{}});export const onAuthStateChanged=()=>{};',
  'firebase-firestore.js': `const B=${JSON.stringify(B)};async function call(op){const r=await fetch(B+'__c/'+op);if(!r.ok)throw Object.assign(new Error('x'),{code:'unavailable'});const j=await r.json();if(j.code)throw Object.assign(new Error(j.code),{code:j.code});return j;}
export const getFirestore=()=>({});export const doc=(db,a,b)=>({path:a+'/'+b});export const increment=v=>({inc:v});export const serverTimestamp=()=>({ts:1});
export async function updateDoc(ref,d){if(ref.path!=='stats/counter'||Object.keys(d).join()!=='n,at'||!d.at||!d.at.ts||!d.n||d.n.inc!==1)throw new Error('bad write');await call('inc');}
export async function setDoc(ref,d){if(ref.path!=='stats/counter'||JSON.stringify(d)!=='{"n":1,"at":{"ts":1}}')throw new Error('bad set');await call('set');}
export async function getDoc(ref){const j=await call('get');return {exists:()=>j.n!=null,data:()=>({n:j.n})};}`,
};
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ok', n); } else { fail++; console.log('  NG', n, d || ''); } };
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
await p.setRequestInterception(true);
p.on('request', r => { const u = r.url(), m = /gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)$/.exec(u);
  if (m && FAKE[m[1]]) r.respond({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAKE[m[1]] });
  else if (u.startsWith(B)) r.continue(); else r.abort(); });
const errs = []; p.on('pageerror', e => errs.push(e.message));
async function load(pg = '') { await p.goto(B + pg, { waitUntil: 'load' }); await sleep(2200); return p.evaluate(() => { const e = document.getElementById('useCount'); return { hidden: !e || e.hidden, text: e ? e.textContent : '', aria: e ? e.getAttribute('aria-label') : '', digits: e ? e.querySelectorAll('.uc-d').length : 0 }; }); }
await p.goto(B + 'guide.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lanenote.mode.v1', 'coach'); });
let r = await load(); ok('最初の1回：文書がないので n=1 で作って表示', !r.hidden && r.text === '2026.10.13-1' && S.set === 1, JSON.stringify(r));
r = await load(); ok('再読み込みでは増えない', r.text === '2026.10.13-1' && S.inc === 0, JSON.stringify(r));
const today = await p.evaluate(() => localStorage.getItem('lanenote.count.v1')); ok('localStorage には日付だけ', /^\d{4}-\d\d-\d\d$/.test(today), today);
await p.evaluate(() => localStorage.setItem('lanenote.count.v1', '2000-01-01')); S.n = 1233;
r = await load(); ok('日付が変わると +1（3桁区切り）', r.text === '2026.10.13-1234' && S.inc === 1, JSON.stringify(r));
r = await load('records.html?me=1'); ok('別のアドレス（records.html?me=1）で開いても、同じ日は増えない', S.inc === 1);
await p.evaluate(() => localStorage.removeItem('lanenote.count.v1')); r = await load('records.html?me=1'); ok('records.html で開いた日も数える', S.inc === 2, S.inc);
S.fail = true; await p.evaluate(() => localStorage.removeItem('lanenote.count.v1'));
r = await load(); ok('読めないときは表示を隠すだけ', r.hidden && !errs.length, JSON.stringify(r) + errs.join());
const kept = await p.evaluate(() => localStorage.getItem('lanenote.count.v1')); ok('失敗した日は数えた印を残さない', kept === null, kept);
ok('画面は壊れない（トップ＝記録のページが出る）', await p.evaluate(() => /records\.html$/.test(location.pathname) && document.body.classList.contains('records') && getComputedStyle(document.querySelector('main')).display !== 'none'), await p.evaluate(() => location.href));
S.fail = false; S.n = 1234;
if (SHOT) { await p.evaluate(() => localStorage.setItem('lanenote.count.v1', 'x')); await load(); await p.addStyleTag({ content: '.status.ng{display:none!important}' }); await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await sleep(400); await p.screenshot({ path: SHOT }); console.log('  shot', SHOT); }
await b.close(); srv.close();
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
