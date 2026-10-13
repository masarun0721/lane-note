// v0.26.4：まとめて取り込むの上限 400・続きを読み込む（架空データのみ。私学大会型：開始時刻順ページから rel001..376）
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {JSDOM} from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const w = new JSDOM('', { url: 'https://masarun0721.github.io/lane-note/', runScripts: 'outside-only' }).window;
Object.assign(w, { TextEncoder, TextDecoder, Response, Blob, File }); w.eval(fs.readFileSync(path.join(here, '../src/urlload.js'), 'utf8'));
const L = w.LaneUrl, B = 'https://example.test/2026/meet/';
const res = '<html><head><meta charset="utf-8"><title>結果</title></head><body>1位 架空太郎</body></html>';
function site(n) {
  const m = {}; let tt = '<html><head><meta charset="utf-8"><title>競技別一覧表（開始時刻順）</title></head><body><a href="kyougi.html">競技一覧画面へ</a><a href="master.html">競技者一覧画面へ</a><a href="cond.html">コンディション画面へ</a>';
  for (let i = 1; i <= n; i++) { const f = 'rel' + String(i).padStart(3, '0') + '.html'; tt += '<a href="' + f + '">' + i + '組</a><br>'; m[B + f] = res; }
  m[B + 'tt.html'] = tt + '</body></html>'; m[B + 'kyougi.html'] = '<html><head><meta charset="utf-8"><title>競技一覧</title></head><body><a href="rel001.html">1</a></body></html>';
  return m;
}
function fake(map, log) { return async (u) => { const t = decodeURIComponent(u.slice((L.PROXY + '?url=').length)); log.push(t); assert(!/master|cond/.test(t), '飛ばすはずのページ: ' + t); return map[t] ? new Response(map[t], { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) : new Response('nf', { status: 404 }); }; }
const page = (m) => ({ url: B + 'tt.html', kind: 'html', html: m[B + 'tt.html'] });
let ok = 0; const check = async (n, f) => { await f(); ok++; console.log('  ✔ ' + n); };
console.log('[v0.26.4] まとめて取り込むの上限');
await check('上限は400（私学大会 結果376＋一覧1 = 377 回を50単位で切り上げ）', () => assert.equal(L.MAX_CRAWL, 400));
await check('結果 376 ページの大会を既定の上限で全部取れる・止まった分なし・競技者一覧やコンディションは取らない・重複なし', async () => {
  const m = site(376), log = []; const out = await L.crawlMeet(page(m), { fetch: fake(m, log), delay: 0 });
  assert.equal(out.results.length, 376); assert.equal(out.failed.length, 0); assert.equal(out.rest.length, 0); assert.equal(out.requests, 377); assert.equal(new Set(log).size, log.length);
});
await check('上限に達したら「失敗」ではなく rest に残し、続き（resume）で残りだけを取る', async () => {
  const m = site(50), log = []; const a = await L.crawlMeet(page(m), { fetch: fake(m, log), delay: 0, max: 20 });
  assert.equal(a.requests, 20); assert.equal(a.failed.length, 0); assert.equal(a.results.length + a.rest.length, 50);
  const b = await L.crawlMeet(page(m), { fetch: fake(m, log), delay: 0, resume: a.rest });
  assert.equal(b.rest.length, 0); assert.equal(new Set(a.results.concat(b.results).map(x => x.r.url)).size, 50); assert.equal(new Set(log).size, log.length);
});
await check('行儀：既定は同時2本・1件ごとに 120ms 待つ', () => { const s = fs.readFileSync(path.join(here, '../src/urlload.js'), 'utf8'); assert.match(s, /wait = o\.delay == null \? 120/); assert.match(s, /conc = o\.conc \|\| 2/); });
console.log('v0.26.4 URL上限 OK ' + ok);
